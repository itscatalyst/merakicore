import { describe, expect, it } from "vitest";
import { applyLocalCommand } from "./App.js";

describe("Studio governance controls", () => {
  const atom = { contract: "profile_atom" as const, id: "a", version: 1, tenant_id: "t", subject_id: "s", facet: "workflow" as const, claim: "claim", epistemic_class: "declared" as const, scope: { level: "project" as const, ref: "p" }, mode: "engineering", temporal_horizon: "durable" as const, lifecycle: "candidate" as const, confidence: .8, utility: .5, sensitivity: "normal" as const, evidence: [], counterevidence: [], created_at: "now", evidenceText: "quote", sourceLabel: "correction" };
  it("increments immutable version and approves", () => expect(applyLocalCommand(atom, "confirm")).toMatchObject({ version: 2, lifecycle: "active" }));
  it("limits scope without deleting evidence", () => expect(applyLocalCommand(atom, "limit")).toMatchObject({ version: 2, scope: { level: "task" }, evidence: [] }));
  it("revokes learning", () => expect(applyLocalCommand(atom, "revoke").lifecycle).toBe("revoked"));
});
