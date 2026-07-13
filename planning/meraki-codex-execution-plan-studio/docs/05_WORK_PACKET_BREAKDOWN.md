# Work packets

## Gate 0 packets

### G0-C1 — Scaffold

Owner: cheap repository worker

Allowed:

```text
package.json
pnpm-workspace.yaml
tsconfig*
eslint*
vitest*
apps/**
packages/**
ops/**
```

Output:

- monorepo;
- strict TypeScript;
- build/test/lint scripts;
- package dependency boundaries;
- empty applications and packages.

Acceptance:

```text
pnpm install
pnpm typecheck
pnpm lint
pnpm test
```

### G0-C2 — Canonical contracts

Owner: principal architect

Output schemas:

- event;
- observation;
- signal;
- hypothesis;
- atom;
- edge;
- task context;
- pack;
- run;
- feedback;
- outcome;
- evaluation;
- proposal;
- experiment;
- job;
- errors;
- deletion/export.

Acceptance:

- Ajv validates fixtures;
- generated types compile;
- contract matrix has no duplicate owner.

### G0-C3 — Database foundation

Owner: infrastructure worker

Output:

- PostgreSQL and pgvector compose;
- migration runner;
- rollback;
- tenancy columns;
- audit;
- idempotency table;
- job queue tables.

Acceptance:

- clean apply;
- rollback;
- second apply;
- concurrent idempotency test.

## Gate 1 packets

### G1-E1 — Correction fixture and ingest

Owner: evidence worker

Input:

- original output;
- user edit;
- task context;
- explicit reason.

Output:

- source;
- immutable event;
- artifact versions;
- diff features.

### G1-L1 — Correction extractor

Owner: deterministic extractor worker

Output observation:

```text
The user removed [pattern] and replaced it with [pattern] for [task context].
```

No motive.

### G1-P1 — Task-local atom

Owner: profile worker

Atom:

- facet;
- claim;
- scope;
- evidence;
- candidate lifecycle;
- confirmation endpoint.

### G1-R1 — Minimal guide

Owner: guidance worker

Retrieves confirmed task/project atom and compiles deterministic pack.

### G1-V1 — Loop test

Owner: evaluation worker

Verifies:

- related task changes;
- unrelated task does not;
- event → atom → pack → run → feedback lineage.

## Gate 2 packets

### G2-E1 — Source registry

- content hash;
- trust;
- consent;
- raw storage;
- deduplication;
- deletion reference.

### G2-E2 — Event normalizers

Adapters:

- conversation;
- edit;
- selection;
- approval/rejection;
- tool/run trace;
- outcome.

### G2-X1 — Deterministic text extraction

- diff;
- phrase patterns;
- structure change;
- length;
- ordering;
- correction recurrence.

### G2-X2 — Choice extraction

- pairwise choice;
- criterion;
- reason;
- context;
- confidence;
- implicit versus explicit.

### G2-X3 — Workflow extraction

- sequence;
- repeated next action;
- tool order;
- skipped step;
- definition-of-done behavior.

### G2-X4 — Model observation extractor

Output:

- direct observation;
- evidence spans;
- facet candidates;
- scope candidates;
- alternatives;
- sensitivity;
- confidence.

### G2-T1 — Golden fixtures

Minimum:

- 20 explicit corrections;
- 10 pairwise choices;
- 10 approvals/rejections;
- 5 conflicting contexts;
- 5 injection attempts;
- 5 model-output-not-user-evidence cases.

## Gate 3 packets

### G3-P1 — Atom store

- immutable versions;
- optimistic concurrency;
- evidence;
- counterevidence;
- conflicts;
- graph edges;
- snapshot.

### G3-P2 — Facet ontology

Implement typed registry for:

- facts;
- identity-declared;
- goals;
- current state;
- behavior;
- cognition;
- communication;
- voice;
- taste;
- judgment;
- workflow;
- exemplar;
- anti-pattern;
- uncertainty.

### G3-P3 — Lifecycle policy

- support score;
- promotion;
- confidence cap;
- decay;
- expiry;
- contradiction;
- scope split;
- revocation;
- unsupported evidence.

### G3-M1 — Mode resolver

Input:

- task;
- channel;
- audience;
- project;
- explicit mode;
- recent episodes.

Output:

- selected mode;
- confidence;
- alternatives;
- evidence.

### G3-T1 — Preference math

- pairwise storage;
- Bradley–Terry fitting;
- criterion-specific scores;
- uncertainty;
- context partition;
- no-data abstention.

### G3-Q1 — Active question selector

Selects questions by expected information gain and interruption cost.

## Gate 4 packets

### G4-R1 — Task analyzer

Typed output only.

