import type { AuthenticatedContext } from "@meraki/auth";
import type { ProfileAtom, TaskContext } from "@meraki/contracts";
import { ConnectedAgentRuntime } from "@meraki/core";
import { describe, expect, it, vi } from "vitest";
import type { MerakiCommand, MutationEnvelope } from "./commands.js";
import { createInMemoryApplication } from "./service.js";

type RecordActivityCommand = Extract<MerakiCommand, Readonly<{ name: "record_activity" }>>;

type ActivityRequestOptions = Readonly<{
  tenantId?: string;
  subjectId?: string;
  actorId?: string;
  runId?: string;
  content?: string;
  requestId?: string;
  idempotencyKey?: string;
  expectedRevision?: number;
}>;

const projectScope = { level: "project" as const, ref: "acme" };

const authority = (
  input: Readonly<{
    tenantId?: string;
    subjectId?: string;
    actorId?: string;
    sessionId?: string;
    scopes?: readonly string[];
  }> = {}
): AuthenticatedContext => ({
  tenantId: input.tenantId ?? "tenant-a",
  subjectId: input.subjectId ?? "user-a",
  actorId: input.actorId ?? "user-a",
  sessionId: input.sessionId ?? "session-a",
  scopes: new Set(input.scopes ?? ["profile:read", "profile:write", "evidence:write"])
});

const activityRequest = (
  index: number,
  options: ActivityRequestOptions = {}
): MutationEnvelope<RecordActivityCommand> => ({
  requestId: options.requestId ?? `request-${index}`,
  idempotencyKey: options.idempotencyKey ?? `activity-${index}`,
  ...(options.expectedRevision === undefined ? {} : { expectedRevision: options.expectedRevision }),
  command: {
    name: "record_activity",
    input: {
      tenantId: options.tenantId ?? "tenant-a",
      subjectId: options.subjectId ?? "user-a",
      actorId: options.actorId ?? "user-a",
      runId: options.runId ?? `run-${index}`,
      taskType: "email",
      activityType: "edit",
      content: options.content ?? `Use concise subject line ${index}`,
      scope: projectScope,
      mode: "concise",
      payload: { before: `Long subject ${index}`, after: `Short subject ${index}` }
    }
  }
});

const taskContext = (
  input: Readonly<{
    tenantId?: string;
    subjectId?: string;
    permissions?: readonly string[];
  }> = {}
): TaskContext => ({
  contract: "task_context",
  tenant_id: input.tenantId ?? "tenant-a",
  subject_id: input.subjectId ?? "user-a",
  task_id: "task-a",
  task_type: "email",
  scope: projectScope,
  mode: "concise",
  constraints: [],
  permissions: [...(input.permissions ?? [])],
  token_budget: 100
});

const seedApprovedAtom = (
  runtime: ConnectedAgentRuntime,
  input: Readonly<{
    tenantId?: string;
    subjectId?: string;
    actorId?: string;
    suffix: string;
    claim: string;
  }>
): ProfileAtom => {
  const tenantId = input.tenantId ?? "tenant-a";
  const subjectId = input.subjectId ?? "user-a";
  const activity = runtime.activity({
    tenantId,
    subjectId,
    actorId: input.actorId ?? subjectId,
    runId: `seed-${input.suffix}`,
    taskType: "email",
    activityType: "edit",
    content: `Explicit edit ${input.suffix}`,
    scope: projectScope,
    mode: "concise",
    payload: { before: "Long subject", after: "Short subject" }
  });
  const candidate = runtime.extractActivityLesson({
    eventId: activity.event.id,
    claim: input.claim,
    facet: "communication",
    temporalHorizon: "ongoing"
  });
  return runtime.approve(candidate.id, candidate.version);
};

const withSensitiveAtom = (runtime: ConnectedAgentRuntime, atomId: string): ConnectedAgentRuntime => {
  const snapshot = structuredClone(runtime.snapshot());
  const lesson = snapshot.engine.lessons.find((candidate) => candidate.id === atomId);
  const history = snapshot.engine.profile.history.find(([id]) => id === atomId)?.[1];
  const currentRevision = history?.at(-1);
  if (lesson === undefined || currentRevision === undefined) throw new Error("TEST_ATOM_NOT_FOUND");
  Object.assign(lesson, { sensitivity: "sensitive" as const });
  Object.assign(currentRevision, { sensitivity: "sensitive" as const });
  return ConnectedAgentRuntime.fromSnapshot(snapshot);
};

