import { describe, expect, it } from "vitest";
import { ProfileGraph } from "./index.js";

const evidence = [{ event_id: "event-a", span_start: 0, span_end: 10 }];
const projectScope = { level: "project" as const, ref: "acme" };

describe("profile graph", () => {
  it("keeps project and mode-specific atoms out of unrelated retrieval", () => {
    const graph = new ProfileGraph();
    const candidate = graph.createCandidate({
      tenantId: "tenant-a",
      subjectId: "user-a",
      facet: "communication",
      claim: "Use concise subjects",
      epistemicClass: "declared",
      scope: projectScope,
      mode: "concise",
      temporalHorizon: "ongoing",
      evidence
    });
    graph.activate(candidate.id, candidate.version);
    expect(
      graph.resolve({ tenantId: "tenant-a", subjectId: "user-a", scope: projectScope, mode: "concise" })
    ).toHaveLength(1);
    expect(
      graph.resolve({ tenantId: "tenant-a", subjectId: "user-a", scope: projectScope, mode: "creative" })
    ).toHaveLength(0);
    expect(
      graph.resolve({
        tenantId: "tenant-a",
        subjectId: "user-a",
        scope: { level: "project", ref: "other" },
        mode: "concise"
      })
    ).toHaveLength(0);
  });

  it("keeps current state temporal and preserves reversible version history", () => {
    const graph = new ProfileGraph();
    expect(() =>
      graph.createCandidate({
        tenantId: "tenant-a",
        subjectId: "user-a",
        facet: "current_state",
        claim: "Preparing launch",
        epistemicClass: "observed",
        scope: projectScope,
        temporalHorizon: "ongoing",
        evidence
      })
    ).toThrow("CURRENT_STATE_MUST_BE_TEMPORAL");
    const candidate = graph.createCandidate({
      tenantId: "tenant-a",
      subjectId: "user-a",
      facet: "current_state",
      claim: "Preparing launch",
      epistemicClass: "observed",
      scope: projectScope,
      temporalHorizon: "temporary",
      evidence
    });
    const active = graph.activate(candidate.id, candidate.version);
    const revoked = graph.revoke(active.id, active.version);
    expect(graph.revisions(candidate.id).map((atom) => atom.lifecycle)).toEqual(["candidate", "active", "revoked"]);
    expect(graph.resolve({ tenantId: "tenant-a", subjectId: "user-a", scope: projectScope })).toHaveLength(0);
    expect(revoked.version).toBe(3);
  });

  it("can remove a mode during a versioned rescope without storing an undefined mode", () => {
    const graph = new ProfileGraph();
    const candidate = graph.createCandidate({
      tenantId: "tenant-a",
      subjectId: "user-a",
      facet: "communication",
      claim: "Use concise subjects",
      epistemicClass: "declared",
      scope: projectScope,
      mode: "concise",
      temporalHorizon: "ongoing",
      evidence
    });
    const unmode = graph.rescope(candidate.id, projectScope, undefined, candidate.version);
    expect("mode" in unmode).toBe(false);
    expect(unmode.version).toBe(2);
  });

  it("weakens with inspectable counterevidence and splits a superseded claim into governed candidates", () => {
    const graph = new ProfileGraph();
    const candidate = graph.createCandidate({
      tenantId: "tenant-a",
      subjectId: "user-a",
      facet: "communication",
      claim: "Always be concise",
      epistemicClass: "declared",
      scope: projectScope,
      temporalHorizon: "ongoing",
      evidence
    });
    const active = graph.activate(candidate.id, candidate.version);
    const weakened = graph.weaken(
      active.id,
      { event_id: "counterexample", span_start: 0, span_end: 5 },
      active.version
    );
    expect(weakened.counterevidence).toHaveLength(1);
    expect(weakened.confidence).toBeLessThan(active.confidence);
    const split = graph.split(
      weakened.id,
      ["Be concise for status updates", "Use detail for technical plans"],
      weakened.version
    );
    expect(graph.current(weakened.id).lifecycle).toBe("superseded");
    expect(split).toHaveLength(2);
    expect(split.every((atom) => atom.lifecycle === "candidate" && atom.evidence[0]?.event_id === "event-a")).toBe(
      true
    );
  });

  it("caps reinforcement and can create a later revision that restores the prior atom", () => {
    const graph = new ProfileGraph();
    const candidate = graph.createCandidate({
      tenantId: "tenant-a",
      subjectId: "user-a",
      facet: "communication",
      claim: "Use concise subjects",
      epistemicClass: "declared",
      scope: projectScope,
      temporalHorizon: "ongoing",
      evidence
    });
    const active = graph.activate(candidate.id, candidate.version);
    const reinforced = graph.reinforce(active.id, active.version);
    expect(reinforced.confidence).toBeLessThanOrEqual(1);
    expect(reinforced.utility).toBeGreaterThan(active.utility);
    const restored = graph.restore(reinforced.id, reinforced.version, active);
    expect(restored.confidence).toBe(active.confidence);
    expect(restored.utility).toBe(active.utility);
    expect(restored.version).toBe(reinforced.version + 1);
  });
});
