import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let up = "";
let down = "";

beforeAll(async () => {
  [up, down] = await Promise.all([
    readFile(resolve(process.cwd(), "migrations/0001_foundation.up.sql"), "utf8"),
    readFile(resolve(process.cwd(), "migrations/0001_foundation.down.sql"), "utf8")
  ]);
});

describe("foundation migration static invariants", () => {
  it("installs required extensions and restricted runtime roles", () => {
    expect(up).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(up).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(up).toContain("CREATE ROLE meraki_app NOLOGIN NOSUPERUSER");
    expect(up).toContain("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC");
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
  });

  it("defines a reverse migration for every foundation object", () => {
    for (const table of ["audit_entries", "jobs", "idempotency_receipts", "subjects", "tenants"]) {
      expect(down).toContain(`DROP TABLE IF EXISTS ${table}`);
    }
    expect(down).toContain("DROP FUNCTION IF EXISTS meraki_current_tenant_id()");
    expect(down).toContain("DROP ROLE meraki_app");
  });
});
