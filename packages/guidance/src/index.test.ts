import { describe, expect, it } from "vitest";
import type { ProfileAtom, TaskContext } from "@meraki/contracts";
import { compileGuidance } from "./index.js";

const context: TaskContext = { contract: "task_context", tenant_id: "tenant-a", subject_id: "user-a", task_id: "task-a", task_type: "email", scope: { level: "project", ref: "acme" }, mode: "concise", constraints: [], permissions: [], token_budget: 100 };
const atom = (id: string, patch: Partial<ProfileAtom> = {}): ProfileAtom => ({ contract: "profile_atom", id, version: 1, tenant_id: "tenant-a", subject_id: "user-a", facet: "communication", claim: "For email, use concise subjects.", epistemic_class: "declared", scope: context.scope, mode: "concise", temporal_horizon: "ongoing", lifecycle: "active", confidence: 1, utility: 1, sensitivity: "normal", evidence: [], counterevidence: [], created_at: "2026-01-01T00:00:00.000Z", ...patch });

describe("guidance compiler", () => {
  it("is byte deterministic and gives provenance for included and excluded atoms", () => {
    const atoms = [atom("included"), atom("wrong-project", { scope: { level: "project", ref: "other" } }), atom("wrong-mode", { mode: "creative" }), atom("revoked", { lifecycle: "revoked" })];
    const first = JSON.stringify(compileGuidance(atoms, context));
    for (let index = 0; index < 20; index += 1) expect(JSON.stringify(compileGuidance(atoms, context))).toBe(first);
    const result = compileGuidance(atoms, context);
    expect(result.pack.items.map((item) => item.atom.id)).toEqual(["included"]);
    expect(result.candidates.find((candidate) => candidate.atom.id === "wrong-project")?.reasons).toContain("scope_mismatch");
    expect(result.candidates.find((candidate) => candidate.atom.id === "wrong-mode")?.reasons).toContain("mode_mismatch");
    expect(result.candidates.find((candidate) => candidate.atom.id === "revoked")?.reasons).toContain("inactive_or_revoked");
  });

  it("abstains for unrelated work and observes budget and sensitive permissions", () => {
    expect(compileGuidance([atom("unrelated", { claim: "For recipes, use seasonal ingredients." })], context).pack.items).toEqual([]);
    expect(compileGuidance([atom("secret", { sensitivity: "sensitive" })], context).pack.items).toEqual([]);
    expect(compileGuidance([atom("budget")], { ...context, token_budget: 1 }).pack.items).toEqual([]);
  });
});
