import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { calculateMigrationChecksum } from "./migrate.js";

let up = "";
let down = "";
let migrator = "";
let bootstrap = "";
let session = "";
let restartProof = "";

beforeAll(async () => {
  [up, down, migrator, bootstrap, session, restartProof] = await Promise.all([
    readFile(resolve(process.cwd(), "migrations/0001_foundation.up.sql"), "utf8"),
    readFile(resolve(process.cwd(), "migrations/0001_foundation.down.sql"), "utf8"),
    readFile(resolve(process.cwd(), "packages/db/src/migrate.ts"), "utf8"),
    readFile(resolve(process.cwd(), "packages/db/src/bootstrap-roles.ts"), "utf8"),
    readFile(resolve(process.cwd(), "packages/db/src/session-context.ts"), "utf8"),
    readFile(resolve(process.cwd(), "packages/db/src/restart-proof.ts"), "utf8")
  ]);
});

describe("foundation migration static invariants", () => {
  it("installs required extensions and restricted runtime roles", () => {
    expect(up).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(up).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(up).not.toContain("CREATE ROLE");
    expect(up).toContain("GRANT USAGE ON SCHEMA public TO meraki_app, meraki_worker");
    expect(up).toContain(
      "REVOKE ALL ON TABLE tenants, subjects, idempotency_receipts, jobs, audit_entries FROM PUBLIC"
    );
  });

  it("uses composite tenant ownership and foreign keys", () => {
    expect(up).toContain("PRIMARY KEY (tenant_id, id)");
    expect(up).toContain("FOREIGN KEY (tenant_id, subject_id) REFERENCES subjects(tenant_id, id)");
  });

  it("forces RLS on every foundation tenant table", () => {
    for (const table of ["tenants", "subjects", "idempotency_receipts", "jobs", "audit_entries"]) {
      expect(up).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(up).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(up).toContain("tenant_id = meraki_current_tenant_id()");
    expect(up).toContain("subject_id = meraki_current_subject_id()");
  });

  it("makes audit records append-only and idempotency concurrency-safe", () => {
    expect(up).toContain("audit_entries_immutable");
    expect(up).toContain("PRIMARY KEY (tenant_id, subject_id, idempotency_key)");
    expect(up).toContain("request_hash char(64)");
    expect(up).toContain("actor_id = meraki_current_actor_id()");
    expect(up).toContain("session_id = meraki_current_session_id()");
  });

  it("defines a reverse migration for every foundation object", () => {
    for (const table of ["audit_entries", "jobs", "idempotency_receipts", "subjects", "tenants"]) {
      expect(down).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(down).toContain("DROP FUNCTION IF EXISTS meraki_current_tenant_id()");
    expect(down).not.toContain("DROP ROLE");
    expect(down).not.toContain("BEGIN;");
    expect(up).not.toContain("BEGIN;");
  });

  it("tracks ordered checksummed migrations under an advisory lock", () => {
    expect(migrator).toContain("meraki_schema_migrations");
    expect(migrator).toContain("pg_advisory_lock");
    expect(migrator).toContain("pg_advisory_unlock");
    expect(migrator).toContain("checksum char(64)");
    expect(migrator).toContain("ORDER BY applied_order DESC LIMIT 1");
    expect(migrator).toContain("Migration checksum mismatch");
    expect(calculateMigrationChecksum("meraki")).toMatch(/^[0-9a-f]{64}$/u);
    expect(calculateMigrationChecksum("meraki")).toBe(calculateMigrationChecksum("meraki"));
    expect(calculateMigrationChecksum("meraki")).not.toBe(calculateMigrationChecksum("Meraki"));
  });

  it("separates secret-bearing login bootstrap from schema migration", () => {
    expect(bootstrap).toContain('APP_GRANT_ROLE = "meraki_app"');
    expect(bootstrap).toContain('WORKER_GRANT_ROLE = "meraki_worker"');
    expect(bootstrap).toContain('APP_LOGIN_ROLE = "meraki_app_login"');
    expect(bootstrap).toContain('WORKER_LOGIN_ROLE = "meraki_worker_login"');
    expect(bootstrap).toContain("CREATE ROLE ${APP_GRANT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS");
    expect(bootstrap).toContain("CREATE ROLE ${APP_LOGIN_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS");
    expect(bootstrap).toContain("MERAKI_APP_DATABASE_PASSWORD");
    expect(bootstrap).toContain("MERAKI_WORKER_DATABASE_PASSWORD");
    expect(bootstrap).not.toContain("process.stdout.write(password");
  });

  it("switches every runtime transaction to a fixed restricted role", () => {
    expect(session).toContain("SET LOCAL ROLE ${this.role}");
    expect(session).toContain('role !== "meraki_app" && role !== "meraki_worker"');
  });

  it("provides separate write/read restart sentinel operations", () => {
    expect(restartProof).toContain("writeRestartSentinel");
    expect(restartProof).toContain("readRestartSentinel");
    expect(restartProof).toContain("new pg.Pool");
  });
});
