import { createHash, randomUUID } from "node:crypto";
import type {
  Event,
  EvidenceRef,
  Feedback,
  MerakiPack,
  ProfileAtom,
  RetrievalCandidate,
  Scope,
  SourceRecord,
  TaskContext,
  UpdateProposal
} from "@meraki/contracts";
import {
  EvidenceLedger,
  type EvidenceChain,
  type EvidenceLedgerSnapshot,
  type ExplicitActivityInput,
  type ModelOutputInput,
  type ObjectiveOutcomeInput
} from "../evidence/index.js";
import { compileGuidance } from "../guidance/index.js";
import { ProfileGraph } from "../profile/index.js";
import { canonicalJson, parseScope } from "../domain/index.js";

export type CorrectionInput = {
  tenantId: string;
  subjectId: string;
  actorId: string;
  runId: string;
  taskType: string;
  scope: Scope;
  mode?: string;
  original: string;
  correction: string;
  source?: string;
};

export type ImmutableCorrection = Readonly<{
  feedback: Feedback;
  source: SourceRecord;
  event: Event;
  eventId: string;
  original: string;
  correction: string;
  taskType: string;
  scope: Scope;
  mode?: string;
  contentHash: string;
}>;

export type Lesson = ProfileAtom &
  Readonly<{ guidance: string; sourceEventId: string; observationId: string; signalId: string; hypothesisId: string }>;
export type ActivityLessonInput = Readonly<{
  eventId: string;
  claim: string;
  facet?: ProfileAtom["facet"];
  temporalHorizon?: ProfileAtom["temporal_horizon"];
}>;

export type LearningTrace = Readonly<{
  source: SourceRecord;
  event: Event;
  observation?: { id: string; description: string; epistemicClass: string };
  signal?: { id: string; kind: string; support: number; confidence: number };
  hypothesis?: { id: string; claim: string; confidence: number };
  atom?: ProfileAtom;
}>;

export type GovernedUpdateProposal = Readonly<{
  proposal: UpdateProposal;
  targetBefore: ProfileAtom;
  evidenceEventId: string;
  appliedVersion?: number;
}>;
export type UpdateOperation = Extract<UpdateProposal["operation"], "reinforce" | "weaken">;
export type LearningEngineSnapshot = Readonly<{
  evidence: ImmutableCorrection[];
  lessons: Lesson[];
  evidenceLedger: EvidenceLedgerSnapshot;
  profile: ReturnType<ProfileGraph["snapshot"]>;
  updateProposals?: GovernedUpdateProposal[];
}>;

const digest = (value: string): `sha256:${string}` => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const now = (): string => new Date().toISOString();
const ref = (eventId: string, text: string): EvidenceRef => ({
  event_id: eventId,
  span_start: 0,
  span_end: text.length,
  quote_hash: digest(text)
});
const requiresSecurityReview = (event: Event): boolean =>
  Array.isArray(event.payload.security_flags) && event.payload.security_flags.includes("prompt_injection_suspected");
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
};

/** Deterministic in-memory vertical slice used by adapters and tests. Persistence adapters can implement the same contract. */
export class LearningEngine {
  private readonly evidence = new Map<string, ImmutableCorrection>();
  private readonly lessons = new Map<string, Lesson>();
  private readonly updateProposalRecords = new Map<string, GovernedUpdateProposal>();
  private evidenceLedger = new EvidenceLedger();
  private profile = new ProfileGraph();

  recordCorrection(input: CorrectionInput): ImmutableCorrection {
    const chain = this.evidenceLedger.ingestExplicitCorrection(input);
    const eventId = chain.event.id;
    // The evidence ledger deliberately deduplicates retried ingestion. Preserve that
    // idempotency at the learning layer too: otherwise a retry would manufacture a
    // new Feedback record and silently replace the original event wrapper.
    const existing = this.evidence.get(eventId);
    if (existing) return existing;
    const contentHash = chain.source.content_hash;
    const scope = parseScope(chain.event.payload.scope);
    const feedback: Feedback = {
      contract: "feedback",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      run_id: input.runId,
      actor_id: input.actorId,
      feedback_type: "correction",
      content: input.correction,
      created_at: now()
    };
    const evidence: ImmutableCorrection = deepFreeze({
      feedback,
      source: chain.source,
      event: chain.event,
      eventId,
      original: input.original,
      correction: input.correction,
      taskType: input.taskType,
      scope,
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      contentHash
    });
    this.evidence.set(eventId, evidence);
    return evidence;
  }

