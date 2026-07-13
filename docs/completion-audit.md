# Meraki objective evidence audit

This is a living audit of the persistent build goal. It distinguishes executable
evidence from design intent and does not treat skipped live tests as proof.

| Requirement | Current evidence | Status |
|---|---|---|
| Correction becomes immutable evidence | `packages/learning/src/index.ts`, `packages/learning/src/index.test.ts`; frozen record and content hash | Proven at adapter level |
| Narrow lesson extraction | `LearningEngine.extractLesson()` and source event reference | Proven at adapter level |
| Studio evidence/scope/mode/confidence/lifecycle | `apps/studio/src/App.tsx` and Studio tests | Proven at local read-model level |
| Relevant connected agent changes behavior | `apps/api/src/runtime.ts`, REST/runtime tests | Proven at in-memory runtime level |
| Unrelated task/mode unaffected | API runtime test and evaluation harness | Proven at adapter level |
| Objective evaluation and targeted ablation | `packages/evaluation/src/index.ts` and tests | Proven by controlled harness |
| Approve/edit/limit/revoke | Core versioned commands and Studio controls | Proven at adapter/UI level |
| Source traceability | Evidence event ID → ProfileAtom evidence → Meraki Pack atom manifest → run trace | Proven at adapter level |
| Restart survival | JSON ledger `verifyRestart()` test | Proven for JSON adapter; PostgreSQL restart still open |
| Clean installation | `docs/install.md`, frozen-lockfile build scripts | Static install path documented; clean machine not yet executed |
| PostgreSQL 16 + pgvector, RLS, concurrent idempotency | `packages/db/src/live-postgres.test.ts` and `ci:gate0` | **Open: requires live runtime** |

The goal must not be marked complete until the final row is executed against a
real PostgreSQL 16 + pgvector instance and an independent reviewer accepts the
result.
