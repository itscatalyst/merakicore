import { describe, expect, it } from "vitest";
import {
  atomCommandPayload,
  atomTracePath,
  causalEvaluationPayload,
  correctionCandidatePayload,
  correctionRequestPayload,
  proposalCommandPayload,
  traceRows
} from "./App.js";

const atom = {
  contract: "profile_atom" as const,
  id: "a",
  version: 1,
  tenant_id: "t",
  subject_id: "s",
  facet: "workflow" as const,
  claim: "claim",
  epistemic_class: "declared" as const,
  scope: { level: "project" as const, ref: "p" },
  mode: "engineering",
  temporal_horizon: "durable" as const,
  lifecycle: "candidate" as const,
  confidence: 0.8,
  utility: 0.5,
  sensitivity: "normal" as const,
  evidence: [],
  counterevidence: [],
  created_at: "now"
};

describe("Studio governance controls", () => {
  it("sends a versioned canonical command instead of mutating a local atom", () =>
    expect(atomCommandPayload(atom, "confirm")).toEqual({ atom_id: "a", expected_version: 1, operation: "confirm" }));
  it("sends a normalized claim only for edit", () =>
    expect(atomCommandPayload(atom, "edit", " updated ")).toEqual({
      atom_id: "a",
      expected_version: 1,
      operation: "edit",
      claim: "updated"
    }));
  it("supplies the current scope to the canonical rescope command", () =>
    expect(atomCommandPayload(atom, "rescope")).toMatchObject({ scope: atom.scope, mode: "engineering" }));
  it("normalizes multiple split claims for the governed command", () =>
    expect(atomCommandPayload(atom, "split", undefined, [" concise ", " detailed ", " "])).toEqual({
      atom_id: "a",
      expected_version: 1,
      operation: "split",
      claims: ["concise", "detailed"]
    }));
  it("requires an immutable event reference for weakening", () =>
    expect(atomCommandPayload(atom, "weaken", undefined, undefined, " event-counter ")).toMatchObject({
      operation: "weaken",
      counterevidence_event_id: "event-counter"
    }));
  it("renders the connected trace data without inventing candidates or provenance", () =>
    expect(
      traceRows({
        run: {
          trace: {
            runId: "run-1",
            changed: true,
            packHash: "sha256:pack",
            appliedAtomIds: ["a"],
            taskContextDigest: "sha256:context",
            candidates: [
              { atomId: "a", version: 2, decision: "included", reasons: ["scope-match"], scores: { utility: 0.9 } }
            ],
            provenance: [{ atomId: "a", evidenceEventIds: ["event-1"] }]
          }
        },
        context: { task_type: "plan", mode: "engineering" },
        recordedAt: "now"
      })
    ).toEqual({
      taskContextDigest: "sha256:context",
      packHash: "sha256:pack",
      candidates: [
        { atomId: "a", version: 2, decision: "included", reasons: ["scope-match"], scores: { utility: 0.9 } }
      ],
      provenance: [{ atomId: "a", evidenceEventIds: ["event-1"] }]
    }));
  it("leaves the trace empty when no connected run exists", () =>
    expect(traceRows()).toEqual({ taskContextDigest: undefined, packHash: undefined, candidates: [], provenance: [] }));
  it("submits proposal lifecycle commands only to the canonical update endpoint", () =>
    expect(proposalCommandPayload("rollback")).toEqual({ operation: "rollback" }));
  it("looks up learning lineage by the selected atom rather than an ambiguous source event", () =>
    expect(atomTracePath("atom-successor")).toBe("/v1/profile/atoms/atom-successor/trace"));
  it("builds correction evidence and candidate requests from explicit Studio input without inventing identity", () => {
    const draft = {
      tenantId: " tenant-a ",
      subjectId: " user-a ",
      taskType: " email ",
      scopeRef: " acme ",
      mode: " concise ",
      original: " Original ",
      correction: " Use concise subjects "
    };
    const request = correctionRequestPayload(draft);
    expect(request).toMatchObject({
      tenantId: "tenant-a",
      subjectId: "user-a",
      actorId: "user-a",
      taskType: "email",
      scope: { level: "project", ref: "acme" },
      mode: "concise",
      original: "Original",
      correction: "Use concise subjects"
    });
    expect(correctionCandidatePayload("event-1", draft)).toEqual({
      event_id: "event-1",
      claim: "For email, prefer: Use concise subjects",
      facet: "workflow"
    });
  });
  it("builds a related task and negative-control causal evaluation request", () => {
    const draft = {
      tenantId: "tenant-a",
      subjectId: "user-a",
      taskType: "email",
      scopeRef: "acme",
      mode: "concise",
      original: "Draft",
      correction: "Use concise subjects"
    };
    const payload = causalEvaluationPayload(draft);
    expect(payload.related.context.mode).toBe("concise");
    expect(payload.unrelated.context.mode).toBe("negative-control");
    expect(payload.correction.scope).toEqual({ level: "project", ref: "acme" });
  });
});
