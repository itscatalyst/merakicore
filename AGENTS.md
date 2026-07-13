# Meraki engineering operating contract

## Shared objective

Every change must move the completion conditions in `GOAL.md` toward demonstrable truth. A compiling repository, attractive graph, longer prompt, or guided output without causal controls is not completion.

## Authority and roles

- Root Codex owns the goal, packet assignment, integration, reviewer selection, and gate acceptance.
- Principal architect owns contracts, ontology, security boundaries, dependency rules, and ADRs.
- Workers edit only packet-allowed files and stop on semantic conflict or scope expansion.
- Independent reviewers inspect evidence and never repair the implementation they review.

## Invariants

1. `config/execution_graph.yaml` is the only hand-maintained execution DAG.
2. JSON Schemas are canonical wire contracts; generated types must not be hand-edited.
3. Evidence is immutable; interpretations are versioned and reversible.
4. Tenant and subject authority comes from authenticated server context, not client-selected identifiers.
5. Provider calls occur outside domain transactions; malformed results commit nothing.
6. Studio reads projections and issues versioned commands; it never writes canonical tables directly.
7. A gate is complete only after independent `ACCEPT`; packet completion alone unlocks nothing.
8. Real dogfood data is forbidden until the dogfood-security checkpoint is accepted.

## Conflict order

Resolve conflicts in this order: `GOAL.md` → accepted ADRs → JSON Schemas → OpenAPI → `config/execution_graph.yaml` → other docs/prompts. Record every resolution in `ops/orchestration/contract-conflicts.md`.