describe("Meraki application command boundary", () => {
  it("denies insufficient scope and mismatched identity before state or persistence can mutate", async () => {
    const persist = vi.fn(() => Promise.resolve());
    const { application, unitOfWork } = createInMemoryApplication(new ConnectedAgentRuntime(), persist);

    await expect(application.mutate(authority({ scopes: ["profile:read"] }), activityRequest(1))).rejects.toMatchObject(
      { code: "insufficient_scope" }
    );
    await expect(
      application.mutate(
        authority({ scopes: ["profile:read", "evidence:write"] }),
        activityRequest(2, { subjectId: "user-b" })
      )
    ).rejects.toMatchObject({ code: "identity_mismatch" });

    const snapshot = (await unitOfWork.currentRuntime()).snapshot();
    expect(snapshot.engine.evidenceLedger.events).toEqual([]);
    expect(snapshot.engine.evidenceLedger.sources).toEqual([]);
    expect(persist).not.toHaveBeenCalled();
    expect(unitOfWork.auditEvents()).toEqual([]);
  });

  it("serves queries from an isolated clone without changing runtime state or revision", async () => {
    const runtime = new ConnectedAgentRuntime();
    seedApprovedAtom(runtime, {
      suffix: "query",
      claim: "For email, use concise subject lines."
    });
    const { application, unitOfWork } = createInMemoryApplication(runtime);
    const before = (await unitOfWork.currentRuntime()).snapshot();

    const atoms = await application.query(authority(), { name: "list_atoms" });
    const retrieval = await application.query(authority(), { name: "retrieve", input: taskContext() });

    expect(atoms).toHaveLength(1);
    expect(retrieval.pack.items).toHaveLength(1);
    expect((await unitOfWork.currentRuntime()).snapshot()).toEqual(before);
    expect(unitOfWork.auditEvents()).toEqual([]);
  });

  it("returns a bounded, one-revision Studio snapshot with visible evidence and lifecycle groups", async () => {
    const runtime = new ConnectedAgentRuntime();
    seedApprovedAtom(runtime, {
      suffix: "studio-snapshot",
      claim: "For Studio, show the evidence before changing governed state."
    });
    runtime.run({
      context: { ...taskContext(), task_id: "studio-snapshot-run" },
      request: "Inspect the current Meraki state",
      baseline: "No guidance"
    });
    const { application } = createInMemoryApplication(runtime);
    const snapshot = await application.query(authority(), {
      name: "studio_snapshot",
      input: { limit: 1 }
    });

    expect(snapshot.revision).toBe(0);
    expect(snapshot.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(snapshot.atoms.active.total).toBe(1);
    expect(snapshot.atoms.active.items).toHaveLength(1);
    expect(snapshot.runs.total).toBe(1);
    expect(snapshot.runs.items).toHaveLength(1);
    expect(snapshot.evidence.total).toBeGreaterThan(0);
    expect(snapshot.evidence.items).toHaveLength(1);
    expect(snapshot.evidence.truncated).toBe(false);
    expect(snapshot.evidence.items[0]?.evidenceSpans).toEqual([]);

    const sensitiveSnapshot = await application.query(
      authority({ scopes: ["profile:read", "profile:write", "evidence:write", "read:sensitive"] }),
      { name: "studio_snapshot", input: { limit: 1 } }
    );
    expect(sensitiveSnapshot.evidence.items[0]?.evidenceSpans.length).toBeGreaterThan(0);
  });

  it("bounds list queries and computes run-page totals behind the application boundary", async () => {
    const runtime = new ConnectedAgentRuntime();
    for (const index of [1, 2, 3]) {
      seedApprovedAtom(runtime, {
        suffix: `bounded-${index}`,
        claim: `For email variant ${index}, use concise subject lines.`
      });
      runtime.run({
        context: { ...taskContext(), task_id: `bounded-task-${index}` },
        request: `Draft email ${index}`,
        baseline: `Baseline ${index}`
      });
    }
    const { application } = createInMemoryApplication(runtime);

    const atoms = await application.query(authority(), { name: "list_atoms", input: { limit: 2 } });
    const page = await application.query(authority(), { name: "list_run_page", input: { limit: 2 } });

    expect(atoms).toHaveLength(2);
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(3);
    expect(page.summary.guidanceApplied + page.summary.baselinePreserved).toBe(3);
    await expect(
      application.query(authority(), { name: "list_evaluations", input: { limit: 0 } })
    ).rejects.toMatchObject({ code: "LIST_LIMIT_INVALID" });
    await expect(
      application.query(authority(), { name: "list_update_proposals", input: { limit: 1001 } })
    ).rejects.toMatchObject({ code: "LIST_LIMIT_INVALID" });
  });

  it("runs the controlled comparison as an authorized read without changing durable state", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const comparison = {
      correction: {
        tenantId: "tenant-a",
        subjectId: "user-a",
        actorId: "user-a",
        runId: "causal-correction",
        taskType: "email",
        scope: projectScope,
        mode: "concise",
        original: "Use a long subject line.",
        correction: "Use a concise subject line."
      },
      related: {
        context: { ...taskContext(), task_id: "causal-related" },
        request: "Draft a project email.",
        baseline: "A long project email subject"
      },
      unrelated: {
        context: {
          ...taskContext(),
          task_id: "causal-unrelated",
          task_type: "code",
          scope: { level: "project" as const, ref: "unrelated" },
          mode: "implementation"
        },
        request: "Review this function.",
        baseline: "Baseline code review"
      },
      experimentId: "causal-application-boundary"
    };
    const fullAuthority = authority({
      scopes: ["profile:read", "profile:write", "evidence:write", "evaluation:write"]
    });
    const before = (await unitOfWork.currentRuntime()).snapshot();

    const report = await application.query(fullAuthority, {
      name: "run_controlled_comparison",
      input: comparison
    });

    expect(report.experimentId).toBe("causal-application-boundary");
    expect(report.arms.merakiPack.related.trace.changed).toBe(true);
    expect((await unitOfWork.currentRuntime()).snapshot()).toEqual(before);
    expect(unitOfWork.auditEvents()).toEqual([]);
    await expect(
      application.query(authority(), { name: "run_controlled_comparison", input: comparison })
    ).rejects.toMatchObject({ code: "insufficient_scope" });
    await expect(
      application.query(fullAuthority, {
        name: "run_controlled_comparison",
        input: {
          ...comparison,
          correction: { ...comparison.correction, subjectId: "user-b" }
        }
      })
    ).rejects.toMatchObject({ code: "identity_mismatch" });
  });

  it("rolls back the candidate runtime atomically when persistence fails", async () => {
    let failPersistence = true;
    const persist = vi.fn(() => (failPersistence ? Promise.reject(new Error("DISK_WRITE_FAILED")) : Promise.resolve()));
    const { application, unitOfWork } = createInMemoryApplication(new ConnectedAgentRuntime(), persist);
    const request = activityRequest(1);

    await expect(application.mutate(authority(), request)).rejects.toMatchObject({
      code: "PERSISTENCE_FAILED",
      retryable: true
    });
    const rolledBack = (await unitOfWork.currentRuntime()).snapshot();
    expect(rolledBack.engine.evidenceLedger.events).toEqual([]);
    expect(rolledBack.engine.evidenceLedger.sources).toEqual([]);
    expect(unitOfWork.auditEvents()[0]).toMatchObject({
      outcome: "failed",
      errorCode: "PERSISTENCE_FAILED",
      revision: 0
    });
    expect(unitOfWork.auditEvents()[0]?.afterHash).toBe(unitOfWork.auditEvents()[0]?.beforeHash);

    failPersistence = false;
    const committed = await application.mutate(authority(), request);
    expect(committed).toMatchObject({ replayed: false, revision: 1 });
    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("serializes 20 concurrent activity commands without losing events", async () => {
    const persist = vi.fn(async () => {
      await Promise.resolve();
    });
    const { application, unitOfWork } = createInMemoryApplication(new ConnectedAgentRuntime(), persist);

    const receipts = await Promise.all(
      Array.from({ length: 20 }, (_, index) => application.mutate(authority(), activityRequest(index)))
    );
    const eventIds = receipts.map((receipt) => receipt.value.event.id);
    const snapshot = (await unitOfWork.currentRuntime()).snapshot();

    expect(new Set(eventIds)).toHaveLength(20);
    expect(receipts.map((receipt) => receipt.revision)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(snapshot.engine.evidenceLedger.events).toHaveLength(20);
    expect(snapshot.engine.evidenceLedger.sources).toHaveLength(20);
    expect(snapshot.engine.evidenceLedger.observations).toHaveLength(20);
    expect(persist).toHaveBeenCalledTimes(20);
    expect(unitOfWork.auditEvents().map((event) => event.revision)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
  });

  it("replays the same command under one idempotency key without applying it twice", async () => {
    const persist = vi.fn(() => Promise.resolve());
    const { application, unitOfWork } = createInMemoryApplication(new ConnectedAgentRuntime(), persist);
    const firstRequest = activityRequest(1, { idempotencyKey: "stable-key", requestId: "first-request" });
    const replayRequest = activityRequest(1, { idempotencyKey: "stable-key", requestId: "replay-request" });

    const first = await application.mutate(authority(), firstRequest);
    const replay = await application.mutate(authority(), replayRequest);

    expect(first).toMatchObject({ replayed: false, revision: 1 });
    expect(replay).toMatchObject({ replayed: true, revision: 1 });
    expect(replay.value.event.id).toBe(first.value.event.id);
    expect(replay.snapshotHash).toBe(first.snapshotHash);
    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(unitOfWork.auditEvents().map((event) => event.outcome)).toEqual(["committed", "replayed"]);
  });

  it("rejects stale expected revisions without changing state while preserving exact idempotent replay", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const original = activityRequest(1, {
      idempotencyKey: "revision-bound",
      requestId: "revision-first",
      expectedRevision: 0
    });
    const first = await application.mutate(authority(), original);

    await expect(
      application.mutate(
        authority(),
        activityRequest(2, {
          idempotencyKey: "stale-new-command",
          expectedRevision: 0
        })
      )
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT", retryable: true });
    const replay = await application.mutate(authority(), {
      ...original,
      requestId: "revision-replay"
    });

    expect(first).toMatchObject({ replayed: false, revision: 1 });
    expect(replay).toMatchObject({ replayed: true, revision: 1 });
    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toHaveLength(1);
    expect(unitOfWork.auditEvents().map(({ outcome, errorCode }) => ({ outcome, errorCode }))).toEqual([
      { outcome: "committed", errorCode: undefined },
      { outcome: "failed", errorCode: "REVISION_CONFLICT" },
      { outcome: "replayed", errorCode: undefined }
    ]);
  });

  it("rejects malformed expected revisions before persistence", async () => {
    const persist = vi.fn(() => Promise.resolve());
    const { application } = createInMemoryApplication(new ConnectedAgentRuntime(), persist);

    await expect(
      application.mutate(authority(), {
        ...activityRequest(1),
        expectedRevision: -1
      })
    ).rejects.toMatchObject({ code: "EXPECTED_REVISION_INVALID" });
    await expect(
      application.mutate(authority(), {
        ...activityRequest(2),
        expectedRevision: 1.5
      })
    ).rejects.toMatchObject({ code: "EXPECTED_REVISION_INVALID" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("authorizes every replay before consulting idempotency state", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const request = activityRequest(1, { idempotencyKey: "authorized-once" });
    await application.mutate(authority(), request);

    await expect(
      application.mutate(authority({ scopes: ["profile:read"] }), {
        ...request,
        requestId: "unauthorized-replay"
      })
    ).rejects.toMatchObject({ code: "insufficient_scope" });

    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toHaveLength(1);
    expect(unitOfWork.auditEvents().map((event) => event.outcome)).toEqual(["committed"]);
  });

  it("does not let a read-only authority create durable run history", async () => {
    const { application, unitOfWork } = createInMemoryApplication();

    await expect(
      application.mutate(authority({ scopes: ["profile:read"] }), {
        requestId: "read-only-run",
        idempotencyKey: "read-only-run",
        command: {
          name: "run_agent",
          input: {
            context: taskContext(),
            request: "Draft an email",
            baseline: "BASELINE"
          }
        }
      })
    ).rejects.toMatchObject({ code: "insufficient_scope" });

    expect((await unitOfWork.currentRuntime()).recentRuns()).toEqual([]);
    expect(unitOfWork.auditEvents()).toEqual([]);
  });

  it("keeps candidate-only rescope and rejection guards from mutating an active atom", async () => {
    const runtime = new ConnectedAgentRuntime();
    const active = seedApprovedAtom(runtime, {
      suffix: "candidate-only",
      claim: "For email, use concise subject lines."
    });
    const before = runtime.snapshot();
    const persist = vi.fn(() => Promise.resolve());
    const { application, unitOfWork } = createInMemoryApplication(runtime, persist);

    await expect(
      application.mutate(authority(), {
        requestId: "candidate-rescope-active",
        idempotencyKey: "candidate-rescope-active",
        command: {
          name: "command_atom",
          input: {
            atomId: active.id,
            expectedVersion: active.version,
            requiredLifecycles: ["candidate"],
            operation: "rescope",
            scope: { level: "project", ref: "other-project" }
          }
        }
      })
    ).rejects.toMatchObject({ code: "ATOM_LIFECYCLE_PRECONDITION_FAILED" });
    await expect(
      application.mutate(authority(), {
        requestId: "candidate-reject-active",
        idempotencyKey: "candidate-reject-active",
        command: {
          name: "command_atom",
          input: {
            atomId: active.id,
            expectedVersion: active.version,
            requiredLifecycles: ["candidate"],
            operation: "revoke"
          }
        }
      })
    ).rejects.toMatchObject({ code: "ATOM_LIFECYCLE_PRECONDITION_FAILED" });

    expect((await unitOfWork.currentRuntime()).snapshot()).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
    expect(unitOfWork.auditEvents()).toMatchObject([
      { outcome: "failed", errorCode: "ATOM_LIFECYCLE_PRECONDITION_FAILED", revision: 0 },
      { outcome: "failed", errorCode: "ATOM_LIFECYCLE_PRECONDITION_FAILED", revision: 0 }
    ]);
  });

  it("fails a stale candidate lifecycle precondition atomically without persistence", async () => {
    const runtime = new ConnectedAgentRuntime();
    const activity = runtime.activity({
      tenantId: "tenant-a",
      subjectId: "user-a",
      actorId: "user-a",
      runId: "seed-stale-lifecycle",
      taskType: "email",
      activityType: "edit",
      content: "Explicit edit stale lifecycle",
      scope: projectScope,
      mode: "concise",
      payload: { before: "Long subject", after: "Short subject" }
    });
    const candidate = runtime.extractActivityLesson({
      eventId: activity.event.id,
      claim: "For email, use concise subject lines.",
      facet: "communication",
      temporalHorizon: "ongoing"
    });
    const persist = vi.fn(() => Promise.resolve());
    const { application, unitOfWork } = createInMemoryApplication(runtime, persist);
    const staleRescope = {
      requestId: "stale-candidate-rescope",
      idempotencyKey: "stale-candidate-rescope",
      command: {
        name: "command_atom" as const,
        input: {
          atomId: candidate.id,
          expectedVersion: candidate.version,
          requiredLifecycles: ["candidate"] as const,
          operation: "rescope" as const,
          scope: { level: "project" as const, ref: "other-project" }
        }
      }
    };

    const approval = await application.mutate(authority(), {
      requestId: "activate-candidate",
      idempotencyKey: "activate-candidate",
      command: {
        name: "command_atom",
        input: {
          atomId: candidate.id,
          expectedVersion: candidate.version,
          requiredLifecycles: ["candidate"],
          operation: "confirm"
        }
      }
    });
    await expect(application.mutate(authority(), staleRescope)).rejects.toMatchObject({
      code: "ATOM_LIFECYCLE_PRECONDITION_FAILED"
    });

    const current = (await unitOfWork.currentRuntime()).profileAtoms().find((atom) => atom.id === candidate.id);
    expect(approval.value).toMatchObject({ lifecycle: "active", version: candidate.version + 1 });
    expect(current).toMatchObject({
      lifecycle: "active",
      version: candidate.version + 1,
      scope: projectScope
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(unitOfWork.auditEvents()).toMatchObject([
      { outcome: "committed", revision: 1 },
      {
        outcome: "failed",
        errorCode: "ATOM_LIFECYCLE_PRECONDITION_FAILED",
        revision: 1
      }
    ]);
    expect(unitOfWork.auditEvents()[1]?.afterHash).toBe(unitOfWork.auditEvents()[1]?.beforeHash);
  });

  it("rechecks sensitive atom authority before an idempotent replay", async () => {
    const runtime = new ConnectedAgentRuntime();
    const atom = seedApprovedAtom(runtime, {
      suffix: "sensitive-command",
      claim: "For email, use the private executive subject convention."
    });
    const { application, unitOfWork } = createInMemoryApplication(withSensitiveAtom(runtime, atom.id));
    const request = {
      requestId: "sensitive-edit",
      idempotencyKey: "sensitive-edit",
      command: {
        name: "command_atom" as const,
        input: {
          atomId: atom.id,
          expectedVersion: atom.version,
          operation: "edit" as const,
          claim: "For executive email, use the private concise subject convention."
        }
      }
    };

    const first = await application.mutate(
      authority({ scopes: ["profile:write", "profile:write:sensitive"] }),
      request
    );
    await expect(
      application.mutate(authority({ scopes: ["profile:write"] }), {
        ...request,
        requestId: "sensitive-edit-replay"
      })
    ).rejects.toMatchObject({ code: "insufficient_scope" });

    expect(first.replayed).toBe(false);
    expect(unitOfWork.auditEvents().map((event) => event.outcome)).toEqual(["committed", "failed"]);
  });

  it("binds sensitive run replays to the effective authority scopes", async () => {
    const runtime = new ConnectedAgentRuntime();
    const atom = seedApprovedAtom(runtime, {
      suffix: "sensitive-replay",
      claim: "For email, use the private executive subject convention."
    });
    const { application, unitOfWork } = createInMemoryApplication(withSensitiveAtom(runtime, atom.id));
    const request = {
      requestId: "sensitive-run",
      idempotencyKey: "sensitive-run",
      command: {
        name: "run_agent" as const,
        input: {
          context: taskContext({ permissions: ["read:sensitive"] }),
          request: "Draft an email",
          baseline: "BASELINE"
        }
      }
    };

    await application.mutate(authority({ scopes: ["profile:read", "evidence:write", "read:sensitive"] }), request);
    await expect(
      application.mutate(authority({ scopes: ["profile:read", "evidence:write"] }), {
        ...request,
        requestId: "sensitive-run-replay"
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    expect((await unitOfWork.currentRuntime()).recentRuns()).toHaveLength(1);
    expect(unitOfWork.auditEvents().map((event) => event.outcome)).toEqual(["committed", "failed"]);
  });

  it("rejects a different command that reuses an idempotency key", async () => {
    const persist = vi.fn(() => Promise.resolve());
    const { application, unitOfWork } = createInMemoryApplication(new ConnectedAgentRuntime(), persist);
    await application.mutate(
      authority(),
      activityRequest(1, { idempotencyKey: "conflicting-key", content: "Use a concise subject" })
    );

    await expect(
      application.mutate(
        authority(),
        activityRequest(2, { idempotencyKey: "conflicting-key", content: "Use an expansive subject" })
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });

    expect((await unitOfWork.currentRuntime()).snapshot().engine.evidenceLedger.events).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(unitOfWork.auditEvents().at(-1)).toMatchObject({
      outcome: "failed",
      errorCode: "IDEMPOTENCY_CONFLICT",
      revision: 1
    });
  });

  it("records replay audits at the current revision while preserving the original receipt revision", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const firstRequest = activityRequest(1, { idempotencyKey: "old-key", requestId: "old-first" });
    await application.mutate(authority(), firstRequest);
    await application.mutate(authority(), activityRequest(2));

    const replay = await application.mutate(authority(), { ...firstRequest, requestId: "old-replay" });

    expect(replay).toMatchObject({ replayed: true, revision: 1 });
    expect(unitOfWork.auditEvents().at(-1)).toMatchObject({ outcome: "replayed", revision: 2 });
  });

  it("records a contiguous before/after hash and revision audit chain", async () => {
    const { application, unitOfWork } = createInMemoryApplication();
    const first = await application.mutate(authority(), activityRequest(1));
    const second = await application.mutate(authority(), activityRequest(2));
    const [firstAudit, secondAudit] = unitOfWork.auditEvents();

    expect(firstAudit).toMatchObject({
      requestId: "request-1",
      tenantId: "tenant-a",
      subjectId: "user-a",
      action: "record_activity",
      outcome: "committed",
      revision: 1,
      afterHash: first.snapshotHash
    });
    expect(secondAudit).toMatchObject({
      requestId: "request-2",
      outcome: "committed",
      revision: 2,
      beforeHash: first.snapshotHash,
      afterHash: second.snapshotHash
    });
    expect(firstAudit?.beforeHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(firstAudit?.afterHash).not.toBe(firstAudit?.beforeHash);
    expect(secondAudit?.afterHash).not.toBe(secondAudit?.beforeHash);
  });
});

describe("Meraki application read isolation", () => {
  it("uses the Core retrieval boundary for malformed task-context validation", async () => {
    const runtime = new ConnectedAgentRuntime();
    const malformed = { ...taskContext(), contract: "not_task_context" } as unknown as TaskContext;
    const { application } = createInMemoryApplication(runtime);

    expect(() => runtime.retrieve(malformed)).toThrow("TASK_CONTEXT_INVALID");
    await expect(application.query(authority(), { name: "retrieve", input: malformed })).rejects.toThrow(
      "TASK_CONTEXT_INVALID"
    );
  });

  it("caps caller-supplied read:sensitive for an ordinary profile:read authority", async () => {
    const runtime = new ConnectedAgentRuntime();
    const normal = seedApprovedAtom(runtime, {
      suffix: "normal",
      claim: "For email, use concise subject lines."
    });
    const sensitive = seedApprovedAtom(runtime, {
      suffix: "sensitive",
      claim: "For email, use the private executive subject convention."
    });
    const { application } = createInMemoryApplication(withSensitiveAtom(runtime, sensitive.id));
    const readOnlyAuthority = authority({ scopes: ["profile:read"] });

    const callerElevated = await application.query(readOnlyAuthority, {
      name: "retrieve",
      input: taskContext({ permissions: ["read:sensitive"] })
    });
    const ordinary = await application.query(readOnlyAuthority, {
      name: "retrieve",
      input: taskContext()
    });
    const atoms = await application.query(readOnlyAuthority, { name: "list_atoms" });

    expect(callerElevated).toEqual(ordinary);
    expect(callerElevated.pack.atom_manifest).toEqual([{ id: normal.id, version: normal.version }]);
    expect(callerElevated.candidates.map((candidate) => candidate.atom.id)).toEqual([normal.id]);
    expect(atoms.map((atom) => atom.id)).toEqual([normal.id]);
  });

  it("does not return foreign atoms or their retrieval-candidate metadata", async () => {
    const runtime = new ConnectedAgentRuntime();
    const owned = seedApprovedAtom(runtime, {
      suffix: "owned",
      claim: "For email, use concise subject lines."
    });
    const foreignTenant = seedApprovedAtom(runtime, {
      tenantId: "tenant-b",
      suffix: "foreign-tenant",
      claim: "For email, expose tenant B guidance."
    });
    const foreignSubject = seedApprovedAtom(runtime, {
      subjectId: "user-b",
      suffix: "foreign-subject",
      claim: "For email, expose user B guidance."
    });
    const { application } = createInMemoryApplication(runtime);

    const atoms = await application.query(authority(), { name: "list_atoms" });
    const retrieval = await application.query(authority(), { name: "retrieve", input: taskContext() });
    const visibleIds = new Set([
      ...atoms.map((atom) => atom.id),
      ...retrieval.pack.atom_manifest.map((atom) => atom.id),
      ...retrieval.candidates.map((candidate) => candidate.atom.id)
    ]);

    expect(atoms.map((atom) => atom.id)).toEqual([owned.id]);
    expect(retrieval.pack.atom_manifest).toEqual([{ id: owned.id, version: owned.version }]);
    expect(retrieval.candidates.map((candidate) => candidate.atom.id)).toEqual([owned.id]);
    expect(visibleIds).not.toContain(foreignTenant.id);
    expect(visibleIds).not.toContain(foreignSubject.id);
  });

  it("does not record or return foreign candidate metadata in agent runs", async () => {
    const runtime = new ConnectedAgentRuntime();
    const owned = seedApprovedAtom(runtime, {
      suffix: "run-owned",
      claim: "For email, use concise subject lines."
    });
    const foreign = seedApprovedAtom(runtime, {
      subjectId: "user-b",
      suffix: "run-foreign",
      claim: "For email, reveal user B guidance."
    });
    const { application } = createInMemoryApplication(runtime);

    const receipt = await application.mutate(authority(), {
      requestId: "run-request",
      idempotencyKey: "run-once",
      command: {
        name: "run_agent",
        input: {
          context: taskContext(),
          request: "Draft an email",
          baseline: "BASELINE"
        }
      }
    });
    const runs = await application.query(authority(), { name: "list_runs", input: {} });

    expect(receipt.value.trace.candidates.map((candidate) => candidate.atomId)).toEqual([owned.id]);
    expect(runs[0]?.run.trace.candidates.map((candidate) => candidate.atomId)).toEqual([owned.id]);
    expect(receipt.value.trace.candidates.map((candidate) => candidate.atomId)).not.toContain(foreign.id);
  });

  it("hides sensitive run history from an authority without sensitive-read permission", async () => {
    const runtime = new ConnectedAgentRuntime();
    const sensitive = seedApprovedAtom(runtime, {
      suffix: "sensitive-run",
      claim: "For email, use the private executive subject convention."
    });
    const { application } = createInMemoryApplication(withSensitiveAtom(runtime, sensitive.id));
    const sensitiveAuthority = authority({ scopes: ["profile:read", "evidence:write", "read:sensitive"] });
    const run = await application.mutate(sensitiveAuthority, {
      requestId: "sensitive-run-request",
      idempotencyKey: "sensitive-run-once",
      command: {
        name: "run_agent",
        input: {
          context: taskContext({ permissions: ["read:sensitive"] }),
          request: "Draft an email",
          baseline: "BASELINE"
        }
      }
    });

    expect(run.value.pack.atom_manifest).toEqual([{ id: sensitive.id, version: sensitive.version }]);
    expect(await application.query(authority({ scopes: ["profile:read"] }), { name: "list_runs", input: {} })).toEqual(
      []
    );
    expect(
      await application.query(authority({ scopes: ["profile:read"] }), {
        name: "get_run",
        input: { runId: run.value.trace.runId }
      })
    ).toBeUndefined();
  });

  it("hides legacy run records whose trace contains foreign candidate metadata", async () => {
    const runtime = new ConnectedAgentRuntime();
    seedApprovedAtom(runtime, {
      suffix: "legacy-owned",
      claim: "For email, use concise subject lines."
    });
    const foreign = seedApprovedAtom(runtime, {
      subjectId: "user-b",
      suffix: "legacy-foreign",
      claim: "For email, expose user B guidance."
    });
    const run = runtime.run({
      context: taskContext(),
      request: "Draft an email",
      baseline: "BASELINE"
    });
    const snapshot = structuredClone(runtime.snapshot());
    const legacyRun = snapshot.runs.find((record) => record.run.trace.runId === run.trace.runId);
    if (legacyRun === undefined) throw new Error("TEST_RUN_NOT_FOUND");
    legacyRun.run.trace.candidates.push({
      atomId: foreign.id,
      version: foreign.version,
      decision: "excluded",
      reasons: ["tenant_or_subject_mismatch"],
      scores: { lexical: 0, semantic: 0, utility: 0, confidence: 0 }
    });
    const { application } = createInMemoryApplication(ConnectedAgentRuntime.fromSnapshot(snapshot));

    expect(await application.query(authority(), { name: "list_runs", input: {} })).toEqual([]);
    expect(
      await application.query(authority(), {
        name: "get_run",
        input: { runId: run.trace.runId }
      })
    ).toBeUndefined();
  });

  it("hides sensitive update proposals and requires explicit sensitive-write authority", async () => {
    const runtime = new ConnectedAgentRuntime();
    const atom = seedApprovedAtom(runtime, {
      suffix: "sensitive-proposal",
      claim: "For email, use the private executive subject convention."
    });
    const sensitiveRuntime = withSensitiveAtom(runtime, atom.id);
    const evidenceEventId = sensitiveRuntime.learningTraceForAtom(atom.id).event.id;
    const proposal = sensitiveRuntime.proposeUpdate(atom.id, evidenceEventId, "reinforce");
    const { application } = createInMemoryApplication(sensitiveRuntime);

    expect(await application.query(authority({ scopes: ["profile:read"] }), { name: "list_update_proposals" })).toEqual(
      []
    );
    expect(
      await application.query(authority({ scopes: ["profile:read", "profile:write:sensitive"] }), {
        name: "list_update_proposals"
      })
    ).toEqual([proposal]);
    await expect(
      application.query(authority({ scopes: ["profile:read"] }), {
        name: "learning_trace",
        input: { eventId: evidenceEventId }
      })
    ).rejects.toThrow("LEARNING_TRACE_NOT_FOUND");
    expect(
      await application.query(authority({ scopes: ["profile:read", "profile:write:sensitive"] }), {
        name: "learning_trace",
        input: { eventId: evidenceEventId }
      })
    ).toMatchObject({ atom: { id: atom.id } });
    await expect(
      application.mutate(authority({ scopes: ["profile:write"] }), {
        requestId: "sensitive-proposal-approve",
        idempotencyKey: "sensitive-proposal-approve",
        command: {
          name: "command_update_proposal",
          input: { proposalId: proposal.id, operation: "approve" }
        }
      })
    ).rejects.toMatchObject({ code: "insufficient_scope" });
  });
});
