import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { APP_LOGIN_ROLE, runtimeConnectionString } from "./bootstrap-roles.js";
import { PostgresDatabaseSession } from "./session-context.js";
import type { QueryResult, TransactionClient, TransactionPool } from "./session-context.js";

const TENANT_ID = "018f0000-0000-7000-8000-000000000901";
const SUBJECT_ID = "018f0000-0000-7000-8000-000000000911";
const ACTOR_ID = "018f0000-0000-7000-8000-000000000921";
const SESSION_ID = "018f0000-0000-7000-8000-000000000931";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function writeRestartSentinel(connectionString: string): Promise<string> {
  const sentinelId = randomUUID();
  await withSession(connectionString, async (session) => {
    await session.transaction(context(), async (client) => {
      await client.query("INSERT INTO tenants (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [TENANT_ID]);
      await client.query(
        "INSERT INTO subjects (tenant_id, id) VALUES ($1, $2) ON CONFLICT (tenant_id, id) DO NOTHING",
        [TENANT_ID, SUBJECT_ID]
      );
      await client.query(
        `INSERT INTO idempotency_receipts
           (tenant_id, subject_id, idempotency_key, request_hash, state, result_reference, completed_at)
         VALUES ($1, $2, $3, $4, 'completed', jsonb_build_object('sentinel_id', $3), transaction_timestamp())`,
        [TENANT_ID, SUBJECT_ID, restartKey(sentinelId), sha256(sentinelId)]
      );
    });
  });
  return sentinelId;
}

export async function readRestartSentinel(connectionString: string, sentinelId: string): Promise<boolean> {
  if (!UUID_PATTERN.test(sentinelId)) throw new Error("Restart sentinel id must be a UUID");
  return withSession(connectionString, (session) =>
    session.transaction(context(), async (client) => {
      const result = await client.query<{ present: boolean }>(
        `SELECT EXISTS (
         SELECT 1
           FROM idempotency_receipts
          WHERE tenant_id = $1
            AND subject_id = $2
            AND idempotency_key = $3
            AND state = 'completed'
            AND result_reference->>'sentinel_id' = $4
       ) AS present`,
        [TENANT_ID, SUBJECT_ID, restartKey(sentinelId), sentinelId]
      );
      return result.rows[0]?.present === true;
    })
  );
}

function context() {
  return {
    tenantId: TENANT_ID,
    subjectId: SUBJECT_ID,
    actorId: ACTOR_ID,
    sessionId: SESSION_ID,
    scopes: ["restart:proof"]
  } as const;
}

async function withSession<Result>(
  connectionString: string,
  operation: (session: PostgresDatabaseSession) => Promise<Result>
): Promise<Result> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    return await operation(new PostgresDatabaseSession(new PgPoolAdapter(pool)));
  } finally {
    await pool.end();
  }
}

class PgPoolAdapter implements TransactionPool {
  public constructor(private readonly pool: pg.Pool) {}

  public async connect(): Promise<TransactionClient> {
    return new PgClientAdapter(await this.pool.connect());
  }
}

class PgClientAdapter implements TransactionClient {
  public constructor(private readonly client: pg.PoolClient) {}

  public async query<Row extends object = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>> {
    const result = await this.client.query<Row>(text, values === undefined ? undefined : [...values]);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  public release(): void {
    this.client.release();
  }
}

function restartKey(sentinelId: string): string {
  return `restart:${sentinelId}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function appConnectionString(): string {
  const direct = process.env["MERAKI_APP_DATABASE_URL"];
  if (direct !== undefined) return direct;
  const admin = process.env["DATABASE_URL"];
  const password = process.env["MERAKI_APP_DATABASE_PASSWORD"];
  if (admin === undefined) throw new Error("DATABASE_URL or MERAKI_APP_DATABASE_URL is required");
  if (password === undefined) throw new Error("MERAKI_APP_DATABASE_PASSWORD is required");
  return runtimeConnectionString(admin, APP_LOGIN_ROLE, password);
}

async function main(): Promise<void> {
  const operation = process.argv[2];
  const connectionString = appConnectionString();
  if (operation === "write") {
    const sentinelId = await writeRestartSentinel(connectionString);
    process.stdout.write(`${JSON.stringify({ sentinelId, persisted: true })}\n`);
    return;
  }
  if (operation === "read") {
    const sentinelId = process.argv[3];
    if (sentinelId === undefined) throw new Error("Usage: restart-proof read <sentinel-id>");
    const persisted = await readRestartSentinel(connectionString, sentinelId);
    process.stdout.write(`${JSON.stringify({ sentinelId, persisted })}\n`);
    if (!persisted) process.exitCode = 1;
    return;
  }
  throw new Error("Usage: restart-proof <write|read sentinel-id>");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
