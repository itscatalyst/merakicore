import type { AuthenticatedContext } from "@meraki/auth";
import { ConnectedAgentRuntime, canonicalJson, sha256Digest } from "@meraki/core";
import { MerakiApplicationService, type MerakiCommand, type RuntimeTransactionMetadata } from "@meraki/application";
import { describe, expect, it } from "vitest";
import { accessTokenDigest, PostgresAccessTokenAuthenticator } from "./auth.js";
import type { SqlExecutor, SqlRow, TransactionalSqlClient } from "./client.js";
import { PostgresRevisionConflictError, PostgresRuntimeUnitOfWork } from "./unit-of-work.js";

type MemorySnapshot = {
  revision: number;
  snapshot: unknown;
  snapshot_hash: string;
};

type MemoryIdempotency = {
  request_hash: string;
  response_body: unknown;
};

type MemoryToken = {
  id: string;
  token_digest: string;
  tenant_id: string;
  subject_id: string;
  actor_id: string;
  scopes: string[];
  expires_at: Date | null;
  revoked_at: Date | null;
};

type MemoryState = {
  snapshots: Map<string, MemorySnapshot>;
  idempotency: Map<string, MemoryIdempotency>;
  tokens: Map<string, MemoryToken>;
  audits: Array<Record<string, unknown>>;
};

const parameter = (parameters: readonly unknown[] | undefined, index: number): unknown => parameters?.[index];

const requiredString = (value: unknown): string => {
  if (typeof value !== "string") throw new Error("FAKE_PARAMETER_INVALID");
  return value;
};

const parsedJson = (value: unknown): unknown => {
  if (typeof value !== "string") return structuredClone(value);
  return JSON.parse(value) as unknown;
};

const subjectKey = (tenantId: unknown, subjectId: unknown): string =>
  `${requiredString(tenantId)}\u0000${requiredString(subjectId)}`;

const idempotencyKey = (tenantId: unknown, subjectId: unknown, key: unknown): string =>
  `${subjectKey(tenantId, subjectId)}\u0000${requiredString(key)}`;

class MemorySqlClient implements TransactionalSqlClient {
  private state: MemoryState = {
    snapshots: new Map(),
    idempotency: new Map(),
    tokens: new Map(),
    audits: []
  };
  private pending: Promise<void> = Promise.resolve();
  public failNextAudit = false;
  public forceNextStaleUpdate = false;

  public query<Row extends SqlRow = SqlRow>(
    statement: string,
    parameters: readonly unknown[] = []
  ): Promise<readonly Row[]> {
    return Promise.resolve(this.execute<Row>(this.state, statement, parameters));
  }

