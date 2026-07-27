import { createHash, randomUUID } from "node:crypto";
import type { Attribution, Evaluation, MerakiPack, Scope, TaskContext } from "@meraki/contracts";
import {
  LearningEngine,
  type ActivityLessonInput,
  type CorrectionInput,
  type ImmutableCorrection,
  type LearningEngineSnapshot,
  type UpdateOperation
} from "../learning/index.js";
import type { ExplicitActivityInput, ObjectiveOutcomeInput } from "../evidence/index.js";
import { canonicalJson, parseScope } from "../domain/index.js";

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
  candidates: Array<{
    atomId: string;
    version: number;
    decision: string;
    reasons: string[];
    scores: Record<string, unknown>;
  }>;
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
export type RecordedEvaluation = Readonly<{
  runId: string;
  evaluation: Evaluation;
  attribution?: Attribution;
  effective: boolean;
}>;
export type ConnectedRuntimeSnapshot = Readonly<{
  engine: LearningEngineSnapshot;
  runs: RecordedRun[];
  evaluations: RecordedEvaluation[];
}>;
export type ConnectedCausalInput = Readonly<{
  correction: CorrectionInput;
  related: AgentRunInput;
  unrelated: AgentRunInput;
  experimentId?: string;
}>;
export type ConnectedCausalArm = Readonly<{ related: AgentRunResult; unrelated: AgentRunResult; tokenCount: number }>;
export type ConnectedCausalComparison = Readonly<{
  experimentId: string;
  guidance: string;
  arms: Readonly<{
    baseline: ConnectedCausalArm;
    rawMemory: ConnectedCausalArm;
    merakiPack: ConnectedCausalArm;
    ablatedPack: ConnectedCausalArm;
  }>;
  objectiveRecords: Readonly<{ merakiRelated: RecordedEvaluation; ablatedRelated: RecordedEvaluation }>;
  correctionBurden: Readonly<{ baseline: number; rawMemory: number; merakiPack: number; ablatedPack: number }>;
  relatedImproves: boolean;
  unrelatedUnaffected: boolean;
  targetedAblationRemovesImprovement: boolean;
}>;

const evaluationPriority = (evaluatorClass: Evaluation["evaluator_class"]): number =>
  evaluatorClass === "human_blind" ? 3 : evaluatorClass === "objective" ? 2 : 1;
const effectFromResult = (result: Evaluation["result"]): number => (result === "win" ? 1 : result === "loss" ? -1 : 0);
const digest = (value: string): `sha256:${string}` => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const tokenCount = (value: string): number => (value.trim() ? value.trim().split(/\s+/).length : 0);
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
};
const normalizeTaskContext = (context: TaskContext): TaskContext => {
  if (!context || typeof context !== "object" || context.contract !== "task_context")
    throw new Error("TASK_CONTEXT_INVALID");
  if (typeof context.tenant_id !== "string" || !context.tenant_id.trim()) throw new Error("TENANT_ID_REQUIRED");
  if (typeof context.subject_id !== "string" || !context.subject_id.trim()) throw new Error("SUBJECT_ID_REQUIRED");
  if (typeof context.task_id !== "string" || !context.task_id.trim()) throw new Error("TASK_ID_REQUIRED");
  if (typeof context.task_type !== "string" || !context.task_type.trim()) throw new Error("TASK_TYPE_REQUIRED");
  if (
    !Array.isArray(context.constraints) ||
    context.constraints.some((value) => typeof value !== "string") ||
    !Array.isArray(context.permissions) ||
    context.permissions.some((value) => typeof value !== "string") ||
    new Set(context.permissions).size !== context.permissions.length ||
    !Number.isInteger(context.token_budget) ||
    context.token_budget < 0 ||
    (context.mode !== undefined && typeof context.mode !== "string") ||
    (context.goal_id !== undefined && typeof context.goal_id !== "string")
  )
    throw new Error("TASK_CONTEXT_INVALID");
  return {
    contract: "task_context",
    tenant_id: context.tenant_id,
    subject_id: context.subject_id,
    task_id: context.task_id,
    task_type: context.task_type,
    scope: parseScope(context.scope),
    ...(context.mode === undefined ? {} : { mode: context.mode }),
    ...(context.goal_id === undefined ? {} : { goal_id: context.goal_id }),
    constraints: [...context.constraints],
    permissions: [...context.permissions],
    token_budget: context.token_budget
  };
};
const assertEvaluationInput = (input: EvaluationInput): void => {
  const identifiers = [
    [input.runId, "RUN_ID_REQUIRED"],
    [input.experimentId, "EXPERIMENT_ID_REQUIRED"],
    [input.armId, "ARM_ID_REQUIRED"]
  ] as const;
  for (const [value, code] of identifiers) if (typeof value !== "string" || !value.trim()) throw new Error(code);
  if (!["human_blind", "objective", "model_weak"].includes(input.evaluatorClass))
    throw new Error("EVALUATOR_CLASS_INVALID");
  if (!["win", "loss", "tie", "abstain"].includes(input.result)) throw new Error("EVALUATION_RESULT_INVALID");
  if (
    !input.criteria ||
    typeof input.criteria !== "object" ||
    Array.isArray(input.criteria) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input.criteria) as object | null) ||
    Object.values(input.criteria).some((value) => typeof value !== "number" || !Number.isFinite(value))
  )
    throw new Error("EVALUATION_CRITERIA_INVALID");
  if (!Number.isFinite(input.uncertainty) || input.uncertainty < 0 || input.uncertainty > 1)
    throw new Error("EVALUATION_UNCERTAINTY_INVALID");
  if (
    input.evaluatorIdentityDigest !== undefined &&
    (typeof input.evaluatorIdentityDigest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(input.evaluatorIdentityDigest))
  )
    throw new Error("EVALUATOR_IDENTITY_DIGEST_INVALID");
  if (input.reason !== undefined && typeof input.reason !== "string") throw new Error("EVALUATION_REASON_INVALID");
};
/** Objective contract: guidance counts only when rendered in the explicit guidance
 * channel, never merely because the baseline happens to contain the same text. */
