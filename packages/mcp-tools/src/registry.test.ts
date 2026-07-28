import type { AuthenticatedContext } from "@meraki/auth";
import { createInMemoryApplication } from "@meraki/application";
import type { ProfileAtom, TaskContext } from "@meraki/contracts";
import { ConnectedAgentRuntime } from "@meraki/core";
import { describe, expect, it } from "vitest";
import {
  MERAKI_MCP_REGISTRY,
  MERAKI_MCP_TOOL_DESCRIPTORS,
  MERAKI_MCP_TOOLS,
  MerakiMcpRegistry,
  toolSchemas,
  type McpResponse,
  type MerakiMcpTool
} from "./index.js";

const projectScope = { level: "project" as const, ref: "acme" };
const rescopeTarget = { level: "project" as const, ref: "merakicore" };

const taskContext = (
  input: Readonly<{
    tenantId?: string;
    subjectId?: string;
    project?: string;
    mode?: string;
    permissions?: readonly string[];
  }> = {}
): TaskContext => ({
  contract: "task_context",
  tenant_id: input.tenantId ?? "tenant-a",
  subject_id: input.subjectId ?? "user-a",
  task_id: "task-email",
  task_type: "email",
  scope: { level: "project", ref: input.project ?? "acme" },
  mode: input.mode ?? "concise",
  constraints: ["subject"],
  permissions: [...(input.permissions ?? [])],
  token_budget: 500
});

const authority = (
  input: Readonly<{
    tenantId?: string;
    subjectId?: string;
    actorId?: string;
    scopes?: readonly string[];
  }> = {}
): AuthenticatedContext => ({
  tenantId: input.tenantId ?? "tenant-a",
  subjectId: input.subjectId ?? "user-a",
  actorId: input.actorId ?? "user-a",
  sessionId: "mcp-registry-test",
  scopes: new Set(input.scopes ?? ["profile:read", "profile:write", "evidence:write", "evaluation:write"])
});

const call = (
  registry: MerakiMcpRegistry,
  name: MerakiMcpTool,
  arguments_: Record<string, unknown>
): Promise<McpResponse> => registry.handle({ name, arguments: arguments_ });

const feedbackArguments = (
  input: Readonly<{
    tenantId?: string;
    subjectId?: string;
    actorId?: string;
    runId?: string;
    content?: string;
    project?: string;
  }> = {}
) => ({
  tenantId: input.tenantId ?? "tenant-a",
  subjectId: input.subjectId ?? "user-a",
  actorId: input.actorId ?? "user-a",
  runId: input.runId ?? "feedback-run",
  taskType: "email",
  activityType: "edit",
  content: input.content ?? "Replace the long subject with a concise subject",
  scope: { level: "project", ref: input.project ?? "acme" },
  mode: "concise",
  payload: { before: "A needlessly long email subject", after: "Concise project update" }
});

const packItems = (response: McpResponse): unknown[] => (response.content as { pack: { items: unknown[] } }).pack.items;

const candidateFrom = (response: McpResponse): ProfileAtom =>
  (response.content as { candidate: ProfileAtom }).candidate;

const eventIdFrom = (response: McpResponse): string =>
  (response.content as { evidence: { event: { id: string } } }).evidence.event.id;

const withSensitiveCandidate = (runtime: ConnectedAgentRuntime, atomId: string): ConnectedAgentRuntime => {
  const snapshot = structuredClone(runtime.snapshot());
  const lesson = snapshot.engine.lessons.find((candidate) => candidate.id === atomId);
  const revision = snapshot.engine.profile.history.find(([id]) => id === atomId)?.[1].at(-1);
  if (lesson === undefined || revision === undefined) throw new Error("TEST_CANDIDATE_NOT_FOUND");
  Object.assign(lesson, { sensitivity: "sensitive" as const });
  Object.assign(revision, { sensitivity: "sensitive" as const });
  return ConnectedAgentRuntime.fromSnapshot(snapshot);
};