  public transaction<T>(operation: (transaction: SqlExecutor) => Promise<T>): Promise<T> {
    const result = this.pending.then(async () => {
      const working = structuredClone(this.state);
      const transaction: SqlExecutor = {
        query: <Row extends SqlRow = SqlRow>(
          statement: string,
          parameters: readonly unknown[] = []
        ): Promise<readonly Row[]> => Promise.resolve(this.execute<Row>(working, statement, parameters))
      };
      const value = await operation(transaction);
      this.state = working;
      return value;
    });
    this.pending = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  public close(): Promise<void> {
    return Promise.resolve();
  }

  public seedToken(token: MemoryToken): void {
    this.state.tokens.set(token.id, structuredClone(token));
  }

  public updateToken(id: string, changes: Partial<MemoryToken>): void {
    const token = this.state.tokens.get(id);
    if (token === undefined) throw new Error("TOKEN_NOT_FOUND");
    Object.assign(token, structuredClone(changes));
  }

  public seedSnapshot(tenantId: string, subjectId: string, runtime: ConnectedAgentRuntime): void {
    const snapshot = structuredClone(runtime.snapshot());
    this.state.snapshots.set(subjectKey(tenantId, subjectId), {
      revision: 0,
      snapshot,
      snapshot_hash: sha256Digest(canonicalJson(snapshot))
    });
  }

  public snapshot(tenantId: string, subjectId: string): MemorySnapshot | undefined {
    const row = this.state.snapshots.get(subjectKey(tenantId, subjectId));
    return row === undefined ? undefined : structuredClone(row);
  }

  public auditCount(): number {
    return this.state.audits.length;
  }

  public idempotencyCount(): number {
    return this.state.idempotency.size;
  }

  public corruptIdempotency(tenantId: string, subjectId: string, key: string): void {
    const row = this.state.idempotency.get(idempotencyKey(tenantId, subjectId, key));
    if (row === undefined) throw new Error("IDEMPOTENCY_NOT_FOUND");
    row.request_hash = "not-a-digest";
  }

  private execute<Row extends SqlRow>(
    state: MemoryState,
    statement: string,
    parameters: readonly unknown[]
  ): readonly Row[] {
    if (statement.includes("meraki:access-token")) {
      const digest = requiredString(parameter(parameters, 0));
      const token = [...state.tokens.values()].find((candidate) => candidate.token_digest === digest);
      return (token === undefined ? [] : [structuredClone(token)]) as unknown as readonly Row[];
    }
    if (statement.includes("meraki:revalidate-token")) {
      const token = state.tokens.get(requiredString(parameter(parameters, 0)));
      if (token === undefined) return [];
      return [
        {
          tenant_id: token.tenant_id,
          subject_id: token.subject_id,
          actor_id: token.actor_id,
          scopes: structuredClone(token.scopes),
          expired: token.expires_at !== null && token.expires_at.getTime() <= Date.now(),
          revoked: token.revoked_at !== null
        }
      ] as unknown as readonly Row[];
    }
    if (statement.includes("meraki:read-snapshot") || statement.includes("meraki:lock-snapshot")) {
      const row = state.snapshots.get(subjectKey(parameter(parameters, 0), parameter(parameters, 1)));
      return (row === undefined ? [] : [structuredClone(row)]) as unknown as readonly Row[];
    }
    if (statement.includes("meraki:insert-empty-snapshot")) {
      const key = subjectKey(parameter(parameters, 0), parameter(parameters, 1));
      if (!state.snapshots.has(key)) {
        state.snapshots.set(key, {
          revision: 0,
          snapshot: parsedJson(parameter(parameters, 2)),
          snapshot_hash: requiredString(parameter(parameters, 3))
        });
      }
      return [];
    }
    if (statement.includes("meraki:read-idempotency")) {
      const row = state.idempotency.get(
        idempotencyKey(parameter(parameters, 0), parameter(parameters, 1), parameter(parameters, 2))
      );
      return (row === undefined ? [] : [structuredClone(row)]) as unknown as readonly Row[];
    }
    if (statement.includes("meraki:update-snapshot")) {
      if (this.forceNextStaleUpdate) {
        this.forceNextStaleUpdate = false;
        return [];
      }
      const key = subjectKey(parameter(parameters, 0), parameter(parameters, 1));
      const row = state.snapshots.get(key);
      if (row === undefined || row.revision !== parameter(parameters, 4)) return [];
      row.snapshot = parsedJson(parameter(parameters, 2));
      row.snapshot_hash = requiredString(parameter(parameters, 3));
      row.revision += 1;
      return [{ revision: row.revision }] as unknown as readonly Row[];
    }
    if (statement.includes("meraki:insert-audit")) {
      if (this.failNextAudit) {
        this.failNextAudit = false;
        throw new Error("AUDIT_WRITE_FAILED");
      }
      state.audits.push({
        request_id: parameter(parameters, 0),
        token_id: parameter(parameters, 1),
        tenant_id: parameter(parameters, 2),
        subject_id: parameter(parameters, 3),
        actor_id: parameter(parameters, 4),
        action: parameter(parameters, 5),
        target: parameter(parameters, 6),
        outcome: parameter(parameters, 7),
        metadata: parsedJson(parameter(parameters, 8))
      });
      return [];
    }
    if (statement.includes("meraki:insert-idempotency")) {
      const key = idempotencyKey(parameter(parameters, 0), parameter(parameters, 1), parameter(parameters, 2));
      if (state.idempotency.has(key)) throw new Error("FAKE_IDEMPOTENCY_UNIQUE_VIOLATION");
      state.idempotency.set(key, {
        request_hash: requiredString(parameter(parameters, 3)),
        response_body: parsedJson(parameter(parameters, 4))
      });
      return [];
    }
    throw new Error(`UNSUPPORTED_FAKE_SQL: ${statement}`);
  }
}

const pepper = new TextEncoder().encode("0123456789abcdef0123456789abcdef");
const rawToken = "meraki_test_token";
const tokenId = "11111111-1111-4111-8111-111111111111";

const token = (input: Partial<MemoryToken> = {}): MemoryToken => ({
  id: input.id ?? tokenId,
  token_digest: input.token_digest ?? accessTokenDigest(rawToken, pepper),
  tenant_id: input.tenant_id ?? "tenant-a",
  subject_id: input.subject_id ?? "subject-a",
  actor_id: input.actor_id ?? "actor-a",
  scopes: input.scopes ?? ["evidence:write", "profile:read", "profile:write"],
  expires_at: input.expires_at ?? null,
  revoked_at: input.revoked_at ?? null
});

const identity = { tenantId: "tenant-a", subjectId: "subject-a" } as const;

const metadata = (
  index: number,
  input: Readonly<{
    idempotencyKey?: string;
    requestHash?: `sha256:${string}`;
    expectedRevision?: number;
    tokenId?: string;
    actorId?: string;
    scopes?: readonly string[];
  }> = {}
): RuntimeTransactionMetadata => ({
  requestId: `request-${index}`,
  idempotencyKey: input.idempotencyKey ?? `key-${index}`,
  requestHash: input.requestHash ?? sha256Digest(`request-${index}`),
  action: "record_activity",
  actorId: input.actorId ?? "actor-a",
  sessionId: "session-a",
  scopes: input.scopes ?? ["evidence:write", "profile:read", "profile:write"],
  tokenId: input.tokenId ?? tokenId,
  ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision })
});