const containsExpectedGuidance = (output: string, guidance: string): boolean =>
  output
    .split("\n")
    .some(
      (line) =>
        (line.startsWith("Meraki guidance applied: ") || line.startsWith("Raw memory applied: ")) &&
        line.slice(line.indexOf(": ") + 2) === guidance
    );
const expectedPackHash = (pack: MerakiPack): `sha256:${string}` => {
  const { contract, id, hash, ...payload } = pack;
  void id;
  void hash;
  if (contract !== "meraki_pack") throw new Error("SNAPSHOT_RUN_LINEAGE_INVALID");
  return digest(canonicalJson(payload));
};

/** Adapter-neutral connected-agent runtime. A model adapter can replace render() while retaining the Meraki trace. */
export class ConnectedAgentRuntime {
  private readonly runLedger: RecordedRun[] = [];
  private readonly evaluationLedger: RecordedEvaluation[] = [];
  constructor(private readonly engine: LearningEngine = new LearningEngine()) {}

  correction(input: CorrectionInput): ImmutableCorrection {
    return this.engine.recordCorrection(input);
  }
  activity(input: ExplicitActivityInput) {
    return this.engine.recordActivity(input);
  }
  outcome(input: ObjectiveOutcomeInput) {
    return this.engine.recordOutcome(input);
  }

  learn(input: CorrectionInput) {
    return this.engine.learn(input);
  }
  extractActivityLesson(input: ActivityLessonInput) {
    return this.engine.extractActivityLesson(input);
  }

