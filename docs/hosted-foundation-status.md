# Hosted foundation status

Status of the hosted-foundation engineering work for MerakiCore as of the
`pr/hosted-foundation-v0` branch. This document is a continuation handoff, not a
product launch claim.

**Honest boundary:** Meraki is **not** hosted, deployed, or production-ready.
Gates 0–3 provide a verified foundation. Gate 4 (hosted Next.js REST/Studio)
exists as preserved local work and is **excluded** from this PR until every
required check passes without weakening tests or expanding scope mid-release.

## 1. What this PR implements

Completed and included gates:

| Gate | Summary |
| --- | --- |
| **0** | Hosted migration baseline captured against clean `origin/main` verification. |
| **1** | Shared Meraki application service boundary: atomic mutations, persistence, idempotency, identity/scope isolation, concurrency tests. |
| **2** | Shared governed MCP tool registry; stdio transport separated from tool logic; automatic learning shortcut removed; lifecycle/version/scope/isolation tests. |
| **3** | Private Supabase/Postgres schema; transactional snapshot persistence; token digests; audit events; idempotency records; optimistic concurrency; least-privileged `meraki_runtime` role; migration up/down/up proof; real 20-way concurrency; rollback/stale revision/replay/revocation/isolation tests. |

Not included:

- Hosted Next.js application (`apps/hosted`)
- Extracted Studio package (`packages/studio`)
- Hosted REST adapter wiring that remained unfinished Gate 4 WIP
- Streamable HTTP / remote MCP
- Deployment, OAuth, signup, billing, embeddings

## 2. What was verified

### Gate 0 baseline (documented in `docs/proofs/hosted-migration-baseline.md`)

- `corepack pnpm install --frozen-lockfile`
- `corepack pnpm verify` (build, typecheck, format, lint, tests, contracts, quickstart)
- `corepack pnpm audit --prod` — no known production vulnerabilities
- 12 test files / 95 tests at baseline; OpenAPI parity for 19 operations

### Gates 1–3 (documented in gate proofs and commit history)

- Full repository `corepack pnpm verify` after each gate, with independent review/approval recorded during the original engineering work
- Gate 3 live Supabase proof (`docs/proofs/hosted-postgres-gate.md`):
  - migration up → down → up
  - 20 concurrent distinct mutations retained
  - 20 concurrent identical idempotency requests → 1 commit + 19 replays
  - revoked/expired/revalidated tokens, stale revision, transactional rollback, cross-tenant/subject isolation
  - live vitest: 1 file / 1 test passed (~68.7s) with secrets only in process memory
  - local regression after JSONB fix: 3 files / 38 tests
  - full verify after Gate 3: **15 files / 138 tests**, 36 contract definitions, 19 OpenAPI operations
  - ephemeral proof login roles revoked and dropped after the run

### Release cleanup verification (this PR branch)

Run from `pr/hosted-foundation-v0` after cherry-pick of Gates 0–3:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit --audit-level high
git diff --check
git status --short
```

Results for this branch are recorded in the PR body after the commands are
executed on the clean branch. Live database re-proof is **not** re-run here:
prior Gate 3 test credentials are treated as revoked and unusable.

### Gate 4 verification attempt (excluded)

Attempted on uncommitted WIP on `codex/hosted-studio-mcp-v0` before branch cleanup:

| Check | Result |
| --- | --- |
| Secret scan of WIP | No real credentials; fixtures use placeholders (`private-password`, `db.example.test`) |
| `corepack pnpm install --frozen-lockfile` | Passed |
| `corepack pnpm build` (includes `next build`) | Passed (Next.js 16.2.12) |
| `corepack pnpm typecheck` | Passed |
| `corepack pnpm format:check` | **Failed** — 5 files (including hosted sources) |
| `corepack pnpm lint` | **Failed** — `.next` output linted (ignore gap) + source issues (`next.config.ts` project service, unnecessary assertion in `rest.ts`) |
| Full `corepack pnpm verify` | **Blocked** by format/lint |
| Production server endpoint suite (`/health`, `/studio`, CSP, no-store, durable multi-instance, etc.) | **Not completed** — blocked by verify failures and incomplete final gate approval |

Gate 4 therefore remains **excluded**.

## 3. Current architecture

```text
┌─────────────────────┐     ┌──────────────────────┐
│ apps/api (local)    │     │ apps/mcp (stdio)     │
│ REST + Studio shell │     │ transport only       │
└─────────┬───────────┘     └──────────┬───────────┘
          │                            │
          ▼                            ▼
