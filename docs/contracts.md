# Canonical contract matrix

JSON Schemas under `schemas/` are canonical wire contracts. OpenAPI references them. Generated TypeScript types are derived outputs and application code must not redefine them.

| Contract | Purpose | Required safety/provenance fields |
|---|---|---|
| AuthContext | Server-bound caller authority | tenant_id, subject_id, actor_id, session_id, scopes |
| SourceRecord | Consented source registration | trust_class, consent, content_hash, retention, timestamps |
| Artifact | Content-addressed payload metadata | digest, media_type, byte_length, redaction_state |
| Event | Immutable normalized evidence | source_id, subject_id, event_type, occurred_at, payload, evidence_spans |
| Observation | Direct description, not motive | event_ids, extractor/version, epistemic_class, alternatives |
| Signal | Evidence aggregation | observation_ids, support/counterevidence, scope, confidence |
| Hypothesis | Falsifiable interpretation | claim, alternatives, falsifier, evidence, confidence |
| Episode | Related temporal evidence | event/observation IDs, boundary reason |
| ProfileAtom | Versioned learned claim | atom_id/version, facet, claim, scope, mode, horizon, lifecycle, confidence, utility, sensitivity, evidence/counterevidence |
| ProfileEdge | Typed relation | from/to canonical IDs+versions, relation, evidence |
| ProfileSnapshot | Immutable eligibility manifest | atom versions, policy version, created_at |
| TaskContext | Guidance input | task_type, workspace/project/mode, goal, constraints, permissions, token_budget |
| RetrievalCandidate | Explainable candidate | atom version, scores, inclusion/exclusion reasons |
| MerakiPack | Deterministic guidance | task context digest, items, atom manifest, policy/renderer versions, hash |
| Agent | Connected runtime | runtime/model, permissions, state, last heartbeat |
| AgentControlCommand | Versioned control | expected_version, pause/restrict/disconnect operation, audit reason |
| Run | Exact execution ledger | model/config, prompt, tools, pack hash/manifest, output, cost, latency |
| Feedback | Explicit response | run_id, actor, type, content/edits, created_at |
| Outcome | Objective result | run_id, metric, value, provenance |
| Evaluation | Frozen assessment | experiment/arm, evaluator identity class, criteria, result, uncertainty |
| Attribution | Causal claim | evaluation IDs, ablation target, effect, uncertainty |
| UpdateProposal | Governed learning change | operation, evidence, expected impact, scope/mode, status, expected_version |
| Goal | User goal, distinct from build goal | criteria, constraints, status, evidence/outcomes, version |
| Experiment/Arm | Reproducible comparison | frozen snapshot/tasks/models/parameters/token budget, blinded arm identity |
| Job | Async operation | type, status, progress, error, idempotency result |
| DeletionPreview/Request | Lineage-safe erasure | source/subject target, affected atoms/packs/evals, confirmation/version |
| ExportRequest/Manifest | Auditable export | selection, redaction policy, artifact digests |
| StudioEventEnvelope | SSE notification | event_id, type, tenant-bound resource reference, occurred_at; no canonical authority |
| GraphNode/EdgePage | Focused projection | canonical IDs/versions, cursor, omitted/conflict metadata |
| ApiError | Stable failure shape | code, message, request_id, details, retryable |
| IdempotencyReceipt | Safe mutation replay | key, request_hash, status/result reference |

## Public behavior

- All mutations require `Idempotency-Key`; reuse with the same request hash returns the original result, conflicting reuse returns `409`.
- Versioned commands require `expected_version`; stale writes return `409` and make no changes.
- Collection/read-model endpoints are cursor-paginated. Trace/source/graph APIs never default to full-history/full-graph responses.
- Deletion first exposes an impact preview, then purges raw content, removes derived retrieval eligibility, invalidates affected packs, and keeps content-free audit tombstones.
- Error codes are stable machine identifiers. Authentication failure is `401`, insufficient scope/tenant isolation is non-disclosing `403`/`404` by policy, invalid contracts are `422`, conflicts are `409`, and rate/backpressure is `429`.
