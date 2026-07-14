import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateCausalComparison, evaluateControlled, JsonLearningLedger, LearningLedger, verifyRestart } from "./index.js";

describe("Meraki objective proof", () => {
  it("shows targeted improvement and ablation attribution", () => {
    const report = evaluateControlled();
    expect(report.improvement).toBe(true);
    expect(report.unrelatedUnaffected).toBe(true);
    expect(report.attribution).toBe("retrieved-approved-lesson");
    expect(report.ablation["no-retrieval"].correct).toBe(false);
  });
  it("rejects mutation of immutable correction evidence", () => {
    const ledger = new LearningLedger();
    const e = ledger.appendCorrection({ id: "e1", task: "t", mode: "m", statement: "x", createdAt: "now" });
    expect(() => ledger.appendCorrection({ ...e, statement: "tampered" })).toThrow("immutable evidence conflict");
  });
  it("survives a save/restart/load cycle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "meraki-eval-")); const path = join(dir, "ledger.json");
    await expect(verifyRestart(path)).resolves.toBe(true);
    const restored = await new JsonLearningLedger(path).load(); expect(restored.relevant("formatting", "editorial")?.lifecycle).toBe("approved");
    await rm(dir, { recursive: true, force: true });
  });
  it("compares baseline, equal-token raw memory, Meraki Pack, and a targeted ablation", () => {
    const report = evaluateCausalComparison();
    expect(report.arms.raw_memory.tokenCount).toBe(report.arms.meraki_pack.tokenCount);
    expect(report.arms.meraki_pack.related.correct).toBe(true);
    expect(report.arms.meraki_pack.unrelated.guidanceApplied).toBeNull();
    expect(report.arms.raw_memory.unrelated.guidanceApplied).toBe("Use bullets");
    expect(report.targetedAblationRemovesImprovement).toBe(true);
    expect(report.blindWinner).toBe("meraki_pack");
    expect(report.correctionBurden.meraki_pack).toBeLessThan(report.correctionBurden.baseline);
  });
});
