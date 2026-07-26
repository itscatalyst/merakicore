# Architecture

Meraki keeps evidence, interpretation, and action separate:

```text
explicit correction or outcome
  -> immutable evidence
  -> scoped candidate rule
  -> explicit approval
  -> deterministic guidance pack
  -> related agent run
  -> evaluation, revoke, or later revision
```

## Packages

- `@meraki/core` owns canonical learning behavior. It records evidence, versions profile atoms, retrieves eligible guidance, compiles deterministic packs, records runs, and evaluates changes.
- `@meraki/contracts` is generated from `schemas/meraki.schema.json`. Generated types are never edited by hand.
- `@meraki/auth` verifies signed JWTs and derives tenant, subject, actor, session, and scopes from verified claims.
- `@meraki/storage-local` implements the single runtime-persistence interface with atomic JSON file replacement.

The API and MCP applications are adapters. Neither owns learning state or imports another application.

## Invariants

- Evidence is immutable.
- Candidates do not affect behavior before approval.
- Tenant and subject authority comes from verified credentials, never caller-selected headers.
- Retrieval is scoped by subject, project, task type, mode, lifecycle, and token budget.
- Identical state and task context produce byte-identical RFC 8785 canonical packs and SHA-256 hashes.
- Revocation and rollback create traceable versions; they do not erase source evidence.

Local JSON storage is intentionally single-process. A hosted database adapter must satisfy the same persistence interface and isolation invariants before it is supported.