  recordActivity(input: ExplicitActivityInput): EvidenceChain {
    const chain = this.evidenceLedger.ingestExplicitActivity(input);
    // Suspicious content remains available for audit, but must not become an
    // observation merely as a side effect of ingestion.
    try {
      this.evidenceLedger.observeExplicitActivity(chain.event.id);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "POTENTIAL_PROMPT_INJECTION_REVIEW_REQUIRED") throw error;
    }
    return chain;
  }
  recordOutcome(input: ObjectiveOutcomeInput): EvidenceChain {
    const chain = this.evidenceLedger.ingestObjectiveOutcome(input);
    try {
      this.evidenceLedger.observeExplicitActivity(chain.event.id);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "POTENTIAL_PROMPT_INJECTION_REVIEW_REQUIRED") throw error;
    }
    return chain;
  }
  recordModelOutput(input: ModelOutputInput): EvidenceChain {
    return this.evidenceLedger.ingestModelOutput(input);
  }

  extractLesson(eventId: string): Lesson {
    const evidence = this.evidence.get(eventId);
    if (!evidence) throw new Error("EVIDENCE_NOT_FOUND");
    // Extraction is commonly retried independently of ingestion. A source event
    // represents one correction, so it must not fan out into duplicate atoms.
    const existing = [...this.lessons.values()].find((lesson) => lesson.sourceEventId === eventId);
    if (existing) return existing;
    const observation = this.evidenceLedger.observeCorrection(eventId);
    const signal = this.evidenceLedger.signalCorrection(observation.id, evidence.scope);
    const hypothesis = this.evidenceLedger.proposeHypothesis(
      signal.id,
      `For ${evidence.taskType}, prefer: ${evidence.correction}`
    );
    const atom = this.profile.createCandidate({
      tenantId: evidence.feedback.tenant_id,
      subjectId: evidence.feedback.subject_id,
      facet: "workflow",
      claim: hypothesis.claim,
      epistemicClass: "declared",
      scope: evidence.scope,
      ...(evidence.mode === undefined ? {} : { mode: evidence.mode }),
      temporalHorizon: "ongoing",
      evidence: [ref(evidence.eventId, evidence.correction)]
    });
    const lesson: Lesson = Object.freeze({
      ...atom,
      guidance: hypothesis.claim,
      sourceEventId: evidence.eventId,
      observationId: observation.id,
      signalId: signal.id,
      hypothesisId: hypothesis.id
    });
    this.lessons.set(atom.id, lesson);
    return lesson;
  }

  /** Turns cited explicit activity or objective outcome into a governed candidate; it never activates it. */
  extractActivityLesson(input: ActivityLessonInput): Lesson {
    if (typeof input.claim !== "string" || !input.claim.trim()) throw new Error("CLAIM_REQUIRED");
    const event = this.evidenceLedger.getEvent(input.eventId);
    const source = this.evidenceLedger.getSource(event.source_id);
    if (source.trust_class !== "explicit_user" && source.trust_class !== "objective_outcome")
      throw new Error("ACTIVITY_LESSON_TRUST_REQUIRED");
    if (requiresSecurityReview(event)) throw new Error("POTENTIAL_PROMPT_INJECTION_REVIEW_REQUIRED");
    const scope = parseScope(event.payload.scope);
    const existing = [...this.lessons.values()].find((lesson) => lesson.sourceEventId === event.id);
    if (existing) {
      if (existing.guidance !== input.claim) throw new Error("ACTIVITY_LESSON_CLAIM_CONFLICT");
      return existing;
    }
    const observation = this.evidenceLedger.observeExplicitActivity(event.id);
    const signal = this.evidenceLedger.signalExplicitActivity(observation.id, scope);
    const hypothesis = this.evidenceLedger.proposeHypothesis(signal.id, input.claim);
    const atom = this.profile.createCandidate({
      tenantId: event.tenant_id,
      subjectId: event.subject_id,
      facet: input.facet ?? "workflow",
      claim: hypothesis.claim,
      epistemicClass: source.trust_class === "objective_outcome" ? "objective" : "observed",
      scope,
      ...(typeof event.payload.mode === "string" ? { mode: event.payload.mode } : {}),
      temporalHorizon: input.temporalHorizon ?? "ongoing",
      evidence: [...hypothesis.evidence]
    });
    const lesson: Lesson = Object.freeze({
      ...atom,
      guidance: atom.claim,
      sourceEventId: event.id,
      observationId: observation.id,
      signalId: signal.id,
      hypothesisId: hypothesis.id
    });
    this.lessons.set(atom.id, lesson);
    return lesson;
  }

  approve(lessonId: string, expectedVersion = 1): Lesson {
    const lesson = this.requireLesson(lessonId);
    const atom = this.profile.activate(lessonId, expectedVersion);
    const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  edit(lessonId: string, claim: string, expectedVersion: number): Lesson {
    if (!claim.trim()) throw new Error("CLAIM_REQUIRED");
    const lesson = this.requireLesson(lessonId);
    const atom = this.profile.amendClaim(lessonId, claim, expectedVersion);
    const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  revoke(lessonId: string, expectedVersion: number): Lesson {
    const lesson = this.requireLesson(lessonId);
    const atom = this.profile.revoke(lessonId, expectedVersion);
    const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  rescope(lessonId: string, scope: Scope, mode: string | undefined, expectedVersion: number): Lesson {
    const lesson = this.requireLesson(lessonId);
    const atom = this.profile.rescope(lessonId, scope, mode, expectedVersion);
    const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  supersede(lessonId: string, expectedVersion: number): Lesson {
    const lesson = this.requireLesson(lessonId);
    const atom = this.profile.supersede(lessonId, expectedVersion);
    const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  weaken(lessonId: string, counterevidenceEventId: string, expectedVersion: number): Lesson {
    const lesson = this.requireLesson(lessonId);
    const event = this.evidenceLedger.getEvent(counterevidenceEventId);
    const source = this.evidenceLedger.getSource(event.source_id);
    if (event.tenant_id !== lesson.tenant_id || event.subject_id !== lesson.subject_id)
      throw new Error("COUNTEREVIDENCE_SUBJECT_MISMATCH");
    this.assertEvidenceCompatibility(lesson, event, "COUNTEREVIDENCE_SCOPE_MISMATCH", "COUNTEREVIDENCE_MODE_MISMATCH");
    if (source.trust_class !== "explicit_user" && source.trust_class !== "objective_outcome")
      throw new Error("COUNTEREVIDENCE_TRUST_REQUIRED");
    if (requiresSecurityReview(event)) throw new Error("COUNTEREVIDENCE_REVIEW_REQUIRED");
    const span = event.evidence_spans[0];
    if (!span) throw new Error("COUNTEREVIDENCE_SPAN_REQUIRED");
    const atom = this.profile.weaken(lessonId, span, expectedVersion);
    const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  split(lessonId: string, claims: readonly string[], expectedVersion: number): Lesson[] {
    const lesson = this.requireLesson(lessonId);
    const atoms = this.profile.split(lessonId, claims, expectedVersion);
    const superseded = this.profile.current(lessonId);
    this.lessons.set(lessonId, Object.freeze({ ...lesson, ...superseded, guidance: superseded.claim }));
    return atoms.map((atom) => {
      const next = Object.freeze({ ...lesson, ...atom, guidance: atom.claim });
      this.lessons.set(atom.id, next);
      return next;
    });
  }

  proposeUpdate(lessonId: string, evidenceEventId: string, operation: UpdateOperation): UpdateProposal {
    if (operation !== "reinforce" && operation !== "weaken") throw new Error("UPDATE_OPERATION_INVALID");
    const lesson = this.requireLesson(lessonId);
    const targetBefore = this.profile.current(lessonId);
    if (targetBefore.lifecycle !== "active") throw new Error("ACTIVE_ATOM_REQUIRED");
    const event = this.evidenceLedger.getEvent(evidenceEventId);
    const source = this.evidenceLedger.getSource(event.source_id);
    if (event.tenant_id !== lesson.tenant_id || event.subject_id !== lesson.subject_id)
      throw new Error("UPDATE_EVIDENCE_SUBJECT_MISMATCH");
    this.assertEvidenceCompatibility(lesson, event, "UPDATE_EVIDENCE_SCOPE_MISMATCH", "UPDATE_EVIDENCE_MODE_MISMATCH");
    if (source.trust_class !== "explicit_user" && source.trust_class !== "objective_outcome")
      throw new Error("UPDATE_EVIDENCE_TRUST_REQUIRED");
    if (requiresSecurityReview(event)) throw new Error("UPDATE_EVIDENCE_REVIEW_REQUIRED");
    const evidence = event.evidence_spans[0];
    if (!evidence) throw new Error("UPDATE_EVIDENCE_SPAN_REQUIRED");
    const proposal: UpdateProposal = Object.freeze({
      contract: "update_proposal",
      id: randomUUID(),
      tenant_id: lesson.tenant_id,
      subject_id: lesson.subject_id,
      operation,
      target: { id: lessonId, version: targetBefore.version },
      evidence: [evidence],
      expected_impact:
        operation === "reinforce"
          ? "Increase utility only for this already-scoped active atom."
          : "Reduce confidence only for this atom using the cited counterevidence.",
      status: "pending",
      expected_version: targetBefore.version,
      created_at: now()
    });
    this.updateProposalRecords.set(proposal.id, Object.freeze({ proposal, targetBefore, evidenceEventId }));
    return proposal;
  }

  applyUpdateProposal(proposalId: string): { proposal: UpdateProposal; atom: ProfileAtom } {
    const record = this.requireUpdateProposal(proposalId);
    if (record.proposal.status !== "pending") throw new Error("UPDATE_PROPOSAL_NOT_PENDING");
    const atom =
      record.proposal.operation === "reinforce"
        ? this.profile.reinforce(record.proposal.target.id, record.proposal.expected_version)
        : this.weaken(record.proposal.target.id, record.evidenceEventId, record.proposal.expected_version);
    const proposal = Object.freeze({ ...record.proposal, status: "applied" as const });
    this.updateProposalRecords.set(proposalId, Object.freeze({ ...record, proposal, appliedVersion: atom.version }));
    const lesson = this.requireLesson(atom.id);
    this.lessons.set(atom.id, Object.freeze({ ...lesson, ...atom, guidance: atom.claim }));
    return { proposal, atom };
  }

  rejectUpdateProposal(proposalId: string): UpdateProposal {
    const record = this.requireUpdateProposal(proposalId);
    if (record.proposal.status !== "pending") throw new Error("UPDATE_PROPOSAL_NOT_PENDING");
    const proposal = Object.freeze({ ...record.proposal, status: "rejected" as const });
    this.updateProposalRecords.set(proposalId, Object.freeze({ ...record, proposal }));
    return proposal;
  }

  rollbackUpdateProposal(proposalId: string): { proposal: UpdateProposal; atom: ProfileAtom } {
    const record = this.requireUpdateProposal(proposalId);
    if (record.proposal.status !== "applied" || record.appliedVersion === undefined)
      throw new Error("UPDATE_PROPOSAL_NOT_APPLIED");
    const atom = this.profile.restore(record.proposal.target.id, record.appliedVersion, record.targetBefore);
    const proposal = Object.freeze({ ...record.proposal, status: "rolled_back" as const });
    this.updateProposalRecords.set(proposalId, Object.freeze({ ...record, proposal }));
    const lesson = this.requireLesson(atom.id);
    this.lessons.set(atom.id, Object.freeze({ ...lesson, ...atom, guidance: atom.claim }));
    return { proposal, atom };
  }

  retrieve(context: TaskContext): { candidates: RetrievalCandidate[]; pack: MerakiPack } {
    return compileGuidance(
      this.profile
        .all()
        .filter(
          (atom) =>
            atom.tenant_id === context.tenant_id &&
            atom.subject_id === context.subject_id &&
            atom.sensitivity !== "prohibited_inference" &&
            (atom.sensitivity !== "sensitive" || context.permissions.includes("read:sensitive"))
        ),
      context
    );
  }

  getEvidence(eventId: string): ImmutableCorrection {
    const evidence = this.evidence.get(eventId);
    if (!evidence) throw new Error("EVIDENCE_NOT_FOUND");
    return evidence;
  }
  learningTrace(eventId: string): LearningTrace {
    const event = this.evidenceLedger.getEvent(eventId);
    const source = this.evidenceLedger.getSource(event.source_id);
    const lesson = [...this.lessons.values()].find((candidate) => candidate.sourceEventId === eventId);
    const discoveredObservation = this.evidenceLedger.findObservationForEvent(eventId);
    if (!lesson)
      return {
        source,
        event,
        ...(discoveredObservation === undefined
          ? {}
          : {
              observation: {
                id: discoveredObservation.id,
                description: discoveredObservation.description,
                epistemicClass: discoveredObservation.epistemic_class
              }
            })
      };
    const observation = this.evidenceLedger.getObservation(lesson.observationId);
    const signal = this.evidenceLedger.getSignal(lesson.signalId);
    const hypothesis = this.evidenceLedger.getHypothesis(lesson.hypothesisId);
    return {
      source,
      event,
      observation: {
        id: observation.id,
        description: observation.description,
        epistemicClass: observation.epistemic_class
      },
      signal: { id: signal.id, kind: signal.kind, support: signal.support, confidence: signal.confidence },
      hypothesis: { id: hypothesis.id, claim: hypothesis.claim, confidence: hypothesis.confidence },
      atom: this.profile.current(lesson.id)
    };
  }
  learningTraceForAtom(atomId: string): LearningTrace {
    const lesson = this.requireLesson(atomId);
    const event = this.evidenceLedger.getEvent(lesson.sourceEventId);
    const source = this.evidenceLedger.getSource(event.source_id);
    const observation = this.evidenceLedger.getObservation(lesson.observationId);
    const signal = this.evidenceLedger.getSignal(lesson.signalId);
    const hypothesis = this.evidenceLedger.getHypothesis(lesson.hypothesisId);
    return {
      source,
      event,
      observation: {
        id: observation.id,
        description: observation.description,
        epistemicClass: observation.epistemic_class
      },
      signal: { id: signal.id, kind: signal.kind, support: signal.support, confidence: signal.confidence },
      hypothesis: { id: hypothesis.id, claim: hypothesis.claim, confidence: hypothesis.confidence },
      atom: this.profile.current(lesson.id)
    };
  }
  getProfileAtoms(): ProfileAtom[] {
    return this.profile.all();
  }
  updateProposals(): UpdateProposal[] {
    return [...this.updateProposalRecords.values()]
      .map((record) => record.proposal)
      .sort((left, right) => right.created_at.localeCompare(left.created_at));
  }
  getProfileRevisions(lessonId: string): readonly ProfileAtom[] {
    return this.profile.revisions(lessonId);
  }
  snapshot(): LearningEngineSnapshot {
    return {
      evidence: [...this.evidence.values()],
      lessons: [...this.lessons.values()],
      evidenceLedger: this.evidenceLedger.snapshot(),
      profile: this.profile.snapshot(),
      updateProposals: [...this.updateProposalRecords.values()]
    };
  }
  static fromSnapshot(snapshot: LearningEngineSnapshot): LearningEngine {
    const engine = new LearningEngine();
    engine.evidenceLedger = EvidenceLedger.fromSnapshot(snapshot.evidenceLedger);
    engine.profile = ProfileGraph.fromSnapshot(snapshot.profile);
    for (const evidence of snapshot.evidence) {
      const scope = parseScope(evidence.scope);
      const event = engine.evidenceLedger.getEvent(evidence.eventId);
      const source = engine.evidenceLedger.getSource(event.source_id);
      const eventScope = parseScope(event.payload.scope);
      if (
        engine.evidence.has(evidence.eventId) ||
        evidence.event.id !== evidence.eventId ||
        evidence.source.id !== source.id ||
        canonicalJson(evidence.event) !== canonicalJson(event) ||
        canonicalJson(evidence.source) !== canonicalJson(source) ||
        evidence.feedback.tenant_id !== event.tenant_id ||
        evidence.feedback.subject_id !== event.subject_id ||
        evidence.feedback.run_id !== event.payload.run_id ||
        evidence.feedback.actor_id !== event.payload.actor_id ||
        evidence.feedback.content !== event.payload.correction ||
        evidence.source.tenant_id !== event.tenant_id ||
        evidence.source.subject_id !== event.subject_id ||
        evidence.original !== event.payload.original ||
        evidence.correction !== event.payload.correction ||
        evidence.taskType !== event.payload.task_type ||
        evidence.mode !== event.payload.mode ||
        scope.level !== eventScope.level ||
        scope.ref !== eventScope.ref
      )
        throw new Error("SNAPSHOT_CORRECTION_LINEAGE_INVALID");
      engine.evidence.set(evidence.eventId, deepFreeze(evidence));
    }
    for (const lesson of snapshot.lessons) {
      const atom = engine.profile.current(lesson.id);
      const event = engine.evidenceLedger.getEvent(lesson.sourceEventId);
      const scope = parseScope(lesson.scope);
      const evidenceScope = parseScope(event.payload.scope);
      const { guidance, sourceEventId, observationId, signalId, hypothesisId, ...lessonAtom } = lesson;
      const observation = engine.evidenceLedger.getObservation(observationId);
      const signal = engine.evidenceLedger.getSignal(signalId);
      const hypothesis = engine.evidenceLedger.getHypothesis(hypothesisId);
      if (
        engine.lessons.has(lesson.id) ||
        guidance !== atom.claim ||
        sourceEventId !== event.id ||
        canonicalJson(lessonAtom) !== canonicalJson(atom) ||
        atom.tenant_id !== lesson.tenant_id ||
        atom.subject_id !== lesson.subject_id ||
        atom.version !== lesson.version ||
        atom.lifecycle !== lesson.lifecycle ||
        event.tenant_id !== lesson.tenant_id ||
        event.subject_id !== lesson.subject_id ||
        scope.level !== atom.scope.level ||
        scope.ref !== atom.scope.ref ||
        observation.tenant_id !== lesson.tenant_id ||
        observation.subject_id !== lesson.subject_id ||
        !observation.event_ids.includes(event.id) ||
        signal.tenant_id !== lesson.tenant_id ||
        signal.subject_id !== lesson.subject_id ||
        !signal.observation_ids.includes(observation.id) ||
        signal.scope.level !== evidenceScope.level ||
        signal.scope.ref !== evidenceScope.ref ||
        hypothesis.tenant_id !== lesson.tenant_id ||
        hypothesis.subject_id !== lesson.subject_id ||
        hypothesis.scope.level !== evidenceScope.level ||
        hypothesis.scope.ref !== evidenceScope.ref ||
        !hypothesis.evidence.some((reference) => reference.event_id === event.id)
      )
        throw new Error("SNAPSHOT_LESSON_LINEAGE_INVALID");
      engine.lessons.set(lesson.id, deepFreeze(lesson));
    }
    for (const proposal of snapshot.updateProposals ?? []) {
      const targetRevision = engine.profile
        .revisions(proposal.targetBefore.id)
        .find((atom) => atom.version === proposal.targetBefore.version);
      const evidenceEvent = engine.evidenceLedger.getEvent(proposal.evidenceEventId);
      if (
        engine.updateProposalRecords.has(proposal.proposal.id) ||
        (proposal.proposal.operation !== "reinforce" && proposal.proposal.operation !== "weaken") ||
        proposal.proposal.target.id !== proposal.targetBefore.id ||
        proposal.proposal.target.version !== proposal.targetBefore.version ||
        proposal.proposal.expected_version !== proposal.targetBefore.version ||
        proposal.proposal.tenant_id !== proposal.targetBefore.tenant_id ||
        proposal.proposal.subject_id !== proposal.targetBefore.subject_id ||
        !targetRevision ||
        canonicalJson(targetRevision) !== canonicalJson(proposal.targetBefore) ||
        evidenceEvent.tenant_id !== proposal.proposal.tenant_id ||
        evidenceEvent.subject_id !== proposal.proposal.subject_id ||
        (proposal.proposal.status === "applied" && proposal.appliedVersion === undefined) ||
        (proposal.proposal.status !== "applied" &&
          proposal.proposal.status !== "rolled_back" &&
          proposal.appliedVersion !== undefined)
      )
        throw new Error("SNAPSHOT_UPDATE_PROPOSAL_INVALID");
      engine.updateProposalRecords.set(proposal.proposal.id, deepFreeze(proposal));
    }
    return engine;
  }
  private requireLesson(id: string): Lesson {
    const lesson = this.lessons.get(id);
    if (!lesson) throw new Error("LESSON_NOT_FOUND");
    return lesson;
  }
  private assertEvidenceCompatibility(lesson: Lesson, event: Event, scopeError: string, modeError: string): void {
    let eventScope: Scope;
    try {
      eventScope = parseScope(event.payload.scope);
    } catch {
      throw new Error(scopeError);
    }
    if (eventScope.level !== lesson.scope.level || eventScope.ref !== lesson.scope.ref) throw new Error(scopeError);
    if (lesson.mode !== undefined && event.payload.mode !== lesson.mode) throw new Error(modeError);
  }
  private requireUpdateProposal(id: string): GovernedUpdateProposal {
    const proposal = this.updateProposalRecords.get(id);
    if (!proposal) throw new Error("UPDATE_PROPOSAL_NOT_FOUND");
    return proposal;
  }
}
