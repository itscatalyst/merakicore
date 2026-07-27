import { describe, expect, it } from "vitest";
import { ConnectedAgentRuntime, scopeFromUnknown } from "./index.js";

const correction = {
  tenantId: "tenant-a",
  subjectId: "user-a",
  actorId: "user-a",
  runId: "run-a",
  taskType: "email",
  scope: { level: "project" as const, ref: "acme" },
  mode: "concise",
  original: "Draft an email",
  correction: "Use a concise subject"
};
const taskContext = {
  contract: "task_context" as const,
  tenant_id: correction.tenantId,
  subject_id: correction.subjectId,
  task_id: "task-a",
  task_type: correction.taskType,
  scope: correction.scope,
  mode: correction.mode,
  constraints: [],
  permissions: [],
  token_budget: 100
};

describe("runtime scope parsing", () => {
  it("matches the public conditional Scope contract", () => {
    expect(scopeFromUnknown({ level: "user" })).toEqual({ level: "user" });
    expect(scopeFromUnknown({ level: "project", ref: "acme" })).toEqual({
      level: "project",
      ref: "acme"
    });

    expect(() => scopeFromUnknown({ level: "project" })).toThrow("SCOPE_REF_REQUIRED");
    expect(() => scopeFromUnknown({ level: "not-a-scope", ref: "acme" })).toThrow("SCOPE_LEVEL_INVALID");
    expect(() => scopeFromUnknown({ level: "project", ref: "" })).toThrow("SCOPE_REF_INVALID");
    expect(() => scopeFromUnknown({ level: "user", ref: 1 })).toThrow("SCOPE_REF_INVALID");
    expect(() => scopeFromUnknown({ level: "user", unexpected: true })).toThrow("SCOPE_INVALID");
    expect(() => scopeFromUnknown(null)).toThrow("SCOPE_REQUIRED");
  });

  it("validates evaluation inputs against the public contract at runtime", () => {
    const runtime = new ConnectedAgentRuntime();
    runtime.learn(correction);
    const run = runtime.run({ context: taskContext, request: "Draft", baseline: "BASELINE" });
    const valid = {
      runId: run.trace.runId,
      experimentId: "experiment-a",
      armId: "meraki",
      evaluatorClass: "objective" as const,
      criteria: { accepted: 1 },
      result: "win" as const,
      uncertainty: 0
    };
    expect(runtime.recordEvaluation(valid).evaluation.criteria).toEqual({ accepted: 1 });
    expect(() => runtime.recordEvaluation({ ...valid, runId: "" })).toThrow("RUN_ID_REQUIRED");
    expect(() => runtime.recordEvaluation({ ...valid, experimentId: "" })).toThrow("EXPERIMENT_ID_REQUIRED");
    expect(() => runtime.recordEvaluation({ ...valid, armId: "" })).toThrow("ARM_ID_REQUIRED");
    expect(() => runtime.recordEvaluation({ ...valid, evaluatorClass: "unknown" as never })).toThrow(
      "EVALUATOR_CLASS_INVALID"
    );
    expect(() => runtime.recordEvaluation({ ...valid, result: "unknown" as never })).toThrow(
      "EVALUATION_RESULT_INVALID"
    );
    expect(() => runtime.recordEvaluation({ ...valid, criteria: { accepted: true } })).toThrow(
      "EVALUATION_CRITERIA_INVALID"
    );
    expect(() => runtime.recordEvaluation({ ...valid, criteria: { accepted: Number.NaN } })).toThrow(
      "EVALUATION_CRITERIA_INVALID"
    );
    expect(() => runtime.recordEvaluation({ ...valid, uncertainty: Number.NaN })).toThrow(
      "EVALUATION_UNCERTAINTY_INVALID"
    );
  });

  it("restores valid connected lineage and rejects cross-subject run snapshots", () => {
    const runtime = new ConnectedAgentRuntime();
    runtime.learn(correction);
    const run = runtime.run({ context: taskContext, request: "Draft", baseline: "BASELINE" });
    runtime.recordEvaluation({
      runId: run.trace.runId,
      experimentId: "experiment-a",
      armId: "meraki",
      evaluatorClass: "objective",
      criteria: { accepted: 1 },
      result: "win",
      uncertainty: 0
    });
    const snapshot = runtime.snapshot();
    const restored = ConnectedAgentRuntime.fromSnapshot(structuredClone(snapshot));
    expect(restored.getRun(run.trace.runId)?.run.trace.packHash).toBe(run.trace.packHash);
    expect(restored.evaluations()).toHaveLength(1);

    const tampered = structuredClone(snapshot);
    Object.assign(tampered.runs[0]!.context, { subject_id: "user-b" });
    expect(() => ConnectedAgentRuntime.fromSnapshot(tampered)).toThrow("SNAPSHOT_RUN_LINEAGE_INVALID");

    const invalidEvaluation = structuredClone(snapshot);
    Object.assign(invalidEvaluation.evaluations[0]!.evaluation, { uncertainty: Number.NaN });
    expect(() => ConnectedAgentRuntime.fromSnapshot(invalidEvaluation)).toThrow("EVALUATION_UNCERTAINTY_INVALID");

    const tamperedPack = structuredClone(snapshot);
    tamperedPack.runs[0]!.run.pack.items[0]!.guidance = "Tampered persisted guidance";
    expect(() => ConnectedAgentRuntime.fromSnapshot(tamperedPack)).toThrow("SNAPSHOT_RUN_LINEAGE_INVALID");
  });
});
