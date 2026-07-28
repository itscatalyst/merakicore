# Hosted migration baseline

Captured on 2026-07-28 before changing production code for the hosted Studio and remote MCP work.

## Source

- Branch: `codex/hosted-studio-mcp-v0`
- Commit: `89c6a54b35f89b912c9874b395ba9e7cee2f776f`
- Commit subject: `Make Meraki MCP usable from Claude Code and Codex`
- Node.js: `v24.16.0`
- pnpm: `10.15.1`

The branch was created directly from the current `origin/main`. The previously checked-out synthetic Studio branch was clean, already merged into `main`, and five commits behind.

## Commands and results

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm verify
corepack pnpm audit --prod
```

Results:

- Frozen install passed for all 8 workspace projects.
- Build, typecheck, formatting, and lint passed.
- 12 test files passed with 95 tests.
- Contract validation passed for 36 public definitions.
- OpenAPI parity passed for 19 operations.
- The correction-to-candidate quickstart passed:
  - candidate remained inactive before approval;
  - related guidance changed only after approval;
  - unrelated guidance remained unchanged;
  - restart persistence passed.
- Production dependency audit reported no known vulnerabilities.

The ignored raw logs and machine-readable summaries are under `.meraki/proofs/hosted-baseline/`.

## Runtime baseline

Neither `.meraki/runtime.json` nor `.meraki/mcp.env` existed before this work. The backup manifest records both as absent; no secret or runtime file was overwritten. Therefore the current runtime hash and counts are `null`/`not_present`, not zero.

For deterministic storage tests, a newly constructed empty engine has this reference state:

```json
{
  "source": "empty_engine_reference",
  "snapshot_hash": "sha256:7a0aa66b83383776077f6af31c28c9c1b7a9449ad1dfcf140f7f9adcbf8835fa",
  "snapshot_bytes": 267,
  "profile_atoms": 0,
  "evidence_events": 0,
  "runs": 0,
  "evaluations": 0,
  "update_proposals": 0
}
```

Historical synthetic snapshots remain ignored under `.meraki/`; they are not the default personal runtime and are not treated as product evidence.

## MCP baseline

The stdio adapter advertises five tools:

```text
meraki_get_guidance
meraki_get_examples
meraki_explain_guidance
meraki_record_feedback
meraki_record_outcome
```

The protocol suite verifies initialization, tool discovery, calls, JSON-RPC errors, malformed input, shutdown, and stdin EOF.

## Known limitations entering Gate 1

1. API and stdio MCP each own a mutable runtime directly. There is no shared application transaction boundary.
2. Local persistence rewrites a complete JSON snapshot and supports one writer only. It is unsafe for concurrent or serverless hosting.
3. Hosted authentication, durable token revocation, idempotency receipts, optimistic concurrency, and append-only request audit do not exist.
4. MCP can record evidence but cannot propose, inspect, approve, reject, rescope, or revoke governed profile changes.
5. The current public `learn()` convenience path extracts and immediately approves a lesson. Production MCP does not call it, but keeping it available conflicts with the hosted invariant that candidates cannot change behaviour before explicit approval.
6. Recording feedback alone creates immutable evidence, not a candidate. The planned cross-tool flow therefore needs an explicit inactive candidate-proposal operation; candidate creation must never be inferred or approved automatically.
7. Studio is still coupled to the local Fastify application and has no durable revision, snapshot hash, deployment, or transaction-conflict state.
8. The local documentation uses a predictable example JWT secret while the API binds to all interfaces. The placeholder is acceptable only for isolated development; hosted auth must use generated credentials, and local defaults should bind to loopback.
9. The local MCP setup stores its signing secret in ignored plaintext and grants one launcher every scope. That file must never be committed or reused as the hosted token model.
10. Studio's local Content Security Policy permits inline script and style execution. Hosted Studio needs nonces or static hashed assets.
11. Snapshot arrays are intentionally ordered histories. RFC 8785 canonicalizes object keys but does not reorder arrays, so the hosted hash invariant must define that order as part of state rather than claim equivalence across differently ordered histories.
12. MCP currently accepts retrieval permissions from caller-supplied task context and checks only tenant/subject ownership. A `profile:read` caller can request `read:sensitive`; the shared application boundary must derive or cap permissions from authenticated authority and add a non-escalation regression test.
13. Guidance compilation returns exclusion metadata for every atom it examines. In a mixed-subject local snapshot, MCP explanations can therefore reveal foreign atom IDs, versions, scores, and exclusion reasons even though claims are not returned. Subject-scoped loading plus response filtering and cross-subject metadata-denial tests are required.

This baseline is the comparison point for the remaining gates. Each gate must retain the passing local behavior unless its contract is intentionally tightened and covered by replacement tests.
