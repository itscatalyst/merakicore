import type { AuthenticatedContext } from "@meraki/auth";
import { createInMemoryApplication } from "@meraki/application";
import {
  MERAKI_MCP_REGISTRY as SHARED_REGISTRY,
  MERAKI_MCP_TOOL_DESCRIPTORS as SHARED_DESCRIPTORS
} from "@meraki/mcp-tools";
import { describe, expect, it } from "vitest";
import { MERAKI_MCP_REGISTRY, MERAKI_MCP_TOOL_DESCRIPTORS, MERAKI_MCP_TOOLS, MerakiMcpAdapter } from "./index.js";

const context = {
  contract: "task_context" as const,
  tenant_id: "tenant-a",
  subject_id: "user-a",
  task_id: "task-a",
  task_type: "email",
  scope: { level: "project" as const, ref: "acme" },
  mode: "concise",
  constraints: ["subject"],
  permissions: [],
  token_budget: 1000
};

const correction = {
  tenantId: "tenant-a",
  subjectId: "user-a",
  actorId: "user-a",
  runId: "run-a",
  taskType: "email",
  activityType: "approval" as const,
  content: "Approved concise subject",
  scope: context.scope,
  mode: "concise"
};

const authority = (
  scopes: readonly string[] = ["profile:read", "profile:write", "evidence:write"]
): AuthenticatedContext => ({
  tenantId: "tenant-a",
  subjectId: "user-a",
  actorId: "user-a",
  sessionId: "mcp-test",
  scopes: new Set(scopes)
});

const adapter = (authenticated = authority()): MerakiMcpAdapter => {
  const { application } = createInMemoryApplication();
  return new MerakiMcpAdapter(application, authenticated);
};

const approveGuidance = async (mcp: MerakiMcpAdapter) => {
  const feedback = await mcp.handle({
    name: "meraki_record_feedback",
    arguments: {
      ...correction,
      activityType: "edit",
      content: "Replace the long subject with a concise subject",
      payload: { before: "Long subject", after: "Concise subject" }
    }
  });
  const eventId = (feedback.content as { evidence: { event: { id: string } } }).evidence.event.id;
  const proposed = await mcp.handle({
    name: "meraki_propose_candidate",
    arguments: {
      event_id: eventId,
      claim: "For email, use concise subject lines.",
      facet: "communication"
    }
  });
  const candidate = (proposed.content as { candidate: { id: string; version: number } }).candidate;
  const approved = await mcp.handle({
    name: "meraki_approve_candidate",
    arguments: {
      candidate_id: candidate.id,
      expected_version: candidate.version,
      reason: "Explicit test approval"
    }
  });
  return approved.content as {
    candidate: { id: string; version: number; claim: string };
  };
};

