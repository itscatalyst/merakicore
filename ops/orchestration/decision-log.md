# Architecture decision log

- 2026-07-13: Accepted `GOAL.md` as durable Core + Studio completion contract.
- 2026-07-13: Consolidated execution into `config/execution_graph.yaml` v2.
- 2026-07-13: Required independent gate acceptance before downstream unlock.
- 2026-07-13: Moved identity, tenancy, RLS, audit, consent, redaction, and deletion foundations before dogfood.
- 2026-07-13: Added DS independent security checkpoint before real workspace evidence.
- 2026-07-13: Froze deterministic pack, Studio command/read-model, authenticated SSE, graph-layout, and causal-evaluation decisions in ADRs.
- 2026-07-13: Allowed the semantics-free G0-C1 scaffold to run beside initial G0-C0 reconciliation during repository bootstrap; no contract or domain files overlapped.
- 2026-07-13: Reserved independent reviewers for verdict-only packets; G7-D5 error analysis is owned by an implementation worker, not a reviewer.