┌─────────────────────────────────────────────────┐
│ packages/application                            │
│ MerakiApplicationService — authz boundary,      │
│ commands, queries, idempotency, isolation       │
└───────────────────────┬─────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
┌───────────────────┐     ┌───────────────────────────┐
│ packages/core     │     │ packages/mcp-tools        │
│ learning engine   │     │ shared governed registry  │
└───────────────────┘     └───────────────────────────┘
          │
          ▼
┌───────────────────┐     ┌───────────────────────────┐
│ storage-local     │     │ storage-postgres (Gate 3) │
│ JSON file runtime │     │ transactional unit of work│
└───────────────────┘     └─────────────┬─────────────┘
                                        ▼
                              meraki_private (Postgres)
```

Rules:

- Adapters must not own business state outside the application service.
- MCP tool logic lives in `packages/mcp-tools`, not in the stdio transport.
- Postgres path uses digest-only tokens and transactional snapshot + audit +
  idempotency commit.

## 4. Database tables and migration boundary

Canonical migrations (repository source of truth):

```text
db/migrations/0001_hosted_runtime.sql
db/migrations/0002_tokens_and_audit.sql
db/migrations/down/0002_tokens_and_audit.sql
db/migrations/down/0001_hosted_runtime.sql
```

Private schema: `meraki_private`

| Table | Purpose |
| --- | --- |
| `runtime_snapshots` | One revisioned canonical snapshot per `(tenant_id, subject_id)` |
| `access_tokens` | Digest-only, revocable token authorities |
| `idempotency_records` | Immutable per-key receipts |
| `audit_events` | Append-only audit log |

Runtime role: `meraki_runtime` — `NOLOGIN`, least privilege (snapshot
select/insert/update; token select only; audit select/insert; no deletes on
snapshots; no token writes; no audit mutation).

The schema must not be exposed through Supabase Data API / `anon` /
`authenticated` / `service_role` grants.

## 5. Security and identity model

- **Identity scope:** tenant + subject (+ actor/session where applicable) enforced
  by the application service and storage isolation tests.
- **Tokens:** HMAC-SHA-256 digests only in the database; plaintext tokens only in
  process memory when supplied by the operator.
- **Revocation / expiry:** enforced; revalidation inside mutation transactions
  (Gate 3 live proof).
- **Idempotency:** same key + same content → replay; same key + different content
  → reject.
- **Optimistic concurrency:** expected revision must match or mutation fails
  without state change.
- **Audit:** append-only triggers; independent tamper attempt rejected with
  `MERAKI_AUDIT_EVENTS_APPEND_ONLY`.
- **Credentials:** no production secrets committed. Gate 3 test credentials are
  **revoked and unusable**. Do not reuse them.

## 6. Known limitations

- Local API/MCP still default to local JSON persistence; Postgres is an optional
  hosted foundation path, not the migrated local default.
- No hosted HTTP service is in this PR.
- No Streamable HTTP MCP transport.
- No deployment (preview or production).
- No OAuth / public signup / billing.
- Live Postgres integration test skips without `MERAKI_TEST_*` env vars.
- Supabase management API required chunked application of migrations during
  Gate 3 proof; repository files remain the atomic scripts for CLI/release.

## 7. Explicitly deferred work

1. Finish hosted REST/Studio (Gate 4) — only after format, lint, full verify,
   production build, and endpoint security checks all pass.
2. Protocol-tested Streamable HTTP MCP (do not implement ad hoc `/mcp` without
   protocol tests).
3. Migrate the local runtime onto the shared application + storage path as the
   default operator experience.
4. Deploy preview environment.
5. Connect Codex and Claude Code to hosted endpoints.
6. Run cross-tool correction proof.
7. Run protected-behaviour evaluation.
8. Promote only after security review.

## 8. Exact continuation sequence

1. Restore Gate 4 WIP from local recovery artifacts (see below).
2. Fix blockers only:
   - Prettier on the five failing files
   - Ensure `apps/hosted/.next` is ignored by ESLint / `.gitignore`
   - Fix `next.config.ts` ESLint project inclusion and the `rest.ts` assertion
3. Re-run the full Gate 4 checklist (install, typecheck, format, lint, focused
   hosted tests, `next build`, production audit, local `next start`, `/health`,
   `/studio`, nonce CSP, `Cache-Control: no-store`, invalid credentials, exact
   origin, body limits, structured errors, multi-instance durability, full
   `corepack pnpm verify`).
4. Commit Gate 4 only when every check passes; open a follow-up PR.
5. Add Streamable HTTP MCP with protocol tests.
6. Migrate local runtime defaults carefully behind tests.
7. Preview deploy → tool connection → cross-tool proof → protected evaluation →
   security review → promote.

Do **not** redesign the architecture while continuing.

## 9. Commands for local verification

```powershell
# Clean foundation (this PR)
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit --audit-level high