describe("Meraki MCP local adapter", () => {
  it("re-exports the one shared registry and keeps the original five tools stable", () => {
    expect(MERAKI_MCP_REGISTRY).toBe(SHARED_REGISTRY);
    expect(MERAKI_MCP_TOOL_DESCRIPTORS).toBe(SHARED_DESCRIPTORS);
    expect(MERAKI_MCP_TOOLS.slice(0, 5)).toEqual([
      "meraki_get_guidance",
      "meraki_get_examples",
      "meraki_explain_guidance",
      "meraki_record_feedback",
      "meraki_record_outcome"
    ]);
    expect(MERAKI_MCP_TOOLS).toContain("meraki_propose_candidate");
    expect(MERAKI_MCP_TOOLS).toContain("meraki_approve_candidate");
    expect(MERAKI_MCP_TOOLS).toContain("meraki_revoke_atom");
    expect(MERAKI_MCP_TOOLS).not.toContain("meraki_learn");
  });

  it("records feedback as evidence without implicitly creating a candidate", async () => {
    const mcp = adapter();
    const feedback = await mcp.handle({
      name: "meraki_record_feedback",
      arguments: correction
    });
    expect(feedback.isError).toBeUndefined();
    expect(
      (
        feedback.content as {
          evidence: {
            source: { trust_class: string };
            event: { event_type: string };
          };
        }
      ).evidence
    ).toMatchObject({
      source: { trust_class: "explicit_user" },
      event: { event_type: "approval" }
    });
    expect(await mcp.handle({ name: "meraki_list_candidates", arguments: {} })).toMatchObject({
      content: { candidates: [] }
    });
  });

  it("records objective outcomes through the shared application boundary", async () => {
    const result = await adapter().handle({
      name: "meraki_record_outcome",
      arguments: {
        tenantId: "tenant-a",
        subjectId: "user-a",
        runId: "run-a",
        outcomeType: "accepted",
        outcome: { accepted: true },
        scope: context.scope
      }
    });
    expect((result.content as { evidence: { source: { trust_class: string } } }).evidence.source.trust_class).toBe(
      "objective_outcome"
    );
  });

  it("retrieves, explains, and exemplifies explicitly approved guidance only", async () => {
    const mcp = adapter();
    const { candidate: active } = await approveGuidance(mcp);
    const related = await mcp.handle({
      name: "meraki_get_guidance",
      arguments: { context }
    });
    const explained = await mcp.handle({
      name: "meraki_explain_guidance",
      arguments: { context }
    });
    const examples = await mcp.handle({
      name: "meraki_get_examples",
      arguments: { context }
    });
    const unrelated = await mcp.handle({
      name: "meraki_get_guidance",
      arguments: { context: { ...context, mode: "creative" } }
    });

    expect(related).toMatchObject({
      content: {
        pack: {
          atom_manifest: [{ id: active.id, version: active.version }],
          items: [{ guidance: "For email, use concise subject lines." }]
        }
      }
    });
    expect(explained.content).toMatchObject({
      candidates: [
        {
          atom: { id: active.id, version: active.version },
          decision: "included"
        }
      ],
      pack: {
        hash: expect.stringMatching(/^sha256:/u),
        atomManifest: [{ id: active.id, version: active.version }]
      }
    });
    expect(examples.content).toMatchObject([
      {
        atom: { id: active.id, version: active.version },
        example: "For email, use concise subject lines."
      }
    ]);
    expect(unrelated.content).toMatchObject({ pack: { items: [] } });
  });

  it("returns deterministic pack hashes for unchanged state", async () => {
    const mcp = adapter();
    await approveGuidance(mcp);
    const request = {
      name: "meraki_get_guidance" as const,
      arguments: { context }
    };
    const hashes = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const response = await mcp.handle(request);
        return (response.content as { pack: { hash: string } }).pack.hash;
      })
    );
    expect(new Set(hashes).size).toBe(1);
    expect(hashes[0]).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("maps malformed tool input to deterministic MCP content errors", async () => {
    const mcp = adapter();
    expect(
      await mcp.handle({
        name: "meraki_record_feedback",
        arguments: { ...correction, content: "" }
      })
    ).toEqual({
      isError: true,
      content: { code: "ACTIVITY_CONTENT_REQUIRED" }
    });
    expect(
      await mcp.handle({
        name: "meraki_get_guidance",
        arguments: { context: {} }
      })
    ).toEqual({
      isError: true,
      content: { code: "TASK_CONTEXT_INCOMPLETE" }
    });
    expect(
      await mcp.handle({
        name: "meraki_get_learning_trace",
        arguments: { event_id: "one", atom_id: "two" }
      })
    ).toEqual({
      isError: true,
      content: { code: "EXACTLY_ONE_TRACE_ID_REQUIRED" }
    });
  });

  it("enforces read, evidence-write, profile-write, and identity boundaries", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const readOnly = new MerakiMcpAdapter(application, authority(["profile:read"]));
    const evidenceOnly = new MerakiMcpAdapter(application, authority(["evidence:write"]));
    const writer = new MerakiMcpAdapter(application, authority());

    expect(
      await readOnly.handle({
        name: "meraki_record_feedback",
        arguments: correction
      })
    ).toMatchObject({
      isError: true,
      content: { code: "insufficient_scope" }
    });
    expect(
      await evidenceOnly.handle({
        name: "meraki_get_guidance",
        arguments: { context }
      })
    ).toMatchObject({
      isError: true,
      content: { code: "insufficient_scope" }
    });
    expect(
      await readOnly.handle({
        name: "meraki_approve_candidate",
        arguments: {
          candidate_id: "missing",
          expected_version: 1,
          reason: "No write authority"
        }
      })
    ).toMatchObject({
      isError: true,
      content: { code: "insufficient_scope" }
    });
    expect(
      await writer.handle({
        name: "meraki_record_feedback",
        arguments: { ...correction, subjectId: "user-b" }
      })
    ).toMatchObject({
      isError: true,
      content: { code: "identity_mismatch" }
    });
    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toEqual([]);
  });

  it("uses canonical scope validation at the adapter edge", async () => {
    const mcp = adapter();
    expect(
      await mcp.handle({
        name: "meraki_record_feedback",
        arguments: { ...correction, scope: { level: "project" } }
      })
    ).toMatchObject({
      isError: true,
      content: { code: "SCOPE_REF_REQUIRED" }
    });
    expect(
      await mcp.handle({
        name: "meraki_get_guidance",
        arguments: {
          context: { ...context, permissions: ["read:sensitive", "read:sensitive"] }
        }
      })
    ).toMatchObject({
      isError: true,
      content: { code: "TASK_CONTEXT_INVALID" }
    });
  });
});
