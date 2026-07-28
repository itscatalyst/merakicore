import {
  ApplicationError,
  IdempotencyConflictError,
  type MutationReceipt,
  type RuntimeIdentity,
  type RuntimeTransactionMetadata,
  type RuntimeUnitOfWork
} from "@meraki/application";
import { AuthenticationError } from "@meraki/auth";
import { ConnectedAgentRuntime, canonicalJson, sha256Digest, type ConnectedRuntimeSnapshot } from "@meraki/core";
import type { SqlExecutor, SqlRow, TransactionalSqlClient } from "./client.js";
import { validatedTokenScopes } from "./auth.js";

type SnapshotRow = SqlRow &
  Readonly<{
    revision: unknown;
    snapshot: unknown;
    snapshot_hash: unknown;
  }>;

type IdempotencyRow = SqlRow &
  Readonly<{
    request_hash: unknown;
    response_body: unknown;
  }>;

type TransactionTokenRow = SqlRow &
  Readonly<{
    tenant_id: unknown;
    subject_id: unknown;
    actor_id: unknown;
    scopes: unknown;
    expired: unknown;
    revoked: unknown;
  }>;

const READ_SNAPSHOT_SQL = `
/* meraki:read-snapshot */
select revision, snapshot, snapshot_hash
from meraki_private.runtime_snapshots
where tenant_id = $1 and subject_id = $2
`;

const INSERT_EMPTY_SNAPSHOT_SQL = `
/* meraki:insert-empty-snapshot */
insert into meraki_private.runtime_snapshots (
  tenant_id, subject_id, revision, snapshot, snapshot_hash
) values ($1, $2, 0, $3::jsonb, $4)
on conflict (tenant_id, subject_id) do nothing
`;

const LOCK_SNAPSHOT_SQL = `
/* meraki:lock-snapshot */
select revision, snapshot, snapshot_hash
from meraki_private.runtime_snapshots
where tenant_id = $1 and subject_id = $2
for update
`;

const READ_IDEMPOTENCY_SQL = `
/* meraki:read-idempotency */
select request_hash, response_body
from meraki_private.idempotency_records
where tenant_id = $1 and subject_id = $2 and idempotency_key = $3
`;

const REVALIDATE_TOKEN_SQL = `
/* meraki:revalidate-token */
select tenant_id,
       subject_id,
       actor_id,
       scopes,
       (expires_at is not null and expires_at <= now()) as expired,
       (revoked_at is not null) as revoked
from meraki_private.access_tokens
where id = $1
`;

const UPDATE_SNAPSHOT_SQL = `
/* meraki:update-snapshot */
update meraki_private.runtime_snapshots
set snapshot = $3::jsonb,
    snapshot_hash = $4,
    revision = revision + 1,
    updated_at = now()
where tenant_id = $1 and subject_id = $2 and revision = $5
returning revision
`;

const INSERT_AUDIT_SQL = `
/* meraki:insert-audit */
insert into meraki_private.audit_events (
  request_id, token_id, tenant_id, subject_id, actor_id,
  action, target, outcome, metadata
) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
`;

const INSERT_IDEMPOTENCY_SQL = `
/* meraki:insert-idempotency */
insert into meraki_private.idempotency_records (
  tenant_id, subject_id, idempotency_key, request_hash,
  response_status, response_body
) values ($1, $2, $3, $4, 200, $5::jsonb)
`;

const cloneRuntime = (runtime: ConnectedAgentRuntime): ConnectedAgentRuntime =>
  ConnectedAgentRuntime.fromSnapshot(structuredClone(runtime.snapshot()));

const snapshotPayload = (
  runtime: ConnectedAgentRuntime
): Readonly<{
  runtime: ConnectedAgentRuntime;
  snapshot: ConnectedRuntimeSnapshot;
  canonical: string;
  hash: `sha256:${string}`;
}> => {
  const validated = cloneRuntime(runtime);
  const snapshot = structuredClone(validated.snapshot());
  const canonical = canonicalJson(snapshot);
  return { runtime: validated, snapshot, canonical, hash: sha256Digest(canonical) };
};

const jsonValue = (value: unknown, code: string): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ApplicationError(code);
  }
};

const safeRevision = (value: unknown): number => {
  const revision =
    typeof value === "bigint"
      ? value
      : typeof value === "number" && Number.isInteger(value)
        ? BigInt(value)
        : typeof value === "string" && /^\d+$/u.test(value)
          ? BigInt(value)
          : undefined;
  if (revision === undefined || revision < 0n || revision > BigInt(Number.MAX_SAFE_INTEGER))
    throw new ApplicationError("POSTGRES_REVISION_INVALID");
  return Number(revision);
};

const assertSnapshotIdentity = (value: unknown, identity: RuntimeIdentity, seen = new Set<object>()): void => {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new ApplicationError("POSTGRES_SNAPSHOT_INVALID");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSnapshotIdentity(item, identity, seen);
  } else {
    const record = value as Record<string, unknown>;
    if ("tenant_id" in record && record.tenant_id !== identity.tenantId)
      throw new ApplicationError("POSTGRES_SNAPSHOT_IDENTITY_MISMATCH");
    if ("subject_id" in record && record.subject_id !== identity.subjectId)
      throw new ApplicationError("POSTGRES_SNAPSHOT_IDENTITY_MISMATCH");
    for (const item of Object.values(record)) assertSnapshotIdentity(item, identity, seen);
  }
  seen.delete(value);
};

