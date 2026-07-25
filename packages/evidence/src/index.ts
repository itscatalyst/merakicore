import { createHash, randomUUID } from "node:crypto";
import type {
  Consent,
  Event,
  EvidenceRef,
  Hypothesis,
  Observation,
  Scope,
  Signal,
  SourceRecord
} from "@meraki/contracts";

export type ExplicitCorrectionInput = Readonly<{
  tenantId: string;
  subjectId: string;
  actorId: string;
  runId: string;
  taskType: string;
  original: string;
  correction: string;
  scope: Scope;
  mode?: string;
  consent?: Consent;
}>;

export type ModelOutputInput = Readonly<{
  tenantId: string;
  subjectId: string;
  runId: string;
  output: string;
  scope: Scope;
  mode?: string;
}>;

export type ExplicitActivityType =
  | "approval"
  | "rejection"
  | "choice"
  | "correction"
  | "edit"
  | "example"
  | "workflow_action"
  | "outcome";

export type ExplicitActivityInput = Readonly<{
  tenantId: string;
  subjectId: string;
  actorId: string;
  runId: string;
  taskType: string;
  activityType: ExplicitActivityType;
  content: string;
  scope: Scope;
  mode?: string;
  payload?: Record<string, unknown>;
  consent?: Consent;
}>;

export type ObjectiveOutcomeInput = Readonly<{
  tenantId: string;
  subjectId: string;
  runId: string;
  outcomeType: string;
  outcome: Record<string, unknown>;
  scope: Scope;
  mode?: string;
}>;

export type EvidenceChain = Readonly<{
  source: SourceRecord;
  event: Event;
}>;

export type EvidenceLedgerSnapshot = Readonly<{
  sources: SourceRecord[];
  events: Event[];
  observations: Observation[];
  signals: Signal[];
  hypotheses: Hypothesis[];
  activityDeduplication: Array<{ key: string; chain: EvidenceChain }>;
  outcomeDeduplication?: Array<{ key: string; chain: EvidenceChain }>;
}>;

const digest = (value: string): `sha256:${string}` => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};
const now = (): string => new Date().toISOString();
const defaultConsent = (): Consent => ({ status: "granted", purposes: ["personalization"], recorded_at: now() });
const evidenceRef = (eventId: string, text: string): EvidenceRef => ({
  event_id: eventId,
  span_start: 0,
  span_end: text.length,
  quote_hash: digest(text)
});
const promptInjectionPatterns = [
  /ignore (all )?(previous|prior) instructions/i,
  /reveal (the )?(system|developer) prompt/i,
  /<\/?(?:system|developer|assistant)>/i,
  /jailbreak/i,
  /disregard (all )?(previous|prior) instructions/i
];

/** Records are retained for audit, but suspicious text cannot become an automatic observation or profile claim. */
export const isPromptInjectionSuspected = (content: string): boolean =>
  promptInjectionPatterns.some((pattern) => pattern.test(content));

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
};

/**
 * Append-only evidence ledger. It deliberately separates durable user evidence
 * from deterministic observations, aggregate signals, and falsifiable hypotheses.
 */
export class EvidenceLedger {
  private readonly sources = new Map<string, SourceRecord>();
  private readonly events = new Map<string, Event>();
  private readonly observations = new Map<string, Observation>();
  private readonly signals = new Map<string, Signal>();
  private readonly hypotheses = new Map<string, Hypothesis>();
  private readonly activityDeduplication = new Map<string, EvidenceChain>();
  private readonly outcomeDeduplication = new Map<string, EvidenceChain>();

  ingestExplicitCorrection(input: ExplicitCorrectionInput): EvidenceChain {
    if (!input.original.trim() || !input.correction.trim()) throw new Error("CORRECTION_TEXT_REQUIRED");
    return this.ingestActivity(
      {
        ...input,
        activityType: "correction",
        content: input.correction,
        payload: { original: input.original, correction: input.correction, kind: "correction" }
      },
      true
    );
  }

  ingestExplicitActivity(input: ExplicitActivityInput): EvidenceChain {
    return this.ingestActivity(input, false);
  }

