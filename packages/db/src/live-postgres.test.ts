import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_LOGIN_ROLE, WORKER_LOGIN_ROLE, bootstrapRoles, runtimeConnectionString } from "./bootstrap-roles.js";
import { migrate } from "./migrate.js";
import { readRestartSentinel, writeRestartSentinel } from "./restart-proof.js";
import { PostgresDatabaseSession } from "./session-context.js";
import type { DatabaseSessionContext, QueryResult, TransactionClient, TransactionPool } from "./session-context.js";

const connectionString = process.env["DATABASE_URL"];
const appPassword = process.env["MERAKI_APP_DATABASE_PASSWORD"];
const workerPassword = process.env["MERAKI_WORKER_DATABASE_PASSWORD"];
const liveRequired = process.env["MERAKI_REQUIRE_LIVE_DB"] === "1";
const disposableConfirmed = process.env["MERAKI_DISPOSABLE_DATABASE"] === "1";
const liveDatabaseUrl = connectionString ?? "";
const liveAppPassword = appPassword ?? "";
const liveWorkerPassword = workerPassword ?? "";

if (liveRequired) {
  if (connectionString === undefined) throw new Error("MERAKI_REQUIRE_LIVE_DB=1 requires DATABASE_URL");
  if (!disposableConfirmed) {
    throw new Error("Live migration tests are destructive; set MERAKI_DISPOSABLE_DATABASE=1 for a disposable database");
  }
  if (appPassword === undefined || workerPassword === undefined) {
    throw new Error("Live tests require MERAKI_APP_DATABASE_PASSWORD and MERAKI_WORKER_DATABASE_PASSWORD");
  }
}

const describeLive =
  liveRequired && connectionString !== undefined && appPassword !== undefined && workerPassword !== undefined
    ? describe.sequential
    : describe.skip;

const TENANT_A = "018f0000-0000-7000-8000-000000000001";
const TENANT_B = "018f0000-0000-7000-8000-000000000002";
const FORBIDDEN_TENANT = "018f0000-0000-7000-8000-000000000003";
const SUBJECT_A = "018f0000-0000-7000-8000-000000000011";
const SUBJECT_B = "018f0000-0000-7000-8000-000000000012";
const SUBJECT_C = "018f0000-0000-7000-8000-000000000013";
const ACTOR = "018f0000-0000-7000-8000-000000000021";
const OTHER_ACTOR = "018f0000-0000-7000-8000-000000000022";
const SESSION = "018f0000-0000-7000-8000-000000000031";
const OTHER_SESSION = "018f0000-0000-7000-8000-000000000032";

const context = (tenantId: string, subjectId: string): DatabaseSessionContext => ({
  tenantId,
  subjectId,
  actorId: ACTOR,
  sessionId: SESSION,
  scopes: ["foundation:test"]
});

