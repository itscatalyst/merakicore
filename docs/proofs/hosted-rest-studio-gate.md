# Gate A1 proof bundle

This document records executable evidence for hosted REST and Studio. It must
be updated with the final commit SHA and captured output before the issue #9
PR is merged. Secrets, bearer tokens, database URLs, peppers, and token
digests must never be copied here.

## Scope

Implementation commit: `974afe4` (local branch `codex/gate4-hosted-resume`).

Included: production Next.js REST routes, the public data-free Studio shell,
authenticated Studio reads and governance mutations, transaction-mode Supabase
persistence, route parity, and two-process restart proof.

Deferred: rejected-request durable events (#10), operator token lifecycle (#11),
remote MCP (#12), deployment (#14), and adaptive-runtime contracts.

## Commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm --filter @meraki/hosted build
corepack pnpm audit --prod
corepack pnpm contracts:check
git diff --check
```

The live proof additionally starts two production `next start` processes with
isolated temporary credentials and the Supabase transaction pooler. Record
only status codes, request IDs, revisions, snapshot hashes, and redacted
latency measurements. No `MERAKI_TEST_*` credentials were present in this
workspace during the current run, so the live proof is explicitly blocked and
has not been substituted with unit tests.

The expanded live harness requires these additional redacted fixture names:
`MERAKI_TEST_HOSTED_READ_ONLY_TOKEN`,
`MERAKI_TEST_HOSTED_EXPIRED_TOKEN`,
`MERAKI_TEST_HOSTED_REVOKED_TOKEN`,
`MERAKI_TEST_HOSTED_OTHER_SUBJECT_TOKEN`, and
`MERAKI_TEST_HOSTED_OTHER_SUBJECT_ID`.

## Required proof matrix

- `/health`, `/studio`, and `/dashboard`: status, no-store, CSP nonce, exact
  origin handling, and no private data in the HTML shell.
- Snapshot and protected reads: valid owner/read-only access, missing/invalid/
  expired/revoked credentials, foreign subject denial, and list bounds.
- Mutations: correction → inactive candidate → pre-approval baseline → approval
  → related guidance, unrelated baseline, reject/rescope/revoke, and proposal
  decision actions.
- Transport failures: hostile origin, malformed JSON, invalid UTF-8, unsupported
  media type/method, declared and streamed oversized bodies, structured request
  IDs, and no secret leakage.
- Durability: instance A writes, instance B reads and approves, concurrent same
  key produces one commit plus one replay, different writes do not lose state,
  and a fresh instance reconstructs the same revision/hash and lineage.

## Evidence record

| Item | Result | Commit/output reference |
| --- | --- | --- |
| Frozen install | passed | `corepack pnpm install --frozen-lockfile` |
| Build/typecheck/format/lint | passed | `corepack pnpm verify` stages; lint completed separately after a Windows timeout cleanup |
| Unit and contract tests | 224 passed, 2 live suites skipped | `corepack pnpm test`; `corepack pnpm contracts:check` (36 definitions, 21 routes) |
| Production endpoint matrix | partial shell proof; live API blocked | `next start`: `/studio` 200 with nonce/no-store; `/health` 503 with dummy unreachable DB and redacted body |
| Two-process durability | blocked: no temporary Supabase credentials supplied | No live credential names found in `MERAKI_TEST_*` environment |
| Secret scan and dependency audit | passed | `corepack pnpm security:secrets`; `corepack pnpm audit --prod` |
| Independent review | pending | Read-only review requested before merge decision |

The configured Supabase project `fekueomuolskqtnbzxfl` was independently
checked on 2026-07-29: status `ACTIVE_HEALTHY`, Postgres 17.6, the
`meraki_private` runtime tables and Gate 3 migrations are present, and the
management advisor returned no high-severity finding. This is infrastructure
health evidence only; it is not a substitute for running the hosted process
with temporary credentials through the transaction pooler.

## Limitations

This gate does not prove production deployment, public availability, OAuth,
remote MCP, rejected-request audit durability, adaptive learning quality, or
live Supabase durability in the absence of temporary credentials. Those claims
require later gates and separate evidence.