describe("shared Meraki MCP registry contract", () => {
  it("defines every advertised tool exactly once with schemas, handler, scopes, and mutation metadata", () => {
    const names = MERAKI_MCP_REGISTRY.map((tool) => tool.name);
    expect(names).toEqual(MERAKI_MCP_TOOLS);
    expect(new Set(names).size).toBe(names.length);
    expect(Object.keys(toolSchemas).sort()).toEqual([...MERAKI_MCP_TOOLS].sort());
    expect(MERAKI_MCP_TOOL_DESCRIPTORS).toEqual(
      MERAKI_MCP_REGISTRY.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema
      }))
    );

    for (const tool of MERAKI_MCP_REGISTRY) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.requiredScopes.length).toBeGreaterThan(0);
      expect(new Set(tool.requiredScopes).size).toBe(tool.requiredScopes.length);
      expect(typeof tool.mutates).toBe("boolean");
      expect(tool.inputSchema).toEqual(toolSchemas[tool.name].input);
      expect(tool.outputSchema).toEqual(toolSchemas[tool.name].output);
      expect(tool.inputSchema).toEqual(expect.any(Object));
      expect(tool.outputSchema).toEqual(expect.any(Object));
      expect(tool.parse).toEqual(expect.any(Function));
      expect(tool.handle).toEqual(expect.any(Function));
    }
  });

  it("preserves the original five names and order while omitting auto-learning escape hatches", () => {
    expect(MERAKI_MCP_TOOLS.slice(0, 5)).toEqual([
      "meraki_get_guidance",
      "meraki_get_examples",
      "meraki_explain_guidance",
      "meraki_record_feedback",
      "meraki_record_outcome"
    ]);
    expect(MERAKI_MCP_TOOLS).not.toEqual(
      expect.arrayContaining([
        "learn",
        "meraki_learn",
        "profile_write",
        "meraki_profile_write",
        "meraki_auto_approve",
        "meraki_record_and_learn",
        "meraki_ingest_and_approve"
      ])
    );
  });

  it("declares the exact read/write boundary for every tool", () => {
    const mutations = MERAKI_MCP_REGISTRY.filter((tool) => tool.mutates).map((tool) => tool.name);
    expect(mutations).toEqual([
      "meraki_record_feedback",
      "meraki_record_outcome",
      "meraki_propose_candidate",
      "meraki_approve_candidate",
      "meraki_reject_candidate",
      "meraki_rescope_candidate",
      "meraki_revoke_atom"
    ]);
    for (const tool of MERAKI_MCP_REGISTRY) {
      expect(tool.requiredScopes).toEqual([
        tool.name === "meraki_record_feedback" || tool.name === "meraki_record_outcome"
          ? "evidence:write"
          : tool.mutates
            ? "profile:write"
            : "profile:read"
      ]);
    }
  });
});