  private ingestActivity(input: ExplicitActivityInput, allowCanonicalPayload: boolean): EvidenceChain {
    this.validateActivity(input, allowCanonicalPayload);
    if (!input.content.trim()) throw new Error("ACTIVITY_CONTENT_REQUIRED");
    const consent = input.consent ?? defaultConsent();
    if (consent.status !== "granted") throw new Error("CONSENT_REQUIRED");
    const key = digest(
      canonicalJson({
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        actorId: input.actorId,
        runId: input.runId,
        taskType: input.taskType,
        activityType: input.activityType,
        content: input.content,
        scope: input.scope,
        mode: input.mode,
        payload: input.payload ?? {}
      })
    );
    const existing = this.activityDeduplication.get(key);
    if (existing) return existing;

    const recordedAt = now();
    const securityFlags = isPromptInjectionSuspected(input.content) ? ["prompt_injection_suspected"] : [];
    const source: SourceRecord = deepFreeze({
      contract: "source_record",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      source_type: `explicit_${input.activityType}`,
      trust_class: "explicit_user",
      consent,
      content_hash: digest(input.content),
      created_at: recordedAt
    });
    const event: Event = deepFreeze({
      contract: "event",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      source_id: source.id,
      event_type: input.activityType,
      occurred_at: recordedAt,
      recorded_at: recordedAt,
      payload: {
        actor_id: input.actorId,
        run_id: input.runId,
        task_type: input.taskType,
        content: input.content,
        scope: input.scope,
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.payload ?? {}),
        ...(securityFlags.length ? { security_flags: securityFlags } : {})
      },
      evidence_spans: [evidenceRef("pending", input.content)]
    });
    const immutableEvent = deepFreeze({ ...event, evidence_spans: [evidenceRef(event.id, input.content)] });
    const chain = deepFreeze({ source, event: immutableEvent });
    this.sources.set(source.id, source);
    this.events.set(immutableEvent.id, immutableEvent);
    this.activityDeduplication.set(key, chain);
    return chain;
  }

  ingestObjectiveOutcome(input: ObjectiveOutcomeInput): EvidenceChain {
    this.validateOutcome(input);
    const key = digest(
      canonicalJson({
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        runId: input.runId,
        outcomeType: input.outcomeType,
        outcome: input.outcome,
        scope: input.scope,
        mode: input.mode
      })
    );
    const existing = this.outcomeDeduplication.get(key);
    if (existing) return existing;
    const recordedAt = now();
    const content = canonicalJson(input.outcome);
    const source: SourceRecord = deepFreeze({
      contract: "source_record",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      source_type: `objective_${input.outcomeType}`,
      trust_class: "objective_outcome",
      consent: defaultConsent(),
      content_hash: digest(content),
      created_at: recordedAt
    });
    const event: Event = deepFreeze({
      contract: "event",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      source_id: source.id,
      event_type: "outcome",
      occurred_at: recordedAt,
      recorded_at: recordedAt,
      payload: {
        run_id: input.runId,
        outcome_type: input.outcomeType,
        outcome: input.outcome,
        scope: input.scope,
        ...(input.mode === undefined ? {} : { mode: input.mode })
      },
      evidence_spans: [evidenceRef("pending", content)]
    });
    const immutableEvent = deepFreeze({ ...event, evidence_spans: [evidenceRef(event.id, content)] });
    const chain = deepFreeze({ source, event: immutableEvent });
    this.sources.set(source.id, source);
    this.events.set(immutableEvent.id, immutableEvent);
    this.outcomeDeduplication.set(key, chain);
    return chain;
  }

  ingestModelOutput(input: ModelOutputInput): EvidenceChain {
    if (!input.output.trim()) throw new Error("MODEL_OUTPUT_REQUIRED");
    const recordedAt = now();
    const source: SourceRecord = deepFreeze({
      contract: "source_record",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      source_type: "model_output",
      trust_class: "model_generated",
      consent: defaultConsent(),
      content_hash: digest(input.output),
      created_at: recordedAt
    });
    const event: Event = deepFreeze({
      contract: "event",
      id: randomUUID(),
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      source_id: source.id,
      event_type: "model_output",
      occurred_at: recordedAt,
      recorded_at: recordedAt,
      payload: {
        run_id: input.runId,
        output: input.output,
        scope: input.scope,
        ...(input.mode === undefined ? {} : { mode: input.mode })
      },
      evidence_spans: [evidenceRef("pending", input.output)]
    });
    const immutableEvent = deepFreeze({ ...event, evidence_spans: [evidenceRef(event.id, input.output)] });
    const chain = deepFreeze({ source, event: immutableEvent });
    this.sources.set(source.id, source);
    this.events.set(immutableEvent.id, immutableEvent);
    return chain;
  }

  observeCorrection(eventId: string): Observation {
    const event = this.requireEvent(eventId);
    const source = this.requireSource(event.source_id);
    if (source.trust_class === "model_generated") throw new Error("MODEL_OUTPUT_NOT_USER_EVIDENCE");
    if (event.payload.kind !== "correction") throw new Error("CORRECTION_EVENT_REQUIRED");
    return this.observeExplicitActivity(eventId);
  }

  observeExplicitActivity(eventId: string): Observation {
    const event = this.requireEvent(eventId);
    const source = this.requireSource(event.source_id);
    if (source.trust_class === "model_generated") throw new Error("MODEL_OUTPUT_NOT_USER_EVIDENCE");
    if (
      source.trust_class !== "explicit_user" &&
      source.trust_class !== "objective_outcome" &&
      source.trust_class !== "observed_behavior"
    )
      throw new Error("UNTRUSTED_SOURCE");
    if (
      Array.isArray(event.payload.security_flags) &&
      event.payload.security_flags.includes("prompt_injection_suspected")
    )
      throw new Error("POTENTIAL_PROMPT_INJECTION_REVIEW_REQUIRED");
    const existing = [...this.observations.values()].find(
      (observation) => observation.event_ids.length === 1 && observation.event_ids[0] === eventId
    );
    if (existing) return existing;
    const content =
      typeof event.payload.content === "string"
        ? event.payload.content
        : JSON.stringify(event.payload.outcome ?? event.payload);
    const observation: Observation = deepFreeze({
      contract: "observation",
      id: randomUUID(),
      tenant_id: event.tenant_id,
      subject_id: event.subject_id,
      event_ids: [event.id],
      description: content,
      extractor: "deterministic-activity-observer",
      extractor_version: "1",
      epistemic_class: source.trust_class === "objective_outcome" ? "deterministic" : "direct",
      alternatives: [],
      created_at: now()
    });
    this.observations.set(observation.id, observation);
    return observation;
  }

  signalCorrection(observationId: string, scope: Scope): Signal {
    return this.signalExplicitActivity(observationId, scope, "explicit_correction");
  }

  signalExplicitActivity(observationId: string, scope: Scope, kind = "explicit_activity"): Signal {
    const observation = this.requireObservation(observationId);
    const existing = [...this.signals.values()].find(
      (signal) =>
        signal.observation_ids.length === 1 && signal.observation_ids[0] === observationId && signal.kind === kind
    );
    if (existing) return existing;
    const signal: Signal = deepFreeze({
      contract: "signal",
      id: randomUUID(),
      tenant_id: observation.tenant_id,
      subject_id: observation.subject_id,
      observation_ids: [observation.id],
      kind,
      scope,
      support: 1,
      counterevidence: 0,
      confidence: 1,
      created_at: now()
    });
    this.signals.set(signal.id, signal);
    return signal;
  }

  proposeHypothesis(signalId: string, claim: string): Hypothesis {
    if (!claim.trim()) throw new Error("CLAIM_REQUIRED");
    const signal = this.requireSignal(signalId);
    const observation = this.requireObservation(signal.observation_ids[0] ?? "");
    const eventId = observation.event_ids[0] ?? "";
    const event = this.requireEvent(eventId);
    const content =
      typeof event.payload.correction === "string"
        ? event.payload.correction
        : typeof event.payload.content === "string"
          ? event.payload.content
          : JSON.stringify(event.payload.outcome ?? event.payload);
    const hypothesis: Hypothesis = deepFreeze({
      contract: "hypothesis",
      id: randomUUID(),
      tenant_id: signal.tenant_id,
      subject_id: signal.subject_id,
      claim,
      scope: signal.scope,
      evidence: [evidenceRef(event.id, content)],
      alternatives: [],
      falsifier: "A later explicit correction, rejection, or scoped counterexample contradicts this claim.",
      confidence: signal.confidence,
      created_at: now()
    });
    this.hypotheses.set(hypothesis.id, hypothesis);
    return hypothesis;
  }

  getSource(id: string): SourceRecord {
    return this.requireSource(id);
  }
  getEvent(id: string): Event {
    return this.requireEvent(id);
  }
  getObservation(id: string): Observation {
    return this.requireObservation(id);
  }
  findObservationForEvent(eventId: string): Observation | undefined {
    return [...this.observations.values()].find(
      (observation) => observation.event_ids.length === 1 && observation.event_ids[0] === eventId
    );
  }
  getSignal(id: string): Signal {
    return this.requireSignal(id);
  }
  getHypothesis(id: string): Hypothesis {
    const hypothesis = this.hypotheses.get(id);
    if (!hypothesis) throw new Error("HYPOTHESIS_NOT_FOUND");
    return hypothesis;
  }
  snapshot(): EvidenceLedgerSnapshot {
    return {
      sources: [...this.sources.values()],
      events: [...this.events.values()],
      observations: [...this.observations.values()],
      signals: [...this.signals.values()],
      hypotheses: [...this.hypotheses.values()],
      activityDeduplication: [...this.activityDeduplication.entries()].map(([key, chain]) => ({ key, chain })),
      outcomeDeduplication: [...this.outcomeDeduplication.entries()].map(([key, chain]) => ({ key, chain }))
    };
  }
  static fromSnapshot(snapshot: EvidenceLedgerSnapshot): EvidenceLedger {
    const ledger = new EvidenceLedger();
    for (const source of snapshot.sources) ledger.sources.set(source.id, deepFreeze(source));
    for (const event of snapshot.events) ledger.events.set(event.id, deepFreeze(event));
    for (const observation of snapshot.observations) ledger.observations.set(observation.id, deepFreeze(observation));
    for (const signal of snapshot.signals) ledger.signals.set(signal.id, deepFreeze(signal));
    for (const hypothesis of snapshot.hypotheses) ledger.hypotheses.set(hypothesis.id, deepFreeze(hypothesis));
    for (const item of snapshot.activityDeduplication)
      ledger.activityDeduplication.set(item.key, deepFreeze(item.chain));
    for (const item of snapshot.outcomeDeduplication ?? [])
      ledger.outcomeDeduplication.set(item.key, deepFreeze(item.chain));
    return ledger;
  }

  private validateActivity(input: ExplicitActivityInput, allowCanonicalPayload: boolean): void {
    const fields = [
      [input.tenantId, "TENANT_ID_REQUIRED"],
      [input.subjectId, "SUBJECT_ID_REQUIRED"],
      [input.actorId, "ACTOR_ID_REQUIRED"],
      [input.runId, "RUN_ID_REQUIRED"],
      [input.taskType, "TASK_TYPE_REQUIRED"]
    ] as const;
    for (const [value, code] of fields) if (typeof value !== "string" || !value.trim()) throw new Error(code);
    if (
      !(
        ["approval", "rejection", "choice", "correction", "edit", "example", "workflow_action", "outcome"] as string[]
      ).includes(input.activityType)
    )
      throw new Error("ACTIVITY_TYPE_INVALID");
    if (
      !input.scope ||
      typeof input.scope !== "object" ||
      typeof input.scope.level !== "string" ||
      !input.scope.level.trim() ||
      typeof input.scope.ref !== "string" ||
      !input.scope.ref.trim()
    )
      throw new Error("SCOPE_REQUIRED");
    const reserved = new Set([
      "actor_id",
      "run_id",
      "task_type",
      "content",
      "scope",
      "mode",
      "security_flags",
      "kind",
      "original",
      "correction"
    ]);
    if (!allowCanonicalPayload && input.payload && Object.keys(input.payload).some((key) => reserved.has(key)))
      throw new Error("RESERVED_ACTIVITY_PAYLOAD_FIELD");
  }

  private validateOutcome(input: ObjectiveOutcomeInput): void {
    const fields = [
      [input.tenantId, "TENANT_ID_REQUIRED"],
      [input.subjectId, "SUBJECT_ID_REQUIRED"],
      [input.runId, "RUN_ID_REQUIRED"],
      [input.outcomeType, "OUTCOME_TYPE_REQUIRED"]
    ] as const;
    for (const [value, code] of fields) if (typeof value !== "string" || !value.trim()) throw new Error(code);
    if (!input.outcome || typeof input.outcome !== "object" || Array.isArray(input.outcome))
      throw new Error("OUTCOME_REQUIRED");
    if (
      !input.scope ||
      typeof input.scope !== "object" ||
      typeof input.scope.level !== "string" ||
      !input.scope.level.trim() ||
      typeof input.scope.ref !== "string" ||
      !input.scope.ref.trim()
    )
      throw new Error("SCOPE_REQUIRED");
  }

  private requireSource(id: string): SourceRecord {
    const source = this.sources.get(id);
    if (!source) throw new Error("SOURCE_NOT_FOUND");
    return source;
  }
  private requireEvent(id: string): Event {
    const event = this.events.get(id);
    if (!event) throw new Error("EVENT_NOT_FOUND");
    return event;
  }
  private requireObservation(id: string): Observation {
    const observation = this.observations.get(id);
    if (!observation) throw new Error("OBSERVATION_NOT_FOUND");
    return observation;
  }
  private requireSignal(id: string): Signal {
    const signal = this.signals.get(id);
    if (!signal) throw new Error("SIGNAL_NOT_FOUND");
    return signal;
  }
}
