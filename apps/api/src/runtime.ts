import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import type { Attribution, Evaluation, MerakiPack, Scope, TaskContext } from "@meraki/contracts";
import { LearningEngine, type ActivityLessonInput, type CorrectionInput, type ImmutableCorrection, type LearningEngineSnapshot, type UpdateOperation } from "@meraki/learning";
import type { ExplicitActivityInput, ObjectiveOutcomeInput } from "@meraki/evidence";

export type AgentRunInput = {
  context: TaskContext;
  request: string;
  baseline: string;
};

export type AgentTrace = Readonly<{
  runId: string;
  packId: string;
  packHash: string;
  appliedAtomIds: string[];
  changed: boolean;
  explanation: string;
  taskContextDigest: string;
  candidates: Array<{ atomId: string; version: number; decision: string; reasons: string[]; scores: Record<string, unknown> }>;
  provenance: Array<{ atomId: string; evidenceEventIds: string[] }>;
}>;

export type AgentRunResult = Readonly<{
  output: string;
  baseline: string;
  pack: MerakiPack;
  trace: AgentTrace;
}>;

export type RecordedRun = Readonly<{
  run: AgentRunResult;
  context: TaskContext;
  request: string;
  recordedAt: string;
}>;

export type EvaluationInput = Readonly<{
  runId: string;
  experimentId: string;
  armId: string;
  evaluatorClass: Evaluation["evaluator_class"];
  criteria: Record<string, unknown>;
  result: Evaluation["result"];
  uncertainty: number;
  reason?: string;
  evaluatorIdentityDigest?: string;
}>;
export type RecordedEvaluation = Readonly<{ runId: string; evaluation: Evaluation; attribution?: Attribution; effective: boolean }>;
export type ConnectedRuntimeSnapshot = Readonly<{ engine: LearningEngineSnapshot; runs: RecordedRun[]; evaluations: RecordedEvaluation[] }>;
export type ConnectedCausalInput = Readonly<{ correction: CorrectionInput; related: AgentRunInput; unrelated: AgentRunInput; experimentId?: string }>;
export type ConnectedCausalArm = Readonly<{ related: AgentRunResult; unrelated: AgentRunResult; tokenCount: number }>;
export type ConnectedCausalComparison = Readonly<{
  experimentId: string;
  guidance: string;
  arms: Readonly<{ baseline: ConnectedCausalArm; rawMemory: ConnectedCausalArm; merakiPack: ConnectedCausalArm; ablatedPack: ConnectedCausalArm }>;
  objectiveRecords: Readonly<{ merakiRelated: RecordedEvaluation; ablatedRelated: RecordedEvaluation }>;
  relatedImproves: boolean;
  unrelatedUnaffected: boolean;
  targetedAblationRemovesImprovement: boolean;
}>;

const evaluationPriority = (evaluatorClass: Evaluation["evaluator_class"]): number => evaluatorClass === "human_blind" ? 3 : evaluatorClass === "objective" ? 2 : 1;
const effectFromResult = (result: Evaluation["result"]): number => result === "win" ? 1 : result === "loss" ? -1 : 0;
const digest = (value: string): `sha256:${string}` => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const tokenCount = (value: string): number => value.trim() ? value.trim().split(/\s+/).length : 0;

/** Adapter-neutral connected-agent runtime. A model adapter can replace render() while retaining the Meraki trace. */
export class ConnectedAgentRuntime {
  private readonly runLedger: RecordedRun[] = [];
  private readonly evaluationLedger: RecordedEvaluation[] = [];
  constructor(private readonly engine: LearningEngine = new LearningEngine()) {}

  correction(input: CorrectionInput): ImmutableCorrection {
    return this.engine.recordCorrection(input);
  }
  activity(input: ExplicitActivityInput) { return this.engine.recordActivity(input); }
  outcome(input: ObjectiveOutcomeInput) { return this.engine.recordOutcome(input); }