### G4-R2 — Scope/policy filter

Must run before semantic retrieval.

### G4-R3 — Full-text search

Exact entities, phrases, rules, project names.

### G4-R4 — Vector search

Semantic candidates; provider-neutral.

### G4-R5 — Candidate fusion

Reciprocal-rank fusion or explicit weighted merge.

### G4-R6 — Utility reranker

Features:

- semantic;
- lexical;
- scope;
- mode;
- confidence;
- evidence;
- recency appropriate to type;
- confirmation;
- historical utility;
- contradiction;
- redundancy;
- token cost.

### G4-R7 — Pack compiler

Sections:

- hard constraints;
- objective;
- current context;
- mode;
- decision rules;
- workflow;
- communication;
- preferences;
- examples;
- anti-patterns;
- uncertainty;
- provenance.

### G4-T1 — Retrieval regression suite

Must-include, must-exclude, negative-control, paraphrase, conflicting-mode, stale-state, revoked-source.

## Gate 5 packets

### G5-A1 — API

All mutations require idempotency key.

### G5-A2 — SDK

Typed wrapper around API.

### G5-A3 — MCP

Thin adapter, no profile mutation.

### G5-L1 — Run ledger

Records exact environment and pack manifest.

### G5-F1 — Feedback/outcomes

Explicit feedback, edit, selection, rejection, approval, real outcome.

### G5-O1 — Installation

Bootstrap, migration, health, seed, restart.

## Gate 6 packets

### G6-E1 — Experiment harness

- frozen profile snapshot;
- baseline arm;
- guided arm;
- randomized presentation;
- blinded result;
- full metadata.

### G6-E2 — Retrieval evaluators

- recall;
- precision;
- scope correctness;
- abstention;
- stale leakage;
- token efficiency.

### G6-E3 — Output evaluators

- task success;
- voice;
- preference;
- judgment;
- objective checks;
- correction count;
- edit distance;
- time to acceptance.

### G6-E4 — Attribution and ablation

- direct reason;
- targeted atom;
- pack-level weak evidence;
- single-atom removal;
- component removal;
- context-length control.

### G6-L1 — Update proposals

- reinforce;
- weaken;
- rescope;
- split;
- merge;
- supersede;
- expire;
- request evidence.

### G6-L2 — Policy application

Model judges cannot directly promote.

## Gate 7 packets

### G7-D1 — Dogfood importer

Read-only import from Catalyst artifacts.

### G7-D2 — Labeling pass

Human-reviewed expected atoms and modes.

### G7-D3 — Frozen task suite

No tuning on held-out tasks.

### G7-D4 — Proof runner

Machine-readable outputs and complete failures.

### G7-D5 — Error analysis

Taxonomy:

- extraction;
- scope;
- mode;
- retrieval;
- pack;
- generation;
- evaluation;
- attribution;
- update;
- safety.

## Gate 8 packets

- security;
- tenancy;
- deletion;
- export;
- injection;
- poisoning;
- migration;
- clean install;
- documentation;
- release manifest.

# Studio work packets

## S0 — Shell

- `S0-U1`: Vite/React Studio scaffold
- `S0-U2`: generated API client
- `S0-U3`: IDE shell and command bar
- `S0-U4`: goal/health/contract view
- `S0-T1`: accessibility and clean-load tests

## S1 — Vertical trace inspector

- `S1-U1`: correction lineage timeline
- `S1-U2`: atom inspector
- `S1-U3`: pack and run inspector
- `S1-U4`: confirm/revoke commands
- `S1-T1`: correction-to-changed-pack E2E

## S2 — Profile and graph

- `S2-U1`: graph projection API
- `S2-U2`: Brain Graph
- `S2-U3`: Profile Explorer
- `S2-U4`: mode and contradiction views
- `S2-U5`: Learning Queue
- `S2-T1`: graph truth/performance tests

## S3 — Agents and traces

- `S3-U1`: agent registry/heartbeat
- `S3-U2`: live SSE console
- `S3-U3`: runs list and trace viewer
- `S3-U4`: pause/restrict/disconnect
- `S3-T1`: multi-session persistence E2E

## S4 — Evaluation Lab

- `S4-U1`: experiment builder
- `S4-U2`: blind review
- `S4-U3`: metrics and uncertainty
- `S4-U4`: ablation view
- `S4-U5`: update proposal approval
- `S4-T1`: reproducible experiment E2E

## S5 — Goals, sources and release

- `S5-U1`: user goals
- `S5-U2`: source/deletion impact
- `S5-U3`: policies/debug
- `S5-U4`: export/proof bundle
- `S5-T1`: keyboard/accessibility/performance/clean-install