type RecordActivityCommand = Extract<MerakiCommand, Readonly<{ name: "record_activity" }>>;

const activityRequest = (
  index: number,
  input: Readonly<{ idempotencyKey?: string; content?: string; expectedRevision?: number }> = {}
) => ({
  requestId: `request-${index}`,
  idempotencyKey: input.idempotencyKey ?? `activity-${index}`,
  ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
  command: {
    name: "record_activity",
    input: {
      tenantId: "tenant-a",
      subjectId: "subject-a",
      actorId: "actor-a",
      runId: `run-${index}`,
      taskType: "writing",
      activityType: "edit" as const,
      content: input.content ?? `Prefer direct sentence ${index}`,
      scope: { level: "project" as const, ref: "merakicore" },
      mode: "direct",
      payload: { before: "Long", after: "Short" }
    }
  } satisfies RecordActivityCommand
});

const authority = (): AuthenticatedContext => ({
  tenantId: "tenant-a",
  subjectId: "subject-a",
  actorId: "actor-a",
  sessionId: `token:${tokenId}`,
  scopes: new Set(["evidence:write", "profile:read", "profile:write"]),
  credentialId: tokenId
});

describe("Postgres access-token authority", () => {
  it("stores authority in a keyed digest lookup and returns the credential id", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const authenticator = new PostgresAccessTokenAuthenticator(sql, pepper);

    await expect(authenticator.authenticate(`Bearer ${rawToken}`)).resolves.toEqual(authority());
    expect(accessTokenDigest(rawToken, pepper)).toMatch(/^hmac-sha256:[a-f0-9]{64}$/u);
  });

  it("rejects missing, oversized, revoked, expired, and unknown tokens", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token({ revoked_at: new Date("2026-01-01T00:00:00.000Z") }));
    const authenticator = new PostgresAccessTokenAuthenticator(sql, pepper, () => new Date("2026-07-28T00:00:00.000Z"));

    await expect(authenticator.authenticate(undefined)).rejects.toMatchObject({ code: "missing_token" });
    await expect(authenticator.authenticate(`Bearer ${"x".repeat(513)}`)).rejects.toMatchObject({
      code: "malformed_token"
    });
    await expect(authenticator.authenticate(`Bearer ${rawToken}`)).rejects.toMatchObject({ code: "revoked_token" });

    sql.updateToken(tokenId, { revoked_at: null, expires_at: new Date("2026-07-27T23:59:59.000Z") });
    await expect(authenticator.authenticate(`Bearer ${rawToken}`)).rejects.toMatchObject({ code: "expired_token" });
    await expect(authenticator.authenticate("Bearer unknown")).rejects.toMatchObject({ code: "invalid_token" });

    sql.updateToken(tokenId, {
      expires_at: null,
      scopes: ["profile:read", "profile:read"]
    });
    await expect(authenticator.authenticate(`Bearer ${rawToken}`)).rejects.toMatchObject({
      code: "invalid_token_record"
    });
    sql.updateToken(tokenId, { scopes: [" profile:read"] });
    await expect(authenticator.authenticate(`Bearer ${rawToken}`)).rejects.toMatchObject({
      code: "invalid_token_record"
    });
  });
});

