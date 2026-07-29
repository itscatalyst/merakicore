import { createInMemoryApplication } from "@meraki/application";
import type { AuthenticatedContext } from "@meraki/auth";
import { describe, expect, it } from "vitest";
import { dispatchHostedRest, HOSTED_REST_OPERATIONS, type HostedRestRequest } from "./rest.js";

const authority: AuthenticatedContext = {
  tenantId: "tenant-a",
  subjectId: "user-a",
  actorId: "user-a",
  sessionId: "hosted-test",
  scopes: new Set(["profile:read", "profile:write", "evidence:write", "evaluation:write"])
};

let requestSequence = 0;

const request = (
  method: "GET" | "POST",
  path: readonly string[],
  input: Readonly<{
    body?: unknown;
    query?: string;
    headers?: Readonly<Record<string, string>>;
  }> = {}
): HostedRestRequest => ({
  method,
  path,
  url: new URL(`https://core.example/v1/${path.join("/")}${input.query ?? ""}`),
  headers: new Headers(input.headers),
  requestId: `hosted-request-${++requestSequence}`,
  ...(input.body === undefined ? {} : { body: input.body })
});

const context = (input: Readonly<Record<string, unknown>> = {}) => ({
  contract: "task_context" as const,
  tenant_id: "tenant-a",
  subject_id: "user-a",
  task_id: "hosted-task",
  task_type: "product writing",
  scope: { level: "project" as const, ref: "merakicore" },
  mode: "direct",
  constraints: [],
  permissions: [],
  token_budget: 500,
  ...input
});

const correction = {
  tenantId: "tenant-a",
  subjectId: "user-a",
  actorId: "user-a",
  runId: "hosted-correction",
  taskType: "product writing",
  scope: { level: "project" as const, ref: "merakicore" },
  mode: "direct",
  original: "Meraki makes writing better.",
  correction: "State the concrete problem and mechanism."
};

