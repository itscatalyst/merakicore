import { describe, expect, it } from "vitest";
import { ConnectedAgentRuntime } from "@meraki/api";
import { MERAKI_MCP_TOOLS, MerakiMcpAdapter } from "./index.js";

const context = { contract: "task_context", tenant_id: "tenant-a", subject_id: "user-a", task_id: "task-a", task_type: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", constraints: [], permissions: [], token_budget: 1000 };
const correction = { tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "run-a", taskType: "email", activityType: "approval" as const, content: "Approved concise subject", scope: context.scope, mode: "concise" };

describe("Meraki MCP adapter", () => {
  it("publishes only the governed retrieval/evidence tools", () => {
    expect(MERAKI_MCP_TOOLS).toEqual(["meraki_get_guidance", "meraki_get_examples", "meraki_explain_guidance", "meraki_record_feedback", "meraki_record_outcome"]);
    expect(MERAKI_MCP_TOOLS).not.toContain("profile_write");
  });
  it("records feedback and returns immutable source/event lineage", async () => {
    const result = await new MerakiMcpAdapter().handle({ name: "meraki_record_feedback", arguments: correction });
    expect(result.isError).toBeUndefined();
    expect((result.content as { evidence: { source: { trust_class: string }; event: { event_type: string } } }).evidence).toMatchObject({ source: { trust_class: "explicit_user" }, event: { event_type: "approval" } });
  });
  it("records objective outcomes", async () => {
    const result = await new MerakiMcpAdapter().handle({ name: "meraki_record_outcome", arguments: { tenantId: "tenant-a", subjectId: "user-a", runId: "run-a", outcomeType: "accepted", outcome: { accepted: true }, scope: context.scope } });
    expect((result.content as { evidence: { source: { trust_class: string } } }).evidence.source.trust_class).toBe("objective_outcome");
  });
  it("explains retrieval candidates and pack provenance", async () => {
    const adapter = new MerakiMcpAdapter();
    const result = await adapter.handle({ name: "meraki_explain_guidance", arguments: { context } });
    expect(result.isError).toBeUndefined();
    expect(result.content).toMatchObject({ candidates: [], pack: { hash: expect.stringMatching(/^sha256:/) } });
  });
  it("retrieves connected approved guidance for the matching task and mode only", async () => {
    const runtime = new ConnectedAgentRuntime();
    runtime.learn({ tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "correction-a", taskType: "email", scope: context.scope, mode: "concise", original: "Draft", correction: "Use concise subjects" });
    const adapter = new MerakiMcpAdapter(runtime);
    const related = await adapter.handle({ name: "meraki_get_guidance", arguments: { context } });
    expect(related.isError).toBeUndefined();
    expect(related.content).toMatchObject({ pack: { items: [{ guidance: expect.stringContaining("Use concise subjects") }] } });
    const unrelatedContext = { ...context, mode: "creative" };
    const unrelated = await adapter.handle({ name: "meraki_get_guidance", arguments: { context: unrelatedContext } });
    expect(unrelated.content).toMatchObject({ pack: { items: [] } });
  });
  it("keeps pack hashes deterministic, exposes examples, and excludes revoked guidance", async () => {
    const runtime = new ConnectedAgentRuntime();
    const receipt = runtime.learn({ tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "correction-b", taskType: "email", scope: context.scope, mode: "concise", original: "Draft", correction: "Use concise subjects" });
    const adapter = new MerakiMcpAdapter(runtime);
    const request = { name: "meraki_get_guidance" as const, arguments: { context } };
    const first = await adapter.handle(request);
    const second = await adapter.handle(request);
    expect((first.content as { pack: { hash: string } }).pack.hash).toBe((second.content as { pack: { hash: string } }).pack.hash);
    const examples = await adapter.handle({ name: "meraki_get_examples", arguments: { context } });
    expect(examples.content).toMatchObject([{ example: expect.stringContaining("Use concise subjects") }]);
    runtime.revoke(receipt.lesson.id, receipt.lesson.version);
    const revoked = await adapter.handle(request);
    expect(revoked.content).toMatchObject({ pack: { items: [] } });
  });
  it("rejects malformed feedback and outcome without creating evidence", async () => {
    const adapter = new MerakiMcpAdapter();
    const feedback = await adapter.handle({ name: "meraki_record_feedback", arguments: { ...correction, content: "" } });
    expect(feedback).toMatchObject({ isError: true, content: { code: "ACTIVITY_CONTENT_REQUIRED" } });
    const outcome = await adapter.handle({ name: "meraki_record_outcome", arguments: { tenantId: "tenant-a", subjectId: "user-a", runId: "run-a", outcomeType: "accepted", outcome: undefined, scope: context.scope } });
    expect(outcome.isError).toBe(true);
  });
  it("rejects incomplete task context without throwing across the MCP boundary", async () => {
    const result = await new MerakiMcpAdapter().handle({ name: "meraki_get_guidance", arguments: { context: {} } });
    expect(result).toMatchObject({ isError: true, content: { code: "TASK_CONTEXT_INCOMPLETE" } });
  });
  it("rejects tenant or subject tampering before MCP state mutation", async () => {
    const runtime = new ConnectedAgentRuntime();
    const adapter = new MerakiMcpAdapter(runtime);
    const before = runtime.snapshot();
    const guidance = await adapter.handle({ name: "meraki_get_guidance", arguments: { context: { ...context, tenant_id: "tenant-attacker" } } });
    expect(guidance).toMatchObject({ isError: true, content: { code: "identity_mismatch" } });
    const feedback = await adapter.handle({ name: "meraki_record_feedback", arguments: { ...correction, tenantId: "tenant-attacker" } });
    expect(feedback).toMatchObject({ isError: true, content: { code: "identity_mismatch" } });
    expect(runtime.snapshot()).toEqual(before);
  });
});
