# Meraki Core + Studio

Meraki is an independent, runtime-neutral learning engine plus an IDE-like control and proof surface. It turns consented user evidence into scoped, versioned guidance, measures whether guidance helped, and applies only governed, reversible learning updates.

The canonical build goal is [GOAL.md](GOAL.md). The single executable source for gates and work packets is `config/execution_graph.yaml`; derived views must not be edited independently.

## Foundation architecture

- Core planes: evidence, representation, profile, guidance, runtime, evaluation, and learning control.
- Studio: generated-client read models and versioned domain commands; never direct database access.
- PostgreSQL + pgvector + pg-boss, Fastify, strict TypeScript, Ajv-validated JSON Schema contracts.
- Authenticated tenant/subject context, composite tenant keys, RLS, audit, consent, redaction, export, and deletion lineage are foundations—not release add-ons.

## Execution rule

Execute one gate at a time. Packets may run concurrently only when their dependencies are accepted and file allowlists do not overlap. A gate unlocks dependants only after an independent reviewer records `ACCEPT` with machine-readable evidence.

Start with `AGENTS.md`, `docs/architecture.md`, `docs/contracts.md`, and `config/execution_graph.yaml`.