const restoreSnapshot = (
  row: SnapshotRow,
  identity: RuntimeIdentity
): Readonly<{
  runtime: ConnectedAgentRuntime;
  revision: number;
  hash: `sha256:${string}`;
}> => {
  const snapshot = jsonValue(row.snapshot, "POSTGRES_SNAPSHOT_INVALID") as ConnectedRuntimeSnapshot;
  assertSnapshotIdentity(snapshot, identity);
  let runtime: ConnectedAgentRuntime;
  try {
    runtime = ConnectedAgentRuntime.fromSnapshot(structuredClone(snapshot));
  } catch {
    throw new ApplicationError("POSTGRES_SNAPSHOT_INVALID");
  }
  const actualHash = sha256Digest(canonicalJson(runtime.snapshot()));
  if (row.snapshot_hash !== actualHash) throw new ApplicationError("POSTGRES_SNAPSHOT_HASH_MISMATCH");
  return { runtime, revision: safeRevision(row.revision), hash: actualHash };
};

const receiptFrom = <T>(value: unknown): MutationReceipt<T> => {
  const parsed = jsonValue(value, "POSTGRES_IDEMPOTENCY_RECORD_INVALID");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new ApplicationError("POSTGRES_IDEMPOTENCY_RECORD_INVALID");
  const candidate = parsed as Partial<MutationReceipt<T>>;
  if (
    typeof candidate.replayed !== "boolean" ||
    typeof candidate.revision !== "number" ||
    !Number.isSafeInteger(candidate.revision) ||
    candidate.revision < 0 ||
    typeof candidate.snapshotHash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/u.test(candidate.snapshotHash) ||
    !("value" in candidate)
  )
    throw new ApplicationError("POSTGRES_IDEMPOTENCY_RECORD_INVALID");
  return structuredClone(candidate as MutationReceipt<T>);
};

const readIdempotency = async (
  sql: SqlExecutor,
  identity: RuntimeIdentity,
  metadata: RuntimeTransactionMetadata
): Promise<IdempotencyRow | undefined> => {
  const rows = await sql.query<IdempotencyRow>(READ_IDEMPOTENCY_SQL, [
    identity.tenantId,
    identity.subjectId,
    metadata.idempotencyKey
  ]);
  if (rows.length > 1) throw new ApplicationError("POSTGRES_IDEMPOTENCY_RECORD_INVALID");
  const row = rows[0];
  if (row !== undefined && (typeof row.request_hash !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(row.request_hash)))
    throw new ApplicationError("POSTGRES_IDEMPOTENCY_RECORD_INVALID");
  return row;
};

const revalidateToken = async (
  sql: SqlExecutor,
  identity: RuntimeIdentity,
  metadata: RuntimeTransactionMetadata
): Promise<void> => {
  if (metadata.tokenId === undefined || !metadata.tokenId.trim())
    throw new AuthenticationError("missing_transaction_credential");
  const rows = await sql.query<TransactionTokenRow>(REVALIDATE_TOKEN_SQL, [metadata.tokenId]);
  if (rows.length !== 1) throw new AuthenticationError("invalid_token");
  const row = rows[0] as TransactionTokenRow;
  if (typeof row.revoked !== "boolean" || typeof row.expired !== "boolean")
    throw new AuthenticationError("invalid_token_record");
  if (row.revoked === true) throw new AuthenticationError("revoked_token");
  if (row.expired === true) throw new AuthenticationError("expired_token");
  const storedScopes = [...validatedTokenScopes(row.scopes)].sort();
  const requestScopes = [...validatedTokenScopes(metadata.scopes)].sort();
  if (
    row.tenant_id !== identity.tenantId ||
    row.subject_id !== identity.subjectId ||
    row.actor_id !== metadata.actorId ||
    canonicalJson(storedScopes) !== canonicalJson(requestScopes)
  )
    throw new AuthenticationError("token_authority_changed");
};

const emptySnapshot = snapshotPayload(new ConnectedAgentRuntime());

const lockRuntime = async (
  sql: SqlExecutor,
  identity: RuntimeIdentity
): Promise<Readonly<{ runtime: ConnectedAgentRuntime; revision: number; hash: `sha256:${string}` }>> => {
  await sql.query(INSERT_EMPTY_SNAPSHOT_SQL, [
    identity.tenantId,
    identity.subjectId,
    emptySnapshot.snapshot,
    emptySnapshot.hash
  ]);
  const rows = await sql.query<SnapshotRow>(LOCK_SNAPSHOT_SQL, [identity.tenantId, identity.subjectId]);
  if (rows.length !== 1) throw new ApplicationError("POSTGRES_SNAPSHOT_NOT_FOUND");
  return restoreSnapshot(rows[0] as SnapshotRow, identity);
};

