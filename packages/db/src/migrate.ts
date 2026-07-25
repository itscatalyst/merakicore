import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import pg from "pg";

export type MigrationDirection = "up" | "down";

export interface MigrationOptions {
  readonly connectionString: string;
  readonly direction: MigrationDirection;
  readonly migrationsDirectory?: string;
}

export interface MigrationResult {
  readonly applied: readonly string[];
  readonly reverted: readonly string[];
}

interface MigrationFile {
  readonly name: string;
  readonly upFile: string;
  readonly checksum: string;
}

interface LedgerRow {
  readonly name: string;
  readonly checksum: string;
}

const MIGRATION_LOCK_NAME = "meraki_schema_migrations_v1";

export function calculateMigrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export async function migrate(options: MigrationOptions): Promise<MigrationResult> {
  const migrationsDirectory = options.migrationsDirectory ?? resolve(process.cwd(), "migrations");
  const migrations = await discoverMigrations(migrationsDirectory);
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [MIGRATION_LOCK_NAME]);
    try {
      await ensureLedger(client);
      return options.direction === "up"
        ? await migrateUp(client, migrationsDirectory, migrations)
        : await migrateDown(client, migrationsDirectory, migrations);
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [MIGRATION_LOCK_NAME]);
    }
  } finally {
    await client.end();
  }
}

async function discoverMigrations(directory: string): Promise<readonly MigrationFile[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".up.sql")).sort();
  return Promise.all(
    files.map(async (upFile) => {
      const sql = await readFile(resolve(directory, upFile), "utf8");
      return {
        name: upFile.slice(0, -".up.sql".length),
        upFile,
        checksum: calculateMigrationChecksum(sql)
      };
    })
  );
}

async function ensureLedger(client: pg.Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS meraki_schema_migrations (
      applied_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      name text PRIMARY KEY,
      checksum char(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
    )
  `);
  await client.query("REVOKE ALL ON TABLE meraki_schema_migrations FROM PUBLIC");
}

async function migrateUp(
  client: pg.Client,
  migrationsDirectory: string,
  migrations: readonly MigrationFile[]
): Promise<MigrationResult> {
  const applied: string[] = [];
  const ledger = await readLedger(client);
  for (const migration of migrations) {
    const existingChecksum = ledger.get(migration.name);
    if (existingChecksum !== undefined) {
      assertChecksum(migration, existingChecksum);
      continue;
    }
    const sql = await readFile(resolve(migrationsDirectory, migration.upFile), "utf8");
    await inTransaction(client, async () => {
      await client.query(sql);
      await client.query("INSERT INTO meraki_schema_migrations (name, checksum) VALUES ($1, $2)", [
        migration.name,
        migration.checksum
      ]);
    });
    applied.push(migration.name);
  }
  return { applied, reverted: [] };
}

async function migrateDown(
  client: pg.Client,
  migrationsDirectory: string,
  migrations: readonly MigrationFile[]
): Promise<MigrationResult> {
  const latest = await client.query<LedgerRow>(
    "SELECT name, checksum FROM meraki_schema_migrations ORDER BY applied_order DESC LIMIT 1"
  );
  const row = latest.rows[0];
  if (row === undefined) return { applied: [], reverted: [] };
  const migration = migrations.find((candidate) => candidate.name === row.name);
  if (migration === undefined) {
    throw new Error(`Applied migration ${row.name} has no matching up migration file`);
  }
  assertChecksum(migration, row.checksum);
  const downFile = resolve(migrationsDirectory, `${migration.name}.down.sql`);
  const sql = await readFile(downFile, "utf8");
  await inTransaction(client, async () => {
    await client.query(sql);
    await client.query("DELETE FROM meraki_schema_migrations WHERE name = $1", [migration.name]);
  });
  return { applied: [], reverted: [migration.name] };
}

async function readLedger(client: pg.Client): Promise<Map<string, string>> {
  const result = await client.query<LedgerRow>("SELECT name, checksum FROM meraki_schema_migrations");
  return new Map(result.rows.map((row) => [row.name, row.checksum]));
}

function assertChecksum(migration: MigrationFile, storedChecksum: string): void {
  if (storedChecksum !== migration.checksum) {
    throw new Error(`Migration checksum mismatch for ${migration.name}: the applied migration must not be edited`);
  }
}

async function inTransaction(client: pg.Client, operation: () => Promise<void>): Promise<void> {
  await client.query("BEGIN");
  try {
    await operation();
    await client.query("COMMIT");
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main(): Promise<void> {
  const direction = process.argv[2];
  if (direction !== "up" && direction !== "down") {
    throw new Error("Usage: migrate <up|down>");
  }
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined) throw new Error("DATABASE_URL is required");
  const result = await migrate({ connectionString, direction });
  const changed = direction === "up" ? result.applied : result.reverted;
  process.stdout.write(
    changed.length === 0 ? `No migrations to ${direction}.\n` : `${direction}: ${changed.join(", ")}\n`
  );
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