  run(input: AgentRunInput): AgentRunResult {
    if (typeof input.request !== "string" || !input.request.trim()) throw new Error("REQUEST_REQUIRED");
    if (typeof input.baseline !== "string") throw new Error("BASELINE_REQUIRED");
    const context = normalizeTaskContext(input.context);
    const retrieved = this.engine.retrieve(context);
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
      explanation: guidance
        ? "Relevant active lessons were injected for this task context."
        : "No relevant active lesson was retrieved; baseline output preserved.",
      taskContextDigest: retrieved.pack.task_context_digest,
      candidates: retrieved.candidates.map((candidate) => ({
        atomId: candidate.atom.id,
        version: candidate.atom.version,
        decision: candidate.decision,
        reasons: candidate.reasons,
        scores: candidate.scores
      })),
      provenance: retrieved.pack.atom_manifest.map((manifest) => ({
        atomId: manifest.id,
        evidenceEventIds:
          atoms.find((atom) => atom.id === manifest.id)?.evidence.map((evidence) => evidence.event_id) ?? []
      }))
    };
    const result = deepFreeze({ output, baseline: input.baseline, pack: retrieved.pack, trace });
    this.runLedger.push(
      deepFreeze({
        run: result,
        context,
        request: input.request,
        recordedAt: new Date().toISOString()
      })
    );
    return result;
  }

  /** Equal-token raw-memory control: deliberately bypasses Meraki retrieval and may leak across contexts. */
  runRawMemory(input: AgentRunInput, rawMemory: string): AgentRunResult {
    if (typeof input.request !== "string" || !input.request.trim()) throw new Error("REQUEST_REQUIRED");
    if (typeof input.baseline !== "string") throw new Error("BASELINE_REQUIRED");
    if (typeof rawMemory !== "string" || !rawMemory.trim()) throw new Error("RAW_MEMORY_REQUIRED");
    const context = normalizeTaskContext(input.context);
    const retrieved = this.engine.retrieve(context);
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
    const result = deepFreeze({ output, baseline: input.baseline, pack: retrieved.pack, trace });
    this.runLedger.push(
      deepFreeze({
        run: result,
        context,
        request: input.request,
        recordedAt: new Date().toISOString()
      })
    );
    return result;
  }

  recordEvaluation(input: EvaluationInput): RecordedEvaluation {
    assertEvaluationInput(input);
    const run = this.getRun(input.runId);
    if (!run) throw new Error("RUN_NOT_FOUND");
    const evaluation: Evaluation = deepFreeze({
      contract: "evaluation",
      id: randomUUID(),
      tenant_id: run.context.tenant_id,
      subject_id: run.context.subject_id,
      experiment_id: input.experimentId,
      arm_id: input.armId,
      evaluator_class: input.evaluatorClass,
      ...(input.evaluatorIdentityDigest === undefined
        ? {}
        : { evaluator_identity_digest: input.evaluatorIdentityDigest as `sha256:${string}` }),
      criteria: { ...input.criteria },
      result: input.result,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      uncertainty: input.uncertainty,
      created_at: new Date().toISOString()
    });
    const target = run.run.trace.candidates.find((candidate) => candidate.decision === "included");
    const attribution = target
      ? deepFreeze({
          contract: "attribution" as const,
          id: randomUUID(),
          tenant_id: evaluation.tenant_id,
          subject_id: evaluation.subject_id,
          evaluation_ids: [evaluation.id],
          target: { id: target.atomId, version: target.version },
          effect: effectFromResult(evaluation.result),
          uncertainty: evaluation.uncertainty,
          created_at: evaluation.created_at
        })
      : undefined;
    const prior = this.evaluationLedger.filter((entry) => entry.runId === input.runId);
    const effective = prior.every(
      (entry) =>
        evaluationPriority(evaluation.evaluator_class) > evaluationPriority(entry.evaluation.evaluator_class) ||
        (evaluationPriority(evaluation.evaluator_class) === evaluationPriority(entry.evaluation.evaluator_class) &&
          evaluation.uncertainty < entry.evaluation.uncertainty)
    );
    if (effective)
      for (const entry of prior) {
        const index = this.evaluationLedger.indexOf(entry);
        this.evaluationLedger[index] = Object.freeze({ ...entry, effective: false });
      }
    const recorded = deepFreeze({
      runId: input.runId,
      evaluation,
      ...(attribution === undefined ? {} : { attribution }),
      effective
    });
    this.evaluationLedger.push(recorded);
    return recorded;
  }

  retrieve(context: TaskContext) {
    return this.engine.retrieve(normalizeTaskContext(context));
  }
  approve(lessonId: string, expectedVersion = 1) {
    return this.engine.approve(lessonId, expectedVersion);
  }
  edit(lessonId: string, claim: string, expectedVersion: number) {
    return this.engine.edit(lessonId, claim, expectedVersion);
  }
  revoke(lessonId: string, expectedVersion: number) {
    return this.engine.revoke(lessonId, expectedVersion);
  }
  rescope(lessonId: string, scope: Scope, mode: string | undefined, expectedVersion: number) {
    return this.engine.rescope(lessonId, scope, mode, expectedVersion);
  }
  supersede(lessonId: string, expectedVersion: number) {
    return this.engine.supersede(lessonId, expectedVersion);
  }
  weaken(lessonId: string, counterevidenceEventId: string, expectedVersion: number) {
    return this.engine.weaken(lessonId, counterevidenceEventId, expectedVersion);
  }
  split(lessonId: string, claims: readonly string[], expectedVersion: number) {
    return this.engine.split(lessonId, claims, expectedVersion);
  }
  proposeUpdate(lessonId: string, evidenceEventId: string, operation: UpdateOperation) {
    return this.engine.proposeUpdate(lessonId, evidenceEventId, operation);
  }
  applyUpdateProposal(proposalId: string) {
    return this.engine.applyUpdateProposal(proposalId);
  }
  rejectUpdateProposal(proposalId: string) {
    return this.engine.rejectUpdateProposal(proposalId);
  }
  rollbackUpdateProposal(proposalId: string) {
    return this.engine.rollbackUpdateProposal(proposalId);
  }
  profileAtoms() {
    return this.engine.getProfileAtoms();
  }
  learningTrace(eventId: string) {
    return this.engine.learningTrace(eventId);
  }
  learningTraceForAtom(atomId: string) {
    return this.engine.learningTraceForAtom(atomId);
  }
  updateProposals() {
    return this.engine.updateProposals();
  }
  recentRuns(): readonly RecordedRun[] {
    return [...this.runLedger].reverse();
  }
  evaluations(): readonly RecordedEvaluation[] {
    return [...this.evaluationLedger].reverse();
  }
  getRun(runId: string): RecordedRun | undefined {
    return this.runLedger.find((record) => record.run.trace.runId === runId);
  }
  snapshot(): ConnectedRuntimeSnapshot {
    return { engine: this.engine.snapshot(), runs: [...this.runLedger], evaluations: [...this.evaluationLedger] };
  }
  static fromSnapshot(snapshot: ConnectedRuntimeSnapshot | LearningEngineSnapshot): ConnectedAgentRuntime {
    if (!("engine" in snapshot)) return new ConnectedAgentRuntime(LearningEngine.fromSnapshot(snapshot));
    const runtime = new ConnectedAgentRuntime(LearningEngine.fromSnapshot(snapshot.engine));
    const runIds = new Set<string>();
    for (const record of snapshot.runs) {
      const context = normalizeTaskContext(record.context);
      const { run } = record;
      const rawMemory = run.trace.packId.startsWith("raw-memory:");
      const renderedGuidance = run.pack.items.map((item) => item.guidance).join(" ");
      const expectedOutput = renderedGuidance
        ? `${run.baseline}\nMeraki guidance applied: ${renderedGuidance}`
        : run.baseline;
      if (
        runIds.has(run.trace.runId) ||
        typeof record.request !== "string" ||
        !record.request.trim() ||
        typeof run.baseline !== "string" ||
        typeof run.output !== "string" ||
        run.trace.changed !== (run.output !== run.baseline) ||
        run.pack.tenant_id !== context.tenant_id ||
        run.pack.subject_id !== context.subject_id ||
        run.trace.taskContextDigest !== digest(canonicalJson(context)) ||
        run.trace.taskContextDigest !== run.pack.task_context_digest ||
        run.pack.hash !== expectedPackHash(run.pack) ||
        (!rawMemory && (run.trace.packId !== run.pack.id || run.trace.packHash !== run.pack.hash)) ||
        (!rawMemory && run.output !== expectedOutput) ||
        (!rawMemory &&
          run.trace.appliedAtomIds.join("\u0000") !== run.pack.atom_manifest.map((atom) => atom.id).join("\u0000")) ||
        (rawMemory && run.trace.appliedAtomIds.length !== 0)
      )
        throw new Error("SNAPSHOT_RUN_LINEAGE_INVALID");
      if (run.pack.items.length !== run.pack.atom_manifest.length) throw new Error("SNAPSHOT_RUN_LINEAGE_INVALID");
      for (const [index, manifest] of run.pack.atom_manifest.entries()) {
        const atom = runtime.engine
          .getProfileRevisions(manifest.id)
          .find((candidate) => candidate.version === manifest.version);
        const item = run.pack.items[index];
        if (
          !atom ||
          !item ||
          item.atom.id !== manifest.id ||
          item.atom.version !== manifest.version ||
          item.guidance !== atom.claim ||
          atom.tenant_id !== context.tenant_id ||
          atom.subject_id !== context.subject_id
        )
          throw new Error("SNAPSHOT_RUN_LINEAGE_INVALID");
      }
      runIds.add(run.trace.runId);
      runtime.runLedger.push(deepFreeze({ ...record, context }));
    }
    const evaluationIds = new Set<string>();
    for (const record of snapshot.evaluations) {
      const run = runtime.getRun(record.runId);
      assertEvaluationInput({
        runId: record.runId,
        experimentId: record.evaluation.experiment_id,
        armId: record.evaluation.arm_id,
        evaluatorClass: record.evaluation.evaluator_class,
        criteria: record.evaluation.criteria,
        result: record.evaluation.result,
        uncertainty: record.evaluation.uncertainty,
        ...(record.evaluation.reason === undefined ? {} : { reason: record.evaluation.reason }),
        ...(record.evaluation.evaluator_identity_digest === undefined
          ? {}
          : { evaluatorIdentityDigest: record.evaluation.evaluator_identity_digest })
      });
      if (
        evaluationIds.has(record.evaluation.id) ||
        !run ||
        typeof record.effective !== "boolean" ||
        record.evaluation.tenant_id !== run.context.tenant_id ||
        record.evaluation.subject_id !== run.context.subject_id ||
        (record.attribution !== undefined &&
          (record.attribution.tenant_id !== run.context.tenant_id ||
            record.attribution.subject_id !== run.context.subject_id ||
            !record.attribution.evaluation_ids.includes(record.evaluation.id)))
      )
        throw new Error("SNAPSHOT_EVALUATION_LINEAGE_INVALID");
      if (record.attribution) {
        const atom = runtime.engine
          .getProfileRevisions(record.attribution.target.id)
          .find((candidate) => candidate.version === record.attribution?.target.version);
        if (!atom || atom.tenant_id !== run.context.tenant_id || atom.subject_id !== run.context.subject_id)
          throw new Error("SNAPSHOT_EVALUATION_LINEAGE_INVALID");
      }
      evaluationIds.add(record.evaluation.id);
      runtime.evaluationLedger.push(deepFreeze(record));
    }
    for (const runId of runIds) {
      if (runtime.evaluationLedger.filter((record) => record.runId === runId && record.effective).length > 1)
        throw new Error("SNAPSHOT_EVALUATION_PRECEDENCE_INVALID");
    }
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
  const baseline: ConnectedCausalArm = {
    related: baselineRuntime.run(input.related),
    unrelated: baselineRuntime.run(input.unrelated),
    tokenCount: 0
  };
  const rawMemory: ConnectedCausalArm = {
    related: rawMemoryRuntime.runRawMemory(input.related, guidance),
    unrelated: rawMemoryRuntime.runRawMemory(input.unrelated, guidance),
    tokenCount: tokenCount(guidance)
  };
  const merakiPack: ConnectedCausalArm = {
    related: merakiRuntime.run(input.related),
    unrelated: merakiRuntime.run(input.unrelated),
    tokenCount: tokenCount(guidance)
  };
  const ablatedPack: ConnectedCausalArm = {
    related: ablatedRuntime.run(input.related),
    unrelated: ablatedRuntime.run(input.unrelated),
    tokenCount: 0
  };
  const merakiCorrect = containsExpectedGuidance(merakiPack.related.output, guidance);
  const ablatedCorrect = containsExpectedGuidance(ablatedPack.related.output, guidance);
  const merakiRelated = merakiRuntime.recordEvaluation({
    runId: merakiPack.related.trace.runId,
    experimentId,
    armId: "meraki_pack",
    evaluatorClass: "objective",
    criteria: { expected_guidance_present: Number(Boolean(guidance)), related: 1 },
    result: merakiCorrect ? "win" : "loss",
    uncertainty: 0
  });
  const ablatedRelated = ablatedRuntime.recordEvaluation({
    runId: ablatedPack.related.trace.runId,
    experimentId,
    armId: "ablated_pack",
    evaluatorClass: "objective",
    criteria: { expected_guidance_present: Number(Boolean(guidance)), related: 1 },
    result: ablatedCorrect ? "win" : "loss",
    uncertainty: 0
  });
  const correctionBurden = (arm: ConnectedCausalArm): number =>
    Number(!containsExpectedGuidance(arm.related.output, guidance)) +
    Number(arm.unrelated.output !== baseline.unrelated.baseline);
  return {
    experimentId,
    guidance,
    arms: { baseline, rawMemory, merakiPack, ablatedPack },
    objectiveRecords: { merakiRelated, ablatedRelated },
    correctionBurden: {
      baseline: correctionBurden(baseline),
      rawMemory: correctionBurden(rawMemory),
      merakiPack: correctionBurden(merakiPack),
      ablatedPack: correctionBurden(ablatedPack)
    },
    relatedImproves: !containsExpectedGuidance(baseline.related.output, guidance) && merakiCorrect,
    unrelatedUnaffected:
      merakiPack.unrelated.output === baseline.unrelated.baseline &&
      containsExpectedGuidance(rawMemory.unrelated.output, guidance),
    targetedAblationRemovesImprovement: merakiCorrect && !ablatedCorrect
  };
};

export const scopeFromUnknown = (value: unknown): Scope => parseScope(value);