const auditMetadata = (
  metadata: RuntimeTransactionMetadata,
  beforeHash: `sha256:${string}`,
  afterHash: `sha256:${string}`,
  revision: number
): Readonly<Record<string, unknown>> => ({
  session_id: metadata.sessionId,
  scopes: [...metadata.scopes],
  idempotency_key: metadata.idempotencyKey,
  request_hash: metadata.requestHash,
  before_hash: beforeHash,
  after_hash: afterHash,
  revision,
  ...(metadata.expectedRevision === undefined ? {} : { expected_revision: metadata.expectedRevision }),
  ...(metadata.reason === undefined ? {} : { reason: metadata.reason })
});

const insertAudit = async (
  sql: SqlExecutor,
  identity: RuntimeIdentity,
  metadata: RuntimeTransactionMetadata,
  outcome: "committed" | "replayed",
  beforeHash: `sha256:${string}`,
  afterHash: `sha256:${string}`,
  revision: number
): Promise<void> => {
  await sql.query(INSERT_AUDIT_SQL, [
    metadata.requestId,
    metadata.tokenId ?? null,
    identity.tenantId,
    identity.subjectId,
    metadata.actorId,
    metadata.action,
    metadata.target ?? null,
    outcome,
    auditMetadata(metadata, beforeHash, afterHash, revision)
  ]);
};

export class PostgresRevisionConflictError extends ApplicationError {
  public constructor() {
    super("REVISION_CONFLICT", true);
    this.name = "PostgresRevisionConflictError";
  }
}

/**
 * Transactional snapshot store for the shared application command boundary.
 *
 * Exactly one tenant/subject runtime row is locked for every command. The
 * command, snapshot publication, audit event, and idempotency receipt share one
 * database transaction and therefore commit or roll back together.
 */
export class PostgresRuntimeUnitOfWork implements RuntimeUnitOfWork {
  public constructor(private readonly sql: TransactionalSqlClient) {}

  public async read<T>(identity: RuntimeIdentity, operation: (runtime: ConnectedAgentRuntime) => T): Promise<T> {
    const rows = await this.sql.query<SnapshotRow>(READ_SNAPSHOT_SQL, [identity.tenantId, identity.subjectId]);
    if (rows.length > 1) throw new ApplicationError("POSTGRES_SNAPSHOT_DUPLICATE");
    const runtime = rows[0] === undefined ? new ConnectedAgentRuntime() : restoreSnapshot(rows[0], identity).runtime;
    return operation(cloneRuntime(runtime));
  }

  public transact<T>(
    identity: RuntimeIdentity,
    metadata: RuntimeTransactionMetadata,
    authorize: (runtime: ConnectedAgentRuntime) => void,
    operation: (runtime: ConnectedAgentRuntime) => T
  ): Promise<MutationReceipt<T>> {
    return this.sql.transaction(async (transaction) => {
      await revalidateToken(transaction, identity, metadata);
      let prior = await readIdempotency(transaction, identity, metadata);
      const before = await lockRuntime(transaction, identity);
      // A concurrent same-key request may have committed while this transaction
      // waited for the subject row. Re-check under the row lock so it replays
      // instead of executing the command a second time.
      if (prior === undefined) prior = await readIdempotency(transaction, identity, metadata);

      // Runtime-dependent authorization must still run on a replay. A prior
      // receipt cannot bypass a later revocation or resource visibility change.
      authorize(cloneRuntime(before.runtime));

      if (prior !== undefined) {
        if (prior.request_hash !== metadata.requestHash) throw new IdempotencyConflictError();
        const receipt = receiptFrom<T>(prior.response_body);
        await insertAudit(transaction, identity, metadata, "replayed", before.hash, before.hash, before.revision);
        return Object.freeze({ ...receipt, replayed: true });
      }
      if (metadata.expectedRevision !== undefined && metadata.expectedRevision !== before.revision)
        throw new PostgresRevisionConflictError();

      const candidate = cloneRuntime(before.runtime);
      const value = operation(candidate);
      const after = snapshotPayload(candidate);
      assertSnapshotIdentity(after.snapshot, identity);
      const updated = await transaction.query<{ revision: unknown } & SqlRow>(UPDATE_SNAPSHOT_SQL, [
        identity.tenantId,
        identity.subjectId,
        after.snapshot,
        after.hash,
        before.revision
      ]);
      if (updated.length !== 1) throw new PostgresRevisionConflictError();
      const revision = safeRevision(updated[0]?.revision);
      if (revision !== before.revision + 1) throw new PostgresRevisionConflictError();

      const receipt: MutationReceipt<T> = Object.freeze({
        value,
        replayed: false,
        revision,
        snapshotHash: after.hash
      });
      await insertAudit(transaction, identity, metadata, "committed", before.hash, after.hash, revision);
      await transaction.query(INSERT_IDEMPOTENCY_SQL, [
        identity.tenantId,
        identity.subjectId,
        metadata.idempotencyKey,
        metadata.requestHash,
        receipt
      ]);
      return structuredClone(receipt);
    });
  }
}
