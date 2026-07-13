import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";
import { ConnectedAgentRuntime } from "./runtime.js";

const context = (overrides: Record<string, unknown> = {}) => ({ contract: "task_context" as const, tenant_id: "tenant-a", subject_id: "user-a", task_id: "task-1", task_type: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", constraints: [], permissions: [], token_budget: 1000, ...overrides });
const correction = { tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "run-a", taskType: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", original: "Draft email", correction: "Use a concise subject" };

describe("connected agent adapter", () => {
  it("changes a relevant run and returns a trace, while unrelated mode stays baseline", () => {
    const runtime = new ConnectedAgentRuntime();
    runtime.learn(correction);
    const related = runtime.run({ context: context(), request: "Draft", baseline: "BASELINE" });
    const unrelated = runtime.run({ context: context({ mode: "creative" }), request: "Draft", baseline: "BASELINE" });
    expect(related.output).toContain("Meraki guidance applied");
    expect(related.trace.changed).toBe(true);
    expect(related.trace.appliedAtomIds).toHaveLength(1);
    expect(unrelated.output).toBe("BASELINE");
    expect(unrelated.trace.changed).toBe(false);
  });

  it("exposes correction and run over REST with immutable evidence and trace", async () => {
    const server = buildServer();
    const response = await server.inject({ method: "POST", url: "/v1/learning", payload: correction });
    expect(response.statusCode).toBe(201);
    const evidence = response.json<{ evidence: { eventId: string } }>().evidence;
    expect(evidence.eventId).toBeTypeOf("string");
    const runResponse = await server.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } });
    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json<{ output: string; trace: { changed: boolean } }>().output).toContain("Meraki guidance applied");
    expect(runResponse.json<{ output: string; trace: { changed: boolean } }>().trace.changed).toBe(true);
  });
});