describe("Postgres runtime unit of work", () => {
  it("initializes an empty subject, validates the snapshot round trip, and hashes canonically", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const unitOfWork = new PostgresRuntimeUnitOfWork(sql);
    const expectedHash = sha256Digest(canonicalJson(new ConnectedAgentRuntime().snapshot()));

    const receipt = await unitOfWork.transact(
      identity,
      metadata(1, { expectedRevision: 0 }),
      () => undefined,
      () => ({ ok: true })
    );

    expect(receipt).toEqual({
      value: { ok: true },
      replayed: false,
      revision: 1,
      snapshotHash: expectedHash
    });
    await expect(unitOfWork.read(identity, (runtime) => runtime.snapshot())).resolves.toEqual(
      new ConnectedAgentRuntime().snapshot()
    );
    expect(sql.auditCount()).toBe(1);
    expect(sql.idempotencyCount()).toBe(1);
  });

  it("serializes 20 concurrent application mutations without losing an event", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const unitOfWork = new PostgresRuntimeUnitOfWork(sql);
    const application = new MerakiApplicationService(unitOfWork);

    const receipts = await Promise.all(
      Array.from({ length: 20 }, (_, index) => application.mutate(authority(), activityRequest(index)))
    );

    expect(receipts.map((receipt) => receipt.revision).sort((left, right) => left - right)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1)
    );
    await expect(
      unitOfWork.read(identity, (runtime) => runtime.snapshot().engine.evidenceLedger.events.length)
    ).resolves.toBe(20);
    expect(sql.snapshot("tenant-a", "subject-a")?.revision).toBe(20);
    expect(sql.auditCount()).toBe(20);
    expect(sql.idempotencyCount()).toBe(20);
  });

  it("replays a concurrent identical key exactly once and conflicts on different content", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const unitOfWork = new PostgresRuntimeUnitOfWork(sql);
    const application = new MerakiApplicationService(unitOfWork);
    const request = activityRequest(1, { idempotencyKey: "same-key" });

    const receipts = await Promise.all([
      application.mutate(authority(), request),
      application.mutate(authority(), request)
    ]);

    expect(receipts.map((receipt) => receipt.replayed).sort()).toEqual([false, true]);
    await expect(
      unitOfWork.read(identity, (runtime) => runtime.snapshot().engine.evidenceLedger.events.length)
    ).resolves.toBe(1);
    await expect(
      application.mutate(
        authority(),
        activityRequest(1, { idempotencyKey: "same-key", content: "Conflicting request" })
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(sql.snapshot("tenant-a", "subject-a")?.revision).toBe(1);
  });

  it("enforces expected revisions only for new mutations and detects stale database updates", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const unitOfWork = new PostgresRuntimeUnitOfWork(sql);
    const application = new MerakiApplicationService(unitOfWork);
    const original = activityRequest(1, { idempotencyKey: "original", expectedRevision: 0 });

    await application.mutate(authority(), original);
    await expect(application.mutate(authority(), original)).resolves.toMatchObject({
      replayed: true,
      revision: 1
    });
    await expect(application.mutate(authority(), activityRequest(2, { expectedRevision: 0 }))).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
      retryable: true
    });

    sql.forceNextStaleUpdate = true;
    await expect(application.mutate(authority(), activityRequest(3, { expectedRevision: 1 }))).rejects.toBeInstanceOf(
      PostgresRevisionConflictError
    );
    expect(sql.snapshot("tenant-a", "subject-a")?.revision).toBe(1);
  });

  it("rolls back snapshot, audit, and idempotency together when an atomic write fails", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    sql.failNextAudit = true;
    const application = new MerakiApplicationService(new PostgresRuntimeUnitOfWork(sql));

    await expect(application.mutate(authority(), activityRequest(1))).rejects.toThrow("AUDIT_WRITE_FAILED");
    expect(sql.snapshot("tenant-a", "subject-a")).toBeUndefined();
    expect(sql.auditCount()).toBe(0);
    expect(sql.idempotencyCount()).toBe(0);
  });

  it("refuses to persist a foreign identity produced by an injected operation", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const unitOfWork = new PostgresRuntimeUnitOfWork(sql);

    await expect(
      unitOfWork.transact(
        identity,
        metadata(1),
        () => undefined,
        (runtime) =>
          runtime.activity({
            tenantId: "tenant-b",
            subjectId: "subject-b",
            actorId: "actor-b",
            runId: "foreign-run",
            taskType: "writing",
            activityType: "edit",
            content: "Foreign content",
            scope: { level: "project", ref: "foreign" }
          })
      )
    ).rejects.toMatchObject({ code: "POSTGRES_SNAPSHOT_IDENTITY_MISMATCH" });
    expect(sql.snapshot("tenant-a", "subject-a")).toBeUndefined();
    expect(sql.auditCount()).toBe(0);
    expect(sql.idempotencyCount()).toBe(0);
  });

  it("revalidates token authority inside the mutation transaction", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const application = new MerakiApplicationService(new PostgresRuntimeUnitOfWork(sql));

    sql.updateToken(tokenId, { revoked_at: new Date() });
    await expect(application.mutate(authority(), activityRequest(1))).rejects.toMatchObject({
      code: "revoked_token"
    });
    sql.updateToken(tokenId, {
      revoked_at: null,
      expires_at: new Date(Date.now() - 1_000)
    });
    await expect(application.mutate(authority(), activityRequest(2))).rejects.toMatchObject({
      code: "expired_token"
    });
    sql.updateToken(tokenId, {
      expires_at: null,
      subject_id: "subject-b"
    });
    await expect(application.mutate(authority(), activityRequest(3))).rejects.toMatchObject({
      code: "token_authority_changed"
    });
    expect(sql.snapshot("tenant-a", "subject-a")).toBeUndefined();
  });

  it("rejects malformed stored idempotency hashes before replaying them", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const application = new MerakiApplicationService(new PostgresRuntimeUnitOfWork(sql));
    const request = activityRequest(1, { idempotencyKey: "corrupt-key" });
    await application.mutate(authority(), request);
    sql.corruptIdempotency("tenant-a", "subject-a", "corrupt-key");

    await expect(application.mutate(authority(), request)).rejects.toMatchObject({
      code: "POSTGRES_IDEMPOTENCY_RECORD_INVALID"
    });
    expect(sql.snapshot("tenant-a", "subject-a")?.revision).toBe(1);
  });

  it("isolates tenant and subject rows and rejects foreign identities nested in a snapshot", async () => {
    const sql = new MemorySqlClient();
    sql.seedToken(token());
    const application = new MerakiApplicationService(new PostgresRuntimeUnitOfWork(sql));
    await application.mutate(authority(), activityRequest(1));

    const otherIdentity = { tenantId: "tenant-a", subjectId: "subject-b" };
    const unitOfWork = new PostgresRuntimeUnitOfWork(sql);
    await expect(
      unitOfWork.read(otherIdentity, (runtime) => runtime.snapshot().engine.evidenceLedger.events.length)
    ).resolves.toBe(0);
    await expect(
      unitOfWork.transact(
        otherIdentity,
        metadata(2),
        () => undefined,
        () => ({ ok: true })
      )
    ).rejects.toMatchObject({ code: "token_authority_changed" });

    const foreignRuntime = new ConnectedAgentRuntime();
    foreignRuntime.activity({
      tenantId: "tenant-b",
      subjectId: "subject-b",
      actorId: "actor-b",
      runId: "foreign-run",
      taskType: "writing",
      activityType: "edit",
      content: "Foreign content",
      scope: { level: "project", ref: "foreign" }
    });
    sql.seedSnapshot("tenant-a", "subject-a", foreignRuntime);
    await expect(unitOfWork.read(identity, () => undefined)).rejects.toMatchObject({
      code: "POSTGRES_SNAPSHOT_IDENTITY_MISMATCH"
    });
  });
});
