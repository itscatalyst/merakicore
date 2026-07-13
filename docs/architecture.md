# Meraki Core + Studio architecture

## Authority and data flow

```text
consented source → immutable event → observation → signal → hypothesis
→ immutable ProfileAtom version + typed edges → filtered candidates
→ deterministic MerakiPack → agent run → feedback/outcome → evaluation
→ attribution → governed UpdateProposal → future eligible profile snapshot
```

Canonical state belongs to Core. Studio consumes authenticated, paginated read models and sends versioned commands. Graph views, SSE events, caches, and materialized views are rebuildable projections.

## Planes

1. Evidence stores sources, consent, trust, artifacts, immutable events, edits, choices, feedback, outcomes, and provenance.
2. Representation creates observations, deterministic features, signals, episodes, and falsifiable hypotheses with uncertainty.
3. Profile stores immutable atom versions, typed relations, snapshots, modes, scope, evidence/counterevidence, confidence, lifecycle, sensitivity, and utility.
4. Guidance resolves task/mode, filters permission/status/scope/sensitivity, retrieves, resolves conflicts, reranks, budgets, and deterministically compiles packs.
5. Runtime provides REST, generated SDK, bounded MCP, CLI, agent registry, exact run ledger, and restart persistence.
6. Evaluation separates retrieval and output measurement and supports blinded baseline, equal-token raw-memory, Meraki, and targeted-ablation arms.
7. Learning control proposes reinforce/weaken/rescope/split/merge/supersede/expire/revoke operations. Policy or explicit users apply them as new versions.
8. Studio makes lineage, agent behavior, evaluation, and governance inspectable without becoming a second source of truth.

## Frozen foundation decisions

- Node.js 22, pnpm 10, strict TypeScript, Fastify, PostgreSQL 16, pgvector, pg-boss, Ajv.
- UUIDv7 identifiers, UTC RFC 3339 timestamps, snake_case JSON fields.
- RFC 8785 canonical JSON and SHA-256 pack hashes; canonical atom ID/version breaks score ties.
- Same-origin Studio uses HTTP-only session cookies plus CSRF tokens. SDK/MCP use scoped bearer credentials.
- Auth middleware binds tenant, subject, actor, scopes, and session. Request bodies cannot grant authority.
- Composite tenant foreign keys and RLS apply from G0; audit, consent, redaction, deletion lineage, and restricted DB roles land before dogfood.
- Provider calls run outside domain transactions. Only complete schema-valid results commit atomically.
- SSE is notification transport: typed envelope, monotonic ID, bounded retention, `Last-Event-ID` replay, gap detection, then canonical read-model refresh.
- Graph layout/viewport is browser-local in v0. Moving nodes never changes semantic edges.

## Epistemic and lifecycle rules

Authority descends from explicit current instruction, objective outcome, correction/edit, explained choice, confirmed atom, repeated behavior, implicit behavior, model inference, then generic prior. One direct correction may guide its task immediately; durable reuse requires confirmation or policy-qualified independent evidence. Models cannot promote atoms or infer sensitive traits.

Lifecycle: `candidate`, `active`, `stable`, `locked_core`, `dormant`, `superseded`, `revoked`, `unsupported`. Only explicit user action creates `locked_core`. Every change creates a new version and supports rollback through snapshots/new versions, never destructive mutation.