describe("governed MCP learning lifecycle", () => {
  it("requires explicit proposal, review, rescope, approval, and revocation before behavior changes", async () => {
    const { application } = createInMemoryApplication(new ConnectedAgentRuntime());
    const registry = new MerakiMcpRegistry(application, authority());
    const originalContext = taskContext();
    const rescopedContext = taskContext({ project: "merakicore" });

    const feedback = await call(registry, "meraki_record_feedback", feedbackArguments());
    expect(feedback.isError).toBeUndefined();
    const outcome = await call(registry, "meraki_record_outcome", {
      tenantId: "tenant-a",
      subjectId: "user-a",
      runId: "feedback-run",
      outcomeType: "accepted",
      outcome: { accepted: true },
      scope: projectScope,
      mode: "concise"
    });
    expect(outcome).toMatchObject({
      content: {
        evidence: { source: { trust_class: "objective_outcome" } },
        mutation: { replayed: false }
      }
    });

    const afterFeedback = await call(registry, "meraki_list_candidates", {});
    expect(afterFeedback.content).toEqual({ candidates: [] });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: originalContext }))).toEqual([]);

    const proposed = await call(registry, "meraki_propose_candidate", {
      event_id: eventIdFrom(feedback),
      claim: "For email, use concise subject lines.",
      facet: "communication",
      temporal_horizon: "ongoing"
    });
    expect(proposed.isError).toBeUndefined();
    const firstCandidate = candidateFrom(proposed);
    expect(firstCandidate).toMatchObject({
      lifecycle: "candidate",
      version: 1,
      claim: "For email, use concise subject lines.",
      scope: projectScope,
      mode: "concise"
    });

    const listed = await call(registry, "meraki_list_candidates", {});
    expect(listed.content).toMatchObject({
      candidates: [{ id: firstCandidate.id, lifecycle: "candidate", version: 1 }]
    });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: originalContext }))).toEqual([]);
    expect(packItems(await call(registry, "meraki_get_guidance", { context: rescopedContext }))).toEqual([]);

    const explained = await call(registry, "meraki_explain_candidate", {
      candidate_id: firstCandidate.id
    });
    expect(explained.content).toMatchObject({
      candidate: { id: firstCandidate.id, lifecycle: "candidate" },
      trace: {
        event: { id: eventIdFrom(feedback) },
        observation: { epistemicClass: "direct" },
        signal: { kind: "explicit_activity" },
        hypothesis: { claim: "For email, use concise subject lines." },
        atom: { id: firstCandidate.id, lifecycle: "candidate" }
      },
      review: {
        claim: "For email, use concise subject lines.",
        source_evidence: expect.any(Array),
        scope: projectScope,
        mode: "concise",
        temporal_horizon: "ongoing",
        sensitivity: "normal",
        confidence: expect.any(Number),
        known_contradictions: [],
        expected_impact: expect.stringContaining("explicitly approved"),
        current_version: 1
      }
    });

    const rescoped = await call(registry, "meraki_rescope_candidate", {
      candidate_id: firstCandidate.id,
      expected_version: firstCandidate.version,
      reason: "Keep the rule inside MerakiCore work.",
      scope: rescopeTarget,
      mode: "concise"
    });
    const rescopedCandidate = candidateFrom(rescoped);
    expect(rescopedCandidate).toMatchObject({
      id: firstCandidate.id,
      lifecycle: "candidate",
      version: 2,
      scope: rescopeTarget
    });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: rescopedContext }))).toEqual([]);

    const approved = await call(registry, "meraki_approve_candidate", {
      candidate_id: firstCandidate.id,
      expected_version: rescopedCandidate.version,
      reason: "I explicitly approve this narrow writing rule."
    });
    const active = candidateFrom(approved);
    expect(active).toMatchObject({
      id: firstCandidate.id,
      lifecycle: "active",
      version: 3,
      scope: rescopeTarget
    });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: originalContext }))).toEqual([]);
    expect(packItems(await call(registry, "meraki_get_guidance", { context: rescopedContext }))).toMatchObject([
      {
        atom: { id: active.id, version: active.version },
        guidance: "For email, use concise subject lines."
      }
    ]);
    expect(await call(registry, "meraki_get_examples", { context: rescopedContext })).toMatchObject({
      content: [
        {
          atom: { id: active.id, version: active.version },
          example: active.claim,
          provenance: "active_scoped_mode_matched"
        }
      ]
    });
    expect(await call(registry, "meraki_explain_guidance", { context: rescopedContext })).toMatchObject({
      content: {
        candidates: [{ atom: { id: active.id }, decision: "included" }],
        pack: {
          hash: expect.stringMatching(/^sha256:/u),
          atomManifest: [{ id: active.id, version: active.version }]
        }
      }
    });

    const trace = await call(registry, "meraki_get_learning_trace", { atom_id: active.id });
    expect(trace.content).toMatchObject({
      trace: {
        source: { trust_class: "explicit_user" },
        event: { id: eventIdFrom(feedback), event_type: "edit" },
        observation: { epistemicClass: "direct" },
        signal: { kind: "explicit_activity" },
        hypothesis: { claim: active.claim },
        atom: { id: active.id, version: active.version, lifecycle: "active" }
      }
    });

    const staleRevocation = await call(registry, "meraki_revoke_atom", {
      atom_id: active.id,
      expected_version: rescopedCandidate.version,
      reason: "This stale decision must not win."
    });
    expect(staleRevocation).toEqual({
      isError: true,
      content: { code: "VERSION_CONFLICT" }
    });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: rescopedContext }))).toHaveLength(1);

    const revoked = await call(registry, "meraki_revoke_atom", {
      atom_id: active.id,
      expected_version: active.version,
      reason: "Explicit rollback after review."
    });
    expect((revoked.content as { atom: ProfileAtom }).atom).toMatchObject({
      id: active.id,
      lifecycle: "revoked",
      version: 4
    });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: rescopedContext }))).toEqual([]);
  });

  it("keeps a rejected candidate inactive and preserves its evidence lineage", async () => {
    const { application } = createInMemoryApplication(new ConnectedAgentRuntime());
    const registry = new MerakiMcpRegistry(application, authority());
    const feedback = await call(
      registry,
      "meraki_record_feedback",
      feedbackArguments({
        runId: "rejected-feedback",
        content: "Use a punchy subject in this one draft"
      })
    );
    const proposed = await call(registry, "meraki_propose_candidate", {
      event_id: eventIdFrom(feedback),
      claim: "For email, always use punchy subject lines.",
      facet: "communication"
    });
    const candidate = candidateFrom(proposed);

    const rejected = await call(registry, "meraki_reject_candidate", {
      candidate_id: candidate.id,
      expected_version: candidate.version,
      reason: "This one-off edit is not a durable preference."
    });

    expect(candidateFrom(rejected)).toMatchObject({
      id: candidate.id,
      lifecycle: "revoked",
      version: 2
    });
    expect((await call(registry, "meraki_list_candidates", {})).content).toEqual({
      candidates: []
    });
    expect(packItems(await call(registry, "meraki_get_guidance", { context: taskContext() }))).toEqual([]);
    expect(
      (await call(registry, "meraki_get_learning_trace", { event_id: eventIdFrom(feedback) })).content
    ).toMatchObject({
      trace: {
        event: { id: eventIdFrom(feedback) },
        atom: { id: candidate.id, lifecycle: "revoked" }
      }
    });
  });
});

