# Contract conflict register

| ID | Conflict | Resolution | Authority | Status |
|---|---|---|---|---|
| CF-001 | Root prompt forbade UI while GOAL required Studio | Studio is required; consumer UI remains excluded | GOAL.md, ADR-0003 | resolved |
| CF-002 | Gates/work packets/docs were independent editable DAGs | `config/execution_graph.yaml` is the only execution source | ADR-0001 | resolved |
| CF-003 | Studio unlocked from completed Core packets | Studio requires independently accepted Core gates | execution_graph v2 | resolved |
| CF-004 | Tenancy/deletion/security first appeared at release | Foundations moved to G0–G2; G8 hardens; DS gates dogfood | ADR-0002 | resolved |
| CF-005 | G0-C3/C4 and G4-R5/R6 responsibilities varied in prose | C3 generated types, C4 DB; R5 fusion/rerank, R6 compiler/provenance/debug | execution_graph v2 | resolved |
| CF-006 | G6-E3 attribution/ablation was inconsistently represented | G6-E3 owns attribution, ablation, and equal-token raw-memory control | execution_graph v2 | resolved |
