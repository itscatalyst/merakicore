# Hosted Postgres storage gate

Captured on 2026-07-28 against the existing Supabase `meraki` project
(`fekueomuolskqtnbzxfl`, `ap-southeast-1`). This is live database proof, not an
in-memory substitute.

## Shipped boundary

Gate 3 adds:

- a private `meraki_private` schema;
- one revisioned runtime snapshot per tenant and subject;
- digest-only, revocable access-token authorities;
- immutable idempotency receipts;
- append-only audit events;
- a transaction unit of work that commits the snapshot, receipt, and audit
  together;
- optimistic revision checks and deterministic snapshot hashes;
- a `NOLOGIN` runtime group role with least-privilege grants.

The full, reviewable migrations are:

```text
db/migrations/0001_hosted_runtime.sql
db/migrations/0002_tokens_and_audit.sql
db/migrations/down/0002_tokens_and_audit.sql
db/migrations/down/0001_hosted_runtime.sql
```

## Migration up/down/up

The Supabase management API rejected the complete migration bodies as one call
with `INVALID_ARGUMENT`. The same statements were therefore applied in small,
tracked migration chunks. The repository files remain the canonical atomic
scripts for CLI and release use.

The first `up` created four private tables:

```text
runtime_snapshots
access_tokens
idempotency_records
audit_events
```

Validation after the first `up`:

- table count: 4;
- append-only audit triggers: 2;
- `meraki_runtime`: `NOLOGIN`, not superuser, cannot create databases or roles,
  does not inherit, and cannot bypass RLS;
- runtime snapshot `SELECT`/`INSERT`/`UPDATE`: allowed;
- runtime snapshot `DELETE`: denied;
- access-token `SELECT`: allowed;
- access-token writes: denied;
- audit `SELECT`/`INSERT`: allowed;
- audit mutation: denied.

The tracked down migrations then removed the tables, schema, and runtime role.
Validation returned `schema_exists = false`, `role_exists = false`, and
`table_count = 0`. A second tracked `up` recreated the same boundary.

The Supabase migration ledger records the proof sequence from
`gate3_probe_schema` through `gate3_up_again_audit_guard`, followed by
ephemeral proof-login setup and removal. The repository migration numbers
remain `0001` and `0002`; the management-ledger entries are proof-run
subdivisions, not extra product migrations.

## Live transaction proof

The test connected through Supabase's transaction-mode pooler with
`prepare: false` and required TLS. Plaintext bearer tokens and database
passwords were held in process memory only, redacted from output, and never
written into the repository or database. The database stores only
HMAC-SHA-256 token digests.

Command:

```powershell
# Required MERAKI_TEST_* values were supplied from ephemeral process memory.
corepack pnpm exec vitest run `
  packages/storage-postgres/src/live.integration.test.ts `
  --reporter=verbose
```

Result:

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Live test   68.725s
```

The live test proves:

1. revoked and expired tokens are rejected;
2. a token revoked after initial authentication is rejected again inside the
   mutation transaction;
3. 20 concurrent distinct mutations retain all 20 events;
4. 20 concurrent identical idempotency requests produce one commit and 19
   replays;
5. reusing the same idempotency key for different content is rejected;
6. a stale expected revision is rejected without changing state;
7. an intentionally invalid audit request rolls back snapshot, receipt, and
   audit together;
8. evidence extraction creates an inactive candidate and explicit approval
   creates the active revision;
9. cross-subject and cross-tenant reads return no foreign runtime;
10. runtime DDL, snapshot deletion, token writes, and audit mutation are denied;
11. the stored snapshot round-trips through Core and its stored SHA-256 equals
    the canonical reconstruction hash.

The final persisted proof state is:

```json
{
  "revision": 23,
  "snapshot_hash": "sha256:dd650fce937df48eebb0eb739f0f1d7e2a975cf25ef48f785fc1f27f238a60fa",
  "snapshot_type": "object",
  "evidence_events": 21,
  "idempotency_receipts": 23,
  "audit_events": 42,
  "profile_atoms": 1,
  "atom_revisions": ["candidate", "active"],
  "foreign_subject_snapshots": 0,
  "foreign_tenant_snapshots": 0
}
```

## Independent append-only proof

An owner-level `UPDATE` was attempted against an existing proof audit row. The
database rejected it with:

```text
MERAKI_AUDIT_EVENTS_APPEND_ONLY
```

A follow-up query returned 42 audit rows and zero rows containing the tamper
marker. Runtime grants independently deny `UPDATE`, `DELETE`, and `TRUNCATE`.

## Defects found by the live run

The live proof caught three integration defects that fake SQL tests could not:

1. `SELECT ... FOR SHARE` on a token row requires update privilege. The lock was
   removed so the runtime role remains token-read-only. Token authority is still
   revalidated inside the SQL mutation transaction.
2. The same unnecessary lock existed on immutable idempotency rows. The
   tenant/subject snapshot row is the command serialization lock; a second
   receipt read under that lock provides same-key replay correctness.
3. `postgres.js` already encodes objects for `jsonb`. Passing canonical JSON
   strings stored a JSON string rather than an object. Snapshot, receipt, and
   audit parameters now pass structured values; canonical serialization is used
   only for hashing and comparisons.

The security boundary intentionally gives the runtime role no way to re-enable
or alter a token. A revocation committed before the transaction's authority read
is denied. If revocation overlaps an already-authorized transaction, the two
operations linearize at that authority read.

## Local regression proof

After the JSONB correction:

```text
packages/storage-postgres/src/unit-of-work.test.ts
packages/application/src/service.test.ts
packages/auth/src/index.test.ts

Test Files  3 passed (3)
Tests       38 passed (38)
```

These tests cover transaction rollback, revision conflicts, replay
authorization, snapshot identity validation, malformed persisted records,
canonical hashing, and signed local JWT behavior.

The complete repository gate then passed:

```text
corepack pnpm verify

build             passed
typecheck         passed
format check      passed
lint              passed
tests             15 files / 138 tests passed
live test in CI   1 intentionally skipped without hosted secrets
contracts         36 definitions valid
OpenAPI parity    19 operations
quickstart        approval isolation and restart persistence passed

corepack pnpm audit --prod
No known vulnerabilities found
```

The skipped no-secret invocation is not the database proof; the explicit
environment-backed live invocation above passed separately. Once hosted CI
credentials exist, that invocation should become a required protected job.

## Supabase advisors

The post-DDL security advisor reported only the pre-existing
`public.meraki_access_requests` informational notice (`RLS enabled, no policy`).
It reported no warning for the private Meraki runtime schema.

The performance advisor reported three new indexes as unused. That is expected
immediately after a bounded proof workload and is not evidence that the indexes
should be removed:

- `access_tokens_active_subject_idx`;
- `audit_events_subject_timeline_idx`;
- `audit_events_token_id_idx`.

Their usefulness must be evaluated from real hosted query plans after dogfood
traffic exists.

## Proof credential cleanup

After the live run and independent review, the temporary `meraki_gate3` and
`meraki_gate3_admin` login roles were explicitly revoked and dropped through
the tracked `gate3_remove_ephemeral_logins` migration. A follow-up role query
returned only `meraki_runtime`, still `NOLOGIN` with all fail-closed role
attributes. The proof access-token rows contain digests only and remain because
the append-only audit rows intentionally reference them.

## Remaining boundary

Gate 3 does not deploy an HTTP service or expose the database directly to a
browser. Remote MCP and Studio must use the application command boundary and
the restricted runtime database role. Token issuance and revocation remain
administrative operations; no generic public token-management endpoint exists.