describeLive("live PostgreSQL foundation", () => {
  let admin: pg.Client | undefined;
  let appConnectionString = "";
  let workerConnectionString = "";

  beforeAll(async () => {
    await bootstrapRoles({
      connectionString: liveDatabaseUrl,
      appPassword: liveAppPassword,
      workerPassword: liveWorkerPassword
    });
    appConnectionString = runtimeConnectionString(liveDatabaseUrl, APP_LOGIN_ROLE, liveAppPassword);
    workerConnectionString = runtimeConnectionString(liveDatabaseUrl, WORKER_LOGIN_ROLE, liveWorkerPassword);
    admin = new pg.Client({ connectionString: liveDatabaseUrl });
    await admin.connect();
    await assertDisposableSchemaState(admin);
    while ((await migrate({ connectionString: liveDatabaseUrl, direction: "down" })).reverted.length > 0) {
      // Deliberately empty: the explicit disposable guard authorizes reverting every applied test migration.
    }
  });

  afterAll(async () => {
    if (admin !== undefined) await admin.end();
  });

  it("runs on PostgreSQL major version 16", async () => {
    const version = await requiredAdmin(admin).query<{ server_version_num: string }>("SHOW server_version_num");
    expect(Math.trunc(Number(version.rows[0]?.server_version_num) / 10_000)).toBe(16);
  });

  it("serializes migration up, verifies checksums, reverts latest, and reapplies", async () => {
    const concurrent = await Promise.all([
      migrate({ connectionString: liveDatabaseUrl, direction: "up" }),
      migrate({ connectionString: liveDatabaseUrl, direction: "up" })
    ]);
    expect(concurrent.flatMap((result) => result.applied)).toEqual(["0001_foundation"]);
    expect((await migrate({ connectionString: liveDatabaseUrl, direction: "up" })).applied).toEqual([]);
    await expectFoundationSchema(requiredAdmin(admin));

    const ledger = await requiredAdmin(admin).query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM meraki_schema_migrations"
    );
    expect(ledger.rows).toHaveLength(1);
    const stored = ledger.rows[0];
    if (stored === undefined) throw new Error("Migration ledger row is missing");
    await requiredAdmin(admin).query("UPDATE meraki_schema_migrations SET checksum = repeat('0', 64) WHERE name = $1", [
      stored.name
    ]);
    await expect(migrate({ connectionString: liveDatabaseUrl, direction: "up" })).rejects.toThrow(
      "Migration checksum mismatch"
    );
    await requiredAdmin(admin).query("UPDATE meraki_schema_migrations SET checksum = $1 WHERE name = $2", [
      stored.checksum,
      stored.name
    ]);

    expect((await migrate({ connectionString: liveDatabaseUrl, direction: "down" })).reverted).toEqual([
      "0001_foundation"
    ]);
    const removed = await requiredAdmin(admin).query<{ relation: string | null }>(
      "SELECT to_regclass('public.idempotency_receipts')::text AS relation"
    );
    expect(removed.rows[0]?.relation).toBeNull();
    expect((await migrate({ connectionString: liveDatabaseUrl, direction: "up" })).applied).toEqual([
      "0001_foundation"
    ]);
    await expectFoundationSchema(requiredAdmin(admin));

    await requiredAdmin(admin).query(
      `INSERT INTO tenants (id) VALUES ($1), ($2);
       INSERT INTO subjects (tenant_id, id) VALUES ($1, $3), ($1, $4), ($2, $5);`,
      [TENANT_A, TENANT_B, SUBJECT_A, SUBJECT_B, SUBJECT_C]
    );
  });

  it("uses restricted login roles and pgvector operators, tables, indexes, and retrieval", async () => {
    const app = await roleSession(appConnectionString, "meraki_app");
    const worker = await roleSession(workerConnectionString, "meraki_worker");
    try {
      const appIdentity = await app.raw.query<{
        current_user: string;
        rolsuper: boolean;
        rolbypassrls: boolean;
        app_member: boolean;
        worker_member: boolean;
      }>(
        `SELECT current_user,
                r.rolsuper,
                r.rolbypassrls,
                pg_has_role(current_user, 'meraki_app', 'MEMBER') AS app_member,
                pg_has_role(current_user, 'meraki_worker', 'MEMBER') AS worker_member
           FROM pg_roles r
          WHERE r.rolname = current_user`
      );
      expect(appIdentity.rows[0]).toMatchObject({
        current_user: APP_LOGIN_ROLE,
        rolsuper: false,
        rolbypassrls: false,
        app_member: true,
        worker_member: false
      });
      const workerIdentity = await worker.raw.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
        "SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
      );
      expect(workerIdentity.rows[0]).toMatchObject({
        current_user: WORKER_LOGIN_ROLE,
        rolsuper: false,
        rolbypassrls: false
      });

      const result = await app.session.transaction(context(TENANT_A, SUBJECT_A), async (client) => {
        const role = await client.query<{ current_user: string; session_user: string }>(
          "SELECT current_user, session_user"
        );
        await client.query("CREATE TEMP TABLE vector_probe (label text PRIMARY KEY, embedding vector(3) NOT NULL)");
        await client.query(
          `INSERT INTO vector_probe (label, embedding) VALUES
             ('near', '[1,0,0]'), ('middle', '[0.8,0.2,0]'), ('far', '[0,1,0]')`
        );
        await client.query("CREATE INDEX vector_probe_hnsw ON vector_probe USING hnsw (embedding vector_cosine_ops)");
        const nearest = await client.query<{ label: string }>(
          "SELECT label FROM vector_probe ORDER BY embedding <=> '[1,0,0]'::vector LIMIT 2"
        );
        const index = await client.query<{ indexdef: string }>(
          "SELECT indexdef FROM pg_indexes WHERE tablename = 'vector_probe' AND indexname = 'vector_probe_hnsw'"
        );
        const distance = await client.query<{ distance: number }>(
          "SELECT l2_distance('[1,0,0]'::vector, '[0,1,0]'::vector)::float8 AS distance"
        );
        return { role: role.rows[0], nearest: nearest.rows, index: index.rows[0], distance: distance.rows[0] };
      });
      expect(result.role).toEqual({ current_user: "meraki_app", session_user: APP_LOGIN_ROLE });
      expect(result.nearest.map((row) => row.label)).toEqual(["near", "middle"]);
      expect(result.index?.indexdef).toContain("USING hnsw");
      expect(result.distance?.distance).toBeGreaterThan(1);
    } finally {
      await Promise.all([app.close(), worker.close()]);
    }
  });

  it("allows exactly one durable receipt and exposes it through a fresh restricted connection", async () => {
    const left = await roleSession(appConnectionString, "meraki_app");
    const right = await roleSession(appConnectionString, "meraki_app");
    try {
      const insert = (session: PostgresDatabaseSession) =>
        session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
          client.query<{ idempotency_key: string }>(
            `INSERT INTO idempotency_receipts
             (tenant_id, subject_id, idempotency_key, request_hash, state)
           VALUES ($1, $2, 'race-key', repeat('a', 64), 'processing')
           ON CONFLICT (tenant_id, subject_id, idempotency_key) DO NOTHING
           RETURNING idempotency_key`,
            [TENANT_A, SUBJECT_A]
          )
        );
      const results = await Promise.all([insert(left.session), insert(right.session)]);
      expect(results.map((result) => result.rowCount).sort()).toEqual([0, 1]);
    } finally {
      await Promise.all([left.close(), right.close()]);
    }

    const fresh = await roleSession(appConnectionString, "meraki_app");
    try {
      const durable = await fresh.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
        client.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM idempotency_receipts WHERE idempotency_key = 'race-key'"
        )
      );
      expect(durable.rows[0]?.count).toBe("1");
    } finally {
      await fresh.close();
    }
  });

  it("enforces tenant, subject, write, and audit-context isolation", async () => {
    await requiredAdmin(admin).query(
      `INSERT INTO idempotency_receipts
         (tenant_id, subject_id, idempotency_key, request_hash, state)
       VALUES
         ($1, $2, 'visible-a', repeat('b', 64), 'processing'),
         ($1, $3, 'hidden-subject', repeat('c', 64), 'processing'),
         ($4, $5, 'hidden-tenant', repeat('d', 64), 'processing');
       INSERT INTO jobs (tenant_id, subject_id, id, job_type, status) VALUES
         ($1, $2, '018f0000-0000-7000-8000-000000000101', 'extract', 'queued'),
         ($1, $3, '018f0000-0000-7000-8000-000000000102', 'extract', 'queued'),
         ($4, $5, '018f0000-0000-7000-8000-000000000103', 'extract', 'queued');
       INSERT INTO audit_entries
         (tenant_id, subject_id, id, actor_id, session_id, action, resource_type)
       VALUES
         ($1, $2, '018f0000-0000-7000-8000-000000000201', $6, $7, 'seed', 'proof'),
         ($1, $3, '018f0000-0000-7000-8000-000000000202', $6, $7, 'seed', 'proof'),
         ($4, $5, '018f0000-0000-7000-8000-000000000203', $6, $7, 'seed', 'proof')`,
      [TENANT_A, SUBJECT_A, SUBJECT_B, TENANT_B, SUBJECT_C, ACTOR, SESSION]
    );

    const role = await roleSession(appConnectionString, "meraki_app");
    try {
      const visible = await role.session.transaction(context(TENANT_A, SUBJECT_A), async (client) => ({
        tenants: await client.query<{ id: string }>("SELECT id FROM tenants ORDER BY id"),
        subjects: await client.query<{ id: string }>("SELECT id FROM subjects ORDER BY id"),
        receipts: await client.query<{ idempotency_key: string }>(
          "SELECT idempotency_key FROM idempotency_receipts ORDER BY idempotency_key"
        ),
        jobs: await client.query<{ id: string }>("SELECT id FROM jobs ORDER BY id"),
        audit: await client.query<{ id: string }>("SELECT id FROM audit_entries ORDER BY id")
      }));
      expect(visible.tenants.rows.map((row) => row.id)).toEqual([TENANT_A]);
      expect(visible.subjects.rows.map((row) => row.id)).toEqual([SUBJECT_A, SUBJECT_B]);
      expect(visible.receipts.rows.map((row) => row.idempotency_key)).toEqual(["race-key", "visible-a"]);
      expect(visible.jobs.rows.map((row) => row.id)).toEqual(["018f0000-0000-7000-8000-000000000101"]);
      expect(visible.audit.rows.map((row) => row.id)).toEqual(["018f0000-0000-7000-8000-000000000201"]);

      await expect(
        role.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
          client.query("INSERT INTO tenants (id) VALUES ($1)", [FORBIDDEN_TENANT])
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        role.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
          client.query(
            `INSERT INTO idempotency_receipts
             (tenant_id, subject_id, idempotency_key, request_hash, state)
           VALUES ($1, $2, 'cross-subject-write', repeat('e', 64), 'processing')`,
            [TENANT_A, SUBJECT_B]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        role.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
          client.query(
            `INSERT INTO jobs (tenant_id, subject_id, id, job_type, status)
           VALUES ($1, $2, '018f0000-0000-7000-8000-000000000104', 'extract', 'queued')`,
            [TENANT_B, SUBJECT_C]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        role.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
          client.query(
            `INSERT INTO audit_entries
             (tenant_id, subject_id, id, actor_id, session_id, action, resource_type)
           VALUES ($1, $2, '018f0000-0000-7000-8000-000000000204', $3, $4, 'spoof', 'proof')`,
            [TENANT_A, SUBJECT_A, OTHER_ACTOR, OTHER_SESSION]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });

      const validAudit = await role.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
        client.query<{ id: string }>(
          `INSERT INTO audit_entries
             (tenant_id, subject_id, id, actor_id, session_id, action, resource_type)
           VALUES ($1, $2, '018f0000-0000-7000-8000-000000000205', $3, $4, 'valid', 'proof')
           RETURNING id`,
          [TENANT_A, SUBJECT_A, ACTOR, SESSION]
        )
      );
      expect(validAudit.rows[0]?.id).toBe("018f0000-0000-7000-8000-000000000205");
    } finally {
      await role.close();
    }
  });

  it("writes and reads a restart sentinel through separate restricted connection pools", async () => {
    const sentinelId = await writeRestartSentinel(appConnectionString);
    expect(await readRestartSentinel(appConnectionString, sentinelId)).toBe(true);
  });
});