  learn(input: CorrectionInput) {
    return this.engine.learn(input);
  }
  extractActivityLesson(input: ActivityLessonInput) { return this.engine.extractActivityLesson(input); }

  run(input: AgentRunInput): AgentRunResult {
    const retrieved = this.engine.retrieve(input.context);
    const guidance = retrieved.pack.items.map((item) => item.guidance).join(" ");
    const output = guidance ? `${input.baseline}\nMeraki guidance applied: ${guidance}` : input.baseline;
    const runId = randomUUID();
    const atoms = this.engine.getProfileAtoms();
    const trace: AgentTrace = {
      runId,
      packId: retrieved.pack.id,
      packHash: retrieved.pack.hash,
      appliedAtomIds: retrieved.pack.atom_manifest.map((atom) => atom.id),
      changed: output !== input.baseline,
      explanation: guidance ? "Relevant active lessons were injected for this task context." : "No relevant active lesson was retrieved; baseline output preserved.",
      taskContextDigest: retrieved.pack.task_context_digest,
      candidates: retrieved.candidates.map((candidate) => ({ atomId: candidate.atom.id, version: candidate.atom.version, decision: candidate.decision, reasons: candidate.reasons, scores: candidate.scores })),
      provenance: retrieved.pack.atom_manifest.map((manifest) => ({ atomId: manifest.id, evidenceEventIds: atoms.find((atom) => atom.id === manifest.id)?.evidence.map((evidence) => evidence.event_id) ?? [] }))
    };
    const result = { output, baseline: input.baseline, pack: retrieved.pack, trace };
    this.runLedger.push(Object.freeze({ run: result, context: Object.freeze({ ...input.context }), request: input.request, recordedAt: new Date().toISOString() }));
    return result;
  }

  /** Equal-token raw-memory control: deliberately bypasses Meraki retrieval and may leak across contexts. */
  runRawMemory(input: AgentRunInput, rawMemory: string): AgentRunResult {
    if (!rawMemory.trim()) throw new Error("RAW_MEMORY_REQUIRED");
    const retrieved = this.engine.retrieve(input.context);
    const runId = randomUUID();
    const output = `${input.baseline}\nRaw memory applied: ${rawMemory}`;
    const trace: AgentTrace = {
      runId,
      packId: `raw-memory:${digest(rawMemory)}`,
      packHash: digest(rawMemory),
      appliedAtomIds: [],
      changed: true,
      explanation: "Equal-token raw memory control bypassed Meraki retrieval.",
      taskContextDigest: retrieved.pack.task_context_digest,
      candidates: [],
      provenance: []
    };
    const result = { output, baseline: input.baseline, pack: retrieved.pack, trace };
    this.runLedger.push(Object.freeze({ run: result, context: Object.freeze({ ...input.context }), request: input.request, recordedAt: new Date().toISOString() }));
    return result;
  }

