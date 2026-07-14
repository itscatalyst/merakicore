import { describe, expect, it } from "vitest";
import { MERAKI_MCP_TOOLS, MerakiMcpAdapter } from "./index.js";

const context = { contract: "task_context", tenant_id: "tenant-a", subject_id: "user-a", task_id: "task-a", task_type: "email", scope: { level: "project", ref: "acme" }, mode: "concise", constraints: [], permissions: [], token_budget: 1000 };
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
  it("rejects incomplete task context without throwing across the MCP boundary", async () => {
    const result = await new MerakiMcpAdapter().handle({ name: "meraki_get_guidance", arguments: { context: {} } });
    expect(result).toMatchObject({ isError: true, content: { code: "TASK_CONTEXT_INCOMPLETE" } });
  });
});