async function assertDisposableSchemaState(client: pg.Client): Promise<void> {
  const result = await client.query<{ ledger: string | null; foundation: string | null }>(
    `SELECT to_regclass('public.meraki_schema_migrations')::text AS ledger,
            to_regclass('public.idempotency_receipts')::text AS foundation`
  );
  const row = result.rows[0];
  if (row?.foundation !== null && row?.foundation !== undefined && row.ledger === null) {
    throw new Error(
      "Disposable database contains an untracked foundation schema; recreate the database before live tests"
    );
  }
}

async function expectFoundationSchema(client: pg.Client): Promise<void> {
  const tables = await client.query<{ table_name: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
    `SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c
      WHERE c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [["audit_entries", "idempotency_receipts", "jobs", "subjects", "tenants"]]
  );
  expect(tables.rows).toHaveLength(5);
  expect(tables.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  const extensions = await client.query<{ extname: string; extversion: string }>(
    "SELECT extname, extversion FROM pg_extension WHERE extname IN ('pgcrypto', 'vector') ORDER BY extname"
  );
  expect(extensions.rows.map((row) => row.extname)).toEqual(["pgcrypto", "vector"]);
  expect(extensions.rows.find((row) => row.extname === "vector")?.extversion).toMatch(/^\d+\.\d+/u);
}

function requiredAdmin(client: pg.Client | undefined): pg.Client {
  if (client === undefined) throw new Error("Admin database connection was not initialized");
  return client;
}

async function roleSession(
  restrictedConnectionString: string,
  role: "meraki_app" | "meraki_worker"
): Promise<{
  raw: pg.Client;
  session: PostgresDatabaseSession;
  close: () => Promise<void>;
}> {
  const client = new pg.Client({ connectionString: restrictedConnectionString });
  await client.connect();
  const pool: TransactionPool = { connect: () => Promise.resolve(new PgClientAdapter(client)) };
  return {
    raw: client,
    session: new PostgresDatabaseSession(pool, role),
    close: () => client.end()
  };
}

class PgClientAdapter implements TransactionClient {
  public constructor(private readonly client: pg.Client) {}

  public async query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>> {
    const result = await this.client.query<Row>(text, values === undefined ? undefined : [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  public release(): void {}
}