  recordEvaluation(input: EvaluationInput): RecordedEvaluation {
    if (input.uncertainty < 0 || input.uncertainty > 1) throw new Error("EVALUATION_UNCERTAINTY_INVALID");
    const run = this.getRun(input.runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const evaluation: Evaluation = Object.freeze({ contract: "evaluation", id: randomUUID(), tenant_id: run.context.tenant_id, subject_id: run.context.subject_id, experiment_id: input.experimentId, arm_id: input.armId, evaluator_class: input.evaluatorClass, ...(input.evaluatorIdentityDigest === undefined ? {} : { evaluator_identity_digest: input.evaluatorIdentityDigest as `sha256:${string}` }), criteria: input.criteria, result: input.result, ...(input.reason === undefined ? {} : { reason: input.reason }), uncertainty: input.uncertainty, created_at: new Date().toISOString() });
    const target = run.run.trace.candidates.find((candidate) => candidate.decision === "included");
    const attribution = target ? Object.freeze({ contract: "attribution" as const, id: randomUUID(), tenant_id: evaluation.tenant_id, subject_id: evaluation.subject_id, evaluation_ids: [evaluation.id], target: { id: target.atomId, version: target.version }, effect: effectFromResult(evaluation.result), uncertainty: evaluation.uncertainty, created_at: evaluation.created_at }) : undefined;
    const prior = this.evaluationLedger.filter((entry) => entry.runId === input.runId);
    const effective = prior.every((entry) => evaluationPriority(evaluation.evaluator_class) > evaluationPriority(entry.evaluation.evaluator_class) || (evaluationPriority(evaluation.evaluator_class) === evaluationPriority(entry.evaluation.evaluator_class) && evaluation.uncertainty < entry.evaluation.uncertainty));
    if (effective) for (const entry of prior) {
      const index = this.evaluationLedger.indexOf(entry);
      this.evaluationLedger[index] = Object.freeze({ ...entry, effective: false });
    }
    const recorded = Object.freeze({ runId: input.runId, evaluation, ...(attribution === undefined ? {} : { attribution }), effective });
    this.evaluationLedger.push(recorded);
    return recorded;
  }

  retrieve(context: TaskContext) { return this.engine.retrieve(context); }
  approve(lessonId: string, expectedVersion = 1) { return this.engine.approve(lessonId, expectedVersion); }
  edit(lessonId: string, claim: string, expectedVersion: number) { return this.engine.edit(lessonId, claim, expectedVersion); }
  revoke(lessonId: string, expectedVersion: number) { return this.engine.revoke(lessonId, expectedVersion); }
  rescope(lessonId: string, scope: Scope, mode: string | undefined, expectedVersion: number) { return this.engine.rescope(lessonId, scope, mode, expectedVersion); }
  supersede(lessonId: string, expectedVersion: number) { return this.engine.supersede(lessonId, expectedVersion); }
  weaken(lessonId: string, counterevidenceEventId: string, expectedVersion: number) { return this.engine.weaken(lessonId, counterevidenceEventId, expectedVersion); }
  split(lessonId: string, claims: readonly string[], expectedVersion: number) { return this.engine.split(lessonId, claims, expectedVersion); }
  proposeUpdate(lessonId: string, evidenceEventId: string, operation: UpdateOperation) { return this.engine.proposeUpdate(lessonId, evidenceEventId, operation); }
  applyUpdateProposal(proposalId: string) { return this.engine.applyUpdateProposal(proposalId); }
  rejectUpdateProposal(proposalId: string) { return this.engine.rejectUpdateProposal(proposalId); }
  rollbackUpdateProposal(proposalId: string) { return this.engine.rollbackUpdateProposal(proposalId); }
  profileAtoms() { return this.engine.getProfileAtoms(); }
  learningTrace(eventId: string) { return this.engine.learningTrace(eventId); }
  learningTraceForAtom(atomId: string) { return this.engine.learningTraceForAtom(atomId); }
  updateProposals() { return this.engine.updateProposals(); }
  recentRuns(): readonly RecordedRun[] { return [...this.runLedger].reverse(); }
  evaluations(): readonly RecordedEvaluation[] { return [...this.evaluationLedger].reverse(); }
  getRun(runId: string): RecordedRun | undefined { return this.runLedger.find((record) => record.run.trace.runId === runId); }
  snapshot(): ConnectedRuntimeSnapshot { return { engine: this.engine.snapshot(), runs: [...this.runLedger], evaluations: [...this.evaluationLedger] }; }
  static fromSnapshot(snapshot: ConnectedRuntimeSnapshot | LearningEngineSnapshot): ConnectedAgentRuntime {
    if (!("engine" in snapshot)) return new ConnectedAgentRuntime(LearningEngine.fromSnapshot(snapshot));
    const runtime = new ConnectedAgentRuntime(LearningEngine.fromSnapshot(snapshot.engine));
    runtime.runLedger.push(...snapshot.runs);
    runtime.evaluationLedger.push(...snapshot.evaluations);
    return runtime;
  }
}

/** Runs four actual connected-agent arms and records objective verdicts against the same expected guidance. */
export const evaluateConnectedCausalComparison = (input: ConnectedCausalInput): ConnectedCausalComparison => {
  const experimentId = input.experimentId ?? randomUUID();
  const baselineRuntime = new ConnectedAgentRuntime();
  const merakiRuntime = new ConnectedAgentRuntime();
  const receipt = merakiRuntime.learn(input.correction);
  const guidance = receipt.lesson.guidance;
  const ablatedRuntime = ConnectedAgentRuntime.fromSnapshot(merakiRuntime.snapshot());
  ablatedRuntime.revoke(receipt.lesson.id, receipt.lesson.version);
  const rawMemoryRuntime = new ConnectedAgentRuntime();
  const baseline: ConnectedCausalArm = { related: baselineRuntime.run(input.related), unrelated: baselineRuntime.run(input.unrelated), tokenCount: 0 };
  const rawMemory: ConnectedCausalArm = { related: rawMemoryRuntime.runRawMemory(input.related, guidance), unrelated: rawMemoryRuntime.runRawMemory(input.unrelated, guidance), tokenCount: tokenCount(guidance) };
  const merakiPack: ConnectedCausalArm = { related: merakiRuntime.run(input.related), unrelated: merakiRuntime.run(input.unrelated), tokenCount: tokenCount(guidance) };
  const ablatedPack: ConnectedCausalArm = { related: ablatedRuntime.run(input.related), unrelated: ablatedRuntime.run(input.unrelated), tokenCount: 0 };
  const merakiCorrect = merakiPack.related.output.includes(guidance);
  const ablatedCorrect = ablatedPack.related.output.includes(guidance);
  const merakiRelated = merakiRuntime.recordEvaluation({ runId: merakiPack.related.trace.runId, experimentId, armId: "meraki_pack", evaluatorClass: "objective", criteria: { expected_guidance: guidance, related: true }, result: merakiCorrect ? "win" : "loss", uncertainty: 0 });
  const ablatedRelated = ablatedRuntime.recordEvaluation({ runId: ablatedPack.related.trace.runId, experimentId, armId: "ablated_pack", evaluatorClass: "objective", criteria: { expected_guidance: guidance, related: true }, result: ablatedCorrect ? "win" : "loss", uncertainty: 0 });
  return {
    experimentId,
    guidance,
    arms: { baseline, rawMemory, merakiPack, ablatedPack },
    objectiveRecords: { merakiRelated, ablatedRelated },
    relatedImproves: !baseline.related.output.includes(guidance) && merakiCorrect,
    unrelatedUnaffected: merakiPack.unrelated.output === baseline.unrelated.baseline && rawMemory.unrelated.output.includes(guidance),
    targetedAblationRemovesImprovement: merakiCorrect && !ablatedCorrect
  };
};

/** Local persistence adapter for restart-proof development; PostgreSQL remains the production proof boundary. */
export class JsonConnectedRuntimeStore {
  constructor(private readonly path: string) {}
  async save(runtime: ConnectedAgentRuntime): Promise<void> {
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, JSON.stringify(runtime.snapshot(), null, 2), "utf8");
    await rename(temporary, this.path);
  }
  async load(): Promise<ConnectedAgentRuntime> {
    try { return ConnectedAgentRuntime.fromSnapshot(JSON.parse(await readFile(this.path, "utf8")) as ConnectedRuntimeSnapshot); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return new ConnectedAgentRuntime(); throw error; }
  }
}

export const scopeFromUnknown = (value: unknown): Scope => {
  if (!value || typeof value !== "object") throw new Error("SCOPE_REQUIRED");
  const candidate = value as { level?: unknown; ref?: unknown };
  if (typeof candidate.level !== "string") throw new Error("SCOPE_LEVEL_REQUIRED");
  return { level: candidate.level as Scope["level"], ...(typeof candidate.ref === "string" ? { ref: candidate.ref } : {}) };
};