# Optional Gate 3 live DB proof (requires fresh operator-supplied secrets;
# prior MERAKI_TEST_* values are revoked)
corepack pnpm exec vitest run `
  packages/storage-postgres/src/live.integration.test.ts `
  --reporter=verbose
```

## 10. Required environment-variable names (no values)

### Local development (existing)

- `MERAKI_JWT_SECRET`
- `MERAKI_JWT_ISSUER`
- `MERAKI_JWT_AUDIENCE`
- `MERAKI_TENANT_ID`
- `MERAKI_SUBJECT_ID`
- `MERAKI_ACTOR_ID`
- `MERAKI_SESSION_ID`
- `MERAKI_MCP_TOKEN`
- `MERAKI_RUNTIME_PATH`
- `PORT`

### Hosted Postgres / Gate 3 live tests

- `DATABASE_URL` (application runtime connection; least-privileged login that
  inherits `meraki_runtime` grants)
- `MERAKI_TOKEN_PEPPER`
- `MERAKI_TEST_DATABASE_URL`
- `MERAKI_TEST_ADMIN_DATABASE_URL`
- `MERAKI_TEST_TOKEN_PEPPER`
- `MERAKI_TEST_TOKEN`
- `MERAKI_TEST_REVOKED_TOKEN`
- `MERAKI_TEST_EXPIRED_TOKEN`
- `MERAKI_TEST_REVALIDATE_TOKEN`
- `MERAKI_TEST_OTHER_TOKEN`
- `MERAKI_TEST_OTHER_TENANT_TOKEN`
- `MERAKI_TEST_TENANT_ID`
- `MERAKI_TEST_SUBJECT_ID`
- `MERAKI_TEST_OTHER_SUBJECT_ID`
- `MERAKI_TEST_OTHER_TENANT_ID`

### Hosted app (Gate 4 deferred; names only for future work)

- `MERAKI_ALLOWED_ORIGINS`
- `MERAKI_PUBLIC_BASE_URL`
- `MERAKI_MAX_REQUEST_BYTES`

Never commit values for any of the above.

## Gate 4 recovery artifacts (local machine)

Outside the repository (sibling of `meraki-core`):

| Artifact | Path |
| --- | --- |
| Tracked-file binary WIP patch | `../merakicore-hosted-wip.patch` |
| Tracked-file text diff | `../merakicore-gate4-tracked.diff` |
| Untracked file list | `../merakicore-hosted-untracked.txt` |
| Source-only Gate 4 tree | `../merakicore-gate4-source/` |
| Full untracked backup (may include `node_modules`) | `../merakicore-hosted-untracked-backup/` |
| Git stash on original branch | `stash@{0}` message: `gate4-hosted-studio-wip-excluded-from-pr` on `codex/hosted-studio-mcp-v0` |

Restore stash only on a disposable branch; prefer the source-only archive for a
clean re-application.
