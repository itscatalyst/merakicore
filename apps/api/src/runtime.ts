import { randomUUID } from "node:crypto";
import type { MerakiPack, Scope, TaskContext } from "@meraki/contracts";
import { LearningEngine, type CorrectionInput, type ImmutableCorrection } from "@meraki/learning";

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
}>;

export type AgentRunResult = Readonly<{
  output: string;
  baseline: string;
  pack: MerakiPack;
  trace: AgentTrace;
}>;

/** Adapter-neutral connected-agent runtime. A model adapter can replace render() while retaining the Meraki trace. */
export class ConnectedAgentRuntime {
  constructor(private readonly engine: LearningEngine = new LearningEngine()) {}

  correction(input: CorrectionInput): ImmutableCorrection {
    return this.engine.recordCorrection(input);
  }

  learn(input: CorrectionInput) {
    return this.engine.learn(input);
  }

  run(input: AgentRunInput): AgentRunResult {
    const retrieved = this.engine.retrieve(input.context);
    const guidance = retrieved.pack.items.map((item) => item.guidance).join(" ");
    const output = guidance ? `${input.baseline}\nMeraki guidance applied: ${guidance}` : input.baseline;
    const trace: AgentTrace = {
      runId: randomUUID(),
      packId: retrieved.pack.id,
      packHash: retrieved.pack.hash,
      appliedAtomIds: retrieved.pack.atom_manifest.map((atom) => atom.id),
      changed: output !== input.baseline,
      explanation: guidance ? "Relevant active lessons were injected for this task context." : "No relevant active lesson was retrieved; baseline output preserved."
    };
    return { output, baseline: input.baseline, pack: retrieved.pack, trace };
  }

  retrieve(context: TaskContext) { return this.engine.retrieve(context); }
  approve(lessonId: string, expectedVersion = 1) { return this.engine.approve(lessonId, expectedVersion); }
  edit(lessonId: string, claim: string, expectedVersion: number) { return this.engine.edit(lessonId, claim, expectedVersion); }
  revoke(lessonId: string, expectedVersion: number) { return this.engine.revoke(lessonId, expectedVersion); }
}

export const scopeFromUnknown = (value: unknown): Scope => {
  if (!value || typeof value !== "object") throw new Error("SCOPE_REQUIRED");
  const candidate = value as { level?: unknown; ref?: unknown };
  if (typeof candidate.level !== "string") throw new Error("SCOPE_LEVEL_REQUIRED");
  return { level: candidate.level as Scope["level"], ...(typeof candidate.ref === "string" ? { ref: candidate.ref } : {}) };
};