describe("MCP registry authorization boundary", () => {
  it("rejects schema-only invalid inputs before any mutation reaches the application", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const registry = new MerakiMcpRegistry(application, authority());
    const consent = {
      status: "granted",
      purposes: ["learning"],
      recorded_at: "2026-07-28T00:00:00.000Z"
    };

    expect(
      await call(registry, "meraki_record_feedback", {
        ...feedbackArguments(),
        consent: { ...consent, purposes: ["learning", "learning"] }
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_SCHEMA_INVALID" }
    });
    expect(
      await call(registry, "meraki_record_feedback", {
        ...feedbackArguments(),
        consent: { ...consent, recorded_at: "not-a-date" }
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_SCHEMA_INVALID" }
    });
    expect(
      await call(registry, "meraki_record_feedback", {
        ...feedbackArguments(),
        consent: { ...consent, recorded_at: "2026-02-31T10:00:00Z" }
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_SCHEMA_INVALID" }
    });
    expect(
      await call(registry, "meraki_record_feedback", {
        ...feedbackArguments(),
        consent: { ...consent, recorded_at: "2026-01-01T12:00:60Z" }
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_SCHEMA_INVALID" }
    });
    expect(
      await call(registry, "meraki_get_guidance", {
        context: { ...taskContext(), mode: "" }
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_SCHEMA_INVALID" }
    });
    expect(
      await call(registry, "meraki_get_guidance", {
        context: { ...taskContext(), goal_id: "" }
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_SCHEMA_INVALID" }
    });
    expect(
      await call(registry, "meraki_record_feedback", {
        ...feedbackArguments(),
        unexpected: true
      })
    ).toEqual({
      isError: true,
      content: { code: "MCP_INPUT_ADDITIONAL_PROPERTY" }
    });

    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toEqual([]);
    expect(unitOfWork.auditEvents()).toEqual([]);
  });

  it("rejects missing scopes and identity tampering without creating evidence", async () => {
    const runtime = new ConnectedAgentRuntime();
    const { application, unitOfWork } = createInMemoryApplication(runtime);
    const readOnly = new MerakiMcpRegistry(application, authority({ scopes: ["profile:read"] }));
    const evidenceOnly = new MerakiMcpRegistry(application, authority({ scopes: ["evidence:write"] }));
    const writer = new MerakiMcpRegistry(application, authority());

    expect(await call(readOnly, "meraki_record_feedback", feedbackArguments())).toMatchObject({
      isError: true,
      content: { code: "insufficient_scope" }
    });
    expect(await call(evidenceOnly, "meraki_get_guidance", { context: taskContext() })).toMatchObject({
      isError: true,
      content: { code: "insufficient_scope" }
    });
    expect(await call(writer, "meraki_record_feedback", feedbackArguments({ tenantId: "tenant-b" }))).toMatchObject({
      isError: true,
      content: { code: "identity_mismatch" }
    });
    expect(
      await call(writer, "meraki_get_guidance", {
        context: taskContext({ subjectId: "user-b" })
      })
    ).toMatchObject({ isError: true, content: { code: "identity_mismatch" } });

    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toEqual([]);
  });

  it("hides foreign candidates and refuses cross-subject candidate review", async () => {
    const runtime = new ConnectedAgentRuntime();
    const foreignActivity = runtime.activity({
      tenantId: "tenant-a",
      subjectId: "user-b",
      actorId: "user-b",
      runId: "foreign-run",
      taskType: "email",
      activityType: "edit",
      content: "User B explicit edit",
      scope: projectScope,
      mode: "concise"
    });
    const foreign = runtime.extractActivityLesson({
      eventId: foreignActivity.event.id,
      claim: "User B private email preference."
    });
    const { application } = createInMemoryApplication(runtime);
    const registry = new MerakiMcpRegistry(application, authority());

    expect((await call(registry, "meraki_list_candidates", {})).content).toEqual({
      candidates: []
    });
    expect(await call(registry, "meraki_explain_candidate", { candidate_id: foreign.id })).toEqual({
      isError: true,
      content: { code: "CANDIDATE_NOT_FOUND" }
    });
    expect(
      await call(registry, "meraki_approve_candidate", {
        candidate_id: foreign.id,
        expected_version: foreign.version,
        reason: "Cross-subject approval must fail."
      })
    ).toMatchObject({ isError: true, content: { code: "identity_mismatch" } });
  });

  it("requires explicit sensitive authority for visibility, retrieval, and mutation", async () => {
    const runtime = new ConnectedAgentRuntime();
    const activity = runtime.activity({
      tenantId: "tenant-a",
      subjectId: "user-a",
      actorId: "user-a",
      runId: "sensitive-run",
      taskType: "email",
      activityType: "edit",
      content: "Private executive email convention",
      scope: projectScope,
      mode: "concise"
    });
    const candidate = runtime.extractActivityLesson({
      eventId: activity.event.id,
      claim: "For email, use the private executive subject convention.",
      facet: "communication"
    });
    const { application } = createInMemoryApplication(withSensitiveCandidate(runtime, candidate.id));
    const ordinary = new MerakiMcpRegistry(application, authority({ scopes: ["profile:read", "profile:write"] }));
    const sensitive = new MerakiMcpRegistry(
      application,
      authority({
        scopes: ["profile:read", "profile:write", "profile:read:sensitive", "profile:write:sensitive"]
      })
    );

    expect((await call(ordinary, "meraki_list_candidates", {})).content).toEqual({
      candidates: []
    });
    expect(
      await call(ordinary, "meraki_approve_candidate", {
        candidate_id: candidate.id,
        expected_version: candidate.version,
        reason: "Ordinary profile write cannot govern sensitive memory."
      })
    ).toMatchObject({ isError: true, content: { code: "insufficient_scope" } });

    const approved = await call(sensitive, "meraki_approve_candidate", {
      candidate_id: candidate.id,
      expected_version: candidate.version,
      reason: "Explicit sensitive review."
    });
    const active = candidateFrom(approved);
    expect(active.lifecycle).toBe("active");

    const callerSmuggled = await call(ordinary, "meraki_get_guidance", {
      context: taskContext({ permissions: ["read:sensitive"] })
    });
    expect(packItems(callerSmuggled)).toEqual([]);
    const authorized = await call(sensitive, "meraki_get_guidance", {
      context: taskContext({ permissions: ["read:sensitive"] })
    });
    expect(packItems(authorized)).toMatchObject([{ atom: { id: active.id }, guidance: active.claim }]);
  });
});