describe("hosted REST dispatcher", () => {
  it("declares the complete local contract plus canonical Studio without MCP placeholders", () => {
    expect(HOSTED_REST_OPERATIONS).toHaveLength(21);
    expect(HOSTED_REST_OPERATIONS).toContainEqual({ method: "GET", path: "/studio" });
    expect(HOSTED_REST_OPERATIONS).toContainEqual({ method: "GET", path: "/dashboard" });
    expect(HOSTED_REST_OPERATIONS).toContainEqual({
      method: "GET",
      path: "/v1/learning/trace/{eventId}"
    });
    expect(HOSTED_REST_OPERATIONS).toContainEqual({
      method: "POST",
      path: "/v1/update-proposals"
    });
    expect(HOSTED_REST_OPERATIONS).toContainEqual({
      method: "POST",
      path: "/v1/evaluations/causal"
    });
    expect(HOSTED_REST_OPERATIONS).toContainEqual({
      method: "GET",
      path: "/v1/studio/snapshot"
    });
    expect(HOSTED_REST_OPERATIONS.some(({ path }) => path === "/mcp")).toBe(false);
  });

  it("returns one bounded Studio snapshot instead of composing independent reads", async () => {
    const { application } = createInMemoryApplication();
    const result = await dispatchHostedRest(
      application,
      authority,
      request("GET", ["studio", "snapshot"], { query: "?limit=1" })
    );

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      snapshot: {
        revision: 0,
        snapshotHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        atoms: { candidate: { items: [], total: 0, truncated: false } },
        evidence: { items: [], total: 0, truncated: false }
      }
    });
  });

  it("executes the governed REST lifecycle and exposes durable mutation metadata", async () => {
    const { application } = createInMemoryApplication();

    const recorded = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["corrections"], { body: correction })
    );
    const evidence = (recorded.body as { evidence: { eventId: string } }).evidence;
    expect(recorded.status).toBe(201);
    expect(recorded.headers).toMatchObject({
      etag: '"1"',
      "x-meraki-revision": "1",
      "x-meraki-idempotent-replay": "false"
    });

    const proposed = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["learning", "candidates"], {
        body: {
          event_id: evidence.eventId,
          claim: "For MerakiCore product writing, state the concrete problem and mechanism.",
          facet: "judgment.copy",
          temporal_horizon: "ongoing"
        }
      })
    );
    const candidate = (proposed.body as { lesson: { id: string; version: number; lifecycle: string } }).lesson;
    expect(candidate.lifecycle).toBe("candidate");

    const beforeApproval = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["agent", "run"], {
        body: {
          context: context({ task_id: "before-approval" }),
          request: "Draft the opening.",
          baseline: "Baseline opening"
        }
      })
    );
    expect((beforeApproval.body as { trace: { changed: boolean } }).trace.changed).toBe(false);

    const approved = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["profile", "atoms", candidate.id, "commands"], {
        body: {
          atom_id: candidate.id,
          expected_version: candidate.version,
          operation: "confirm",
          reason: "The user explicitly approved this narrow project-writing rule."
        }
      })
    );
    const active = (approved.body as { atom: { id: string; version: number; lifecycle: string } }).atom;
    expect(active.lifecycle).toBe("active");

    const related = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["agent", "run"], {
        body: {
          context: context({ task_id: "after-approval" }),
          request: "Draft the opening.",
          baseline: "Baseline opening"
        }
      })
    );
    const relatedRun = related.body as { trace: { runId: string; changed: boolean }; output: string };
    expect(relatedRun.trace.changed).toBe(true);
    expect(relatedRun.output).toContain("concrete problem and mechanism");

    const unrelated = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["agent", "run"], {
        body: {
          context: context({
            task_id: "protected-unrelated",
            task_type: "code review",
            scope: { level: "project", ref: "unrelated" },
            mode: "implementation"
          }),
          request: "Review this function.",
          baseline: "Baseline code review"
        }
      })
    );
    expect(unrelated.body).toMatchObject({
      output: "Baseline code review",
      trace: { changed: false }
    });

    const atoms = await dispatchHostedRest(
      application,
      authority,
      request("GET", ["profile", "atoms"], { query: "?limit=1" })
    );
    expect((atoms.body as { items: unknown[] }).items).toHaveLength(1);

    const atomTrace = await dispatchHostedRest(
      application,
      authority,
      request("GET", ["profile", "atoms", candidate.id, "trace"])
    );
    expect(atomTrace.body).toMatchObject({ trace: { atom: { id: candidate.id } } });

    const eventTrace = await dispatchHostedRest(
      application,
      authority,
      request("GET", ["learning", "trace", evidence.eventId])
    );
    expect(eventTrace.body).toMatchObject({ trace: { event: { id: evidence.eventId } } });

    const runs = await dispatchHostedRest(application, authority, request("GET", ["runs"], { query: "?limit=2" }));
    expect(runs.body).toMatchObject({
      items: expect.any(Array),
      total: 3,
      summary: { guidance_applied: 1, baseline_preserved: 2 }
    });
    expect((runs.body as { items: unknown[] }).items).toHaveLength(2);

    const run = await dispatchHostedRest(application, authority, request("GET", ["runs", relatedRun.trace.runId]));
    expect(run.body).toMatchObject({ run: { trace: { runId: relatedRun.trace.runId } } });

    const evaluation = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["evaluations"], {
        body: {
          run_id: relatedRun.trace.runId,
          experiment_id: "hosted-gate4",
          arm_id: "meraki_pack",
          evaluator_class: "objective",
          criteria: { accepted: 1 },
          result: "win",
          uncertainty: 0
        }
      })
    );
    expect(evaluation.status).toBe(201);
    const evaluations = await dispatchHostedRest(
      application,
      authority,
      request("GET", ["evaluations"], { query: "?limit=1" })
    );
    expect((evaluations.body as { items: unknown[] }).items).toHaveLength(1);

    await dispatchHostedRest(
      application,
      authority,
      request("POST", ["activity"], {
        body: {
          tenantId: "tenant-a",
          subjectId: "user-a",
          actorId: "user-a",
          runId: relatedRun.trace.runId,
          taskType: "product writing",
          activityType: "approval",
          content: "Accepted the concrete opening.",
          scope: correction.scope,
          mode: "direct"
        }
      })
    );
    const outcome = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["outcomes"], {
        body: {
          tenantId: "tenant-a",
          subjectId: "user-a",
          runId: relatedRun.trace.runId,
          outcomeType: "accepted",
          outcome: { accepted: 1 },
          scope: correction.scope,
          mode: "direct"
        }
      })
    );
    const outcomeEventId = (outcome.body as { evidence: { event: { id: string } } }).evidence.event.id;

    const update = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["update-proposals"], {
        body: {
          lesson_id: candidate.id,
          evidence_event_id: outcomeEventId,
          operation: "reinforce"
        }
      })
    );
    const proposalId = (update.body as { proposal: { id: string } }).proposal.id;
    const applied = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["update-proposals", proposalId, "commands"], {
        body: { operation: "approve" }
      })
    );
    expect(applied.body).toMatchObject({ proposal: { status: "applied" }, atom: { id: candidate.id } });

    const proposals = await dispatchHostedRest(
      application,
      authority,
      request("GET", ["update-proposals"], { query: "?limit=1" })
    );
    expect((proposals.body as { items: unknown[] }).items).toHaveLength(1);

    const comparison = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["evaluations", "causal"], {
        body: {
          correction,
          related: {
            context: context({ task_id: "causal-related" }),
            request: "Draft the opening.",
            baseline: "Baseline opening"
          },
          unrelated: {
            context: context({
              task_id: "causal-unrelated",
              task_type: "code review",
              scope: { level: "project", ref: "unrelated" },
              mode: "implementation"
            }),
            request: "Review this function.",
            baseline: "Baseline code review"
          },
          experiment_id: "hosted-controlled-comparison"
        }
      })
    );
    expect(comparison.body).toMatchObject({
      report: {
        experimentId: "hosted-controlled-comparison",
        relatedImproves: true,
        unrelatedUnaffected: true
      }
    });
  });

  it("replays one idempotency key, rejects stale writes, invalid limits, and identity overrides", async () => {
    const { application } = createInMemoryApplication();
    const headers = { "idempotency-key": "hosted-same-correction" };
    const firstRequest = request("POST", ["corrections"], { body: correction, headers });
    const first = await dispatchHostedRest(application, authority, firstRequest);
    const replay = await dispatchHostedRest(
      application,
      authority,
      request("POST", ["corrections"], { body: correction, headers })
    );

    expect(first.headers?.["x-meraki-idempotent-replay"]).toBe("false");
    expect(replay.headers).toMatchObject({
      "x-meraki-revision": "1",
      "x-meraki-idempotent-replay": "true"
    });
    await expect(
      dispatchHostedRest(
        application,
        authority,
        request("POST", ["activity"], {
          headers: { "if-match": '"0"' },
          body: {
            tenantId: "tenant-a",
            subjectId: "user-a",
            actorId: "user-a",
            runId: "stale",
            taskType: "writing",
            activityType: "edit",
            content: "Prefer direct writing.",
            scope: correction.scope
          }
        })
      )
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    for (const path of [["profile", "atoms"], ["update-proposals"], ["runs"], ["evaluations"]] as const) {
      await expect(
        dispatchHostedRest(application, authority, request("GET", path, { query: "?limit=0" }))
      ).rejects.toMatchObject({ code: "LIST_LIMIT_INVALID" });
      await expect(
        dispatchHostedRest(application, authority, request("GET", path, { query: "?limit=1001" }))
      ).rejects.toMatchObject({ code: "LIST_LIMIT_INVALID" });
    }
    await expect(
      dispatchHostedRest(
        application,
        authority,
        request("POST", ["corrections"], {
          body: { ...correction, subjectId: "user-b" }
        })
      )
    ).rejects.toMatchObject({ code: "identity_mismatch" });
    await expect(dispatchHostedRest(application, authority, request("GET", ["not-a-route"]))).rejects.toMatchObject({
      code: "ROUTE_NOT_FOUND"
    });
  });
});
