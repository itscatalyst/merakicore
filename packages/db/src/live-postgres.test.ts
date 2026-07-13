import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresDatabaseSession } from "./session-context.js";
import type { DatabaseSessionContext, QueryResult, TransactionClient, TransactionPool } from "./session-context.js";

const connectionString = process.env["DATABASE_URL"];
const liveRequired = process.env["MERAKI_REQUIRE_LIVE_DB"] === "1";

if (liveRequired && connectionString === undefined) {
  throw new Error("MERAKI_REQUIRE_LIVE_DB=1 requires DATABASE_URL for a disposable PostgreSQL database");
}

const describeLive = liveRequired && connectionString !== undefined ? describe.sequential : describe.skip;

const TENANT_A = "018f0000-0000-7000-8000-000000000001";
const TENANT_B = "018f0000-0000-7000-8000-000000000002";
const SUBJECT_A = "018f0000-0000-7000-8000-000000000011";
const SUBJECT_B = "018f0000-0000-7000-8000-000000000012";
const SUBJECT_C = "018f0000-0000-7000-8000-000000000013";
const ACTOR = "018f0000-0000-7000-8000-000000000021";
const SESSION = "018f0000-0000-7000-8000-000000000031";

const context = (tenantId: string, subjectId: string): DatabaseSessionContext => ({
  tenantId,
  subjectId,
  actorId: ACTOR,
  sessionId: SESSION,
  scopes: ["foundation:test"]
});

describeLive("live PostgreSQL foundation", () => {
  let admin: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
  });

  it("applies up, down, and up with schema assertions", async () => {
    const up = await readFile(resolve(process.cwd(), "migrations/0001_foundation.up.sql"), "utf8");
    const down = await readFile(resolve(process.cwd(), "migrations/0001_foundation.down.sql"), "utf8");

    await admin.query(up);
    await expectFoundationSchema(admin);
    await admin.query(down);
    const removed = await admin.query<{ relation: string | null }>(
      "SELECT to_regclass('public.idempotency_receipts')::text AS relation"
    );
    expect(removed.rows[0]?.relation).toBeNull();
    await admin.query(up);
    await expectFoundationSchema(admin);

    await admin.query(
      `INSERT INTO tenants (id) VALUES ($1), ($2);
       INSERT INTO subjects (tenant_id, id) VALUES ($1, $3), ($1, $4), ($2, $5);`,
      [TENANT_A, TENANT_B, SUBJECT_A, SUBJECT_B, SUBJECT_C]
    );
  });

  it("allows exactly one durable receipt during an independent-connection race", async () => {
    const left = await roleSession();
    const right = await roleSession();
    try {
      const insert = (session: PostgresDatabaseSession) => session.transaction(
        context(TENANT_A, SUBJECT_A),
        (client) => client.query<{ idempotency_key: string }>(
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
      const durable = await admin.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM idempotency_receipts WHERE tenant_id = $1 AND subject_id = $2 AND idempotency_key = 'race-key'",
        [TENANT_A, SUBJECT_A]
      );
      expect(durable.rows[0]?.count).toBe("1");
    } finally {
      await Promise.all([left.close(), right.close()]);
    }
  });

  it("allows same-context access and denies cross-subject and cross-tenant access", async () => {
    await admin.query(
      `INSERT INTO idempotency_receipts
         (tenant_id, subject_id, idempotency_key, request_hash, state)
       VALUES
         ($1, $2, 'visible-a', repeat('b', 64), 'processing'),
         ($1, $3, 'hidden-subject', repeat('c', 64), 'processing'),
         ($4, $5, 'hidden-tenant', repeat('d', 64), 'processing')`,
      [TENANT_A, SUBJECT_A, SUBJECT_B, TENANT_B, SUBJECT_C]
    );

    const role = await roleSession();
    try {
      const visible = await role.session.transaction(context(TENANT_A, SUBJECT_A), (client) =>
        client.query<{ idempotency_key: string }>(
          "SELECT idempotency_key FROM idempotency_receipts ORDER BY idempotency_key"
        )
      );
      expect(visible.rows.map((row) => row.idempotency_key)).toEqual(["race-key", "visible-a"]);

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
            `INSERT INTO idempotency_receipts
               (tenant_id, subject_id, idempotency_key, request_hash, state)
             VALUES ($1, $2, 'cross-tenant-write', repeat('f', 64), 'processing')`,
            [TENANT_B, SUBJECT_C]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await role.close();
    }
  });
});

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
  const extensions = await client.query<{ extname: string }>(
    "SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto', 'vector') ORDER BY extname"
  );
  expect(extensions.rows.map((row) => row.extname)).toEqual(["pgcrypto", "vector"]);
}

async function roleSession(): Promise<{ session: PostgresDatabaseSession; close: () => Promise<void> }> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  await client.query("SET ROLE meraki_app");
  const pool: TransactionPool = {
    connect: () => Promise.resolve(new PgClientAdapter(client))
  };
  return {
    session: new PostgresDatabaseSession(pool),
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
