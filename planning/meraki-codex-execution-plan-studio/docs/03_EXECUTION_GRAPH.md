# Execution graph

The work is organized as gates. Codex may parallelize work packets inside a gate when their contracts are frozen.

## Gate 0 — Control plane and frozen contracts

### Objective

Create a repository in which cheap workers cannot drift the architecture.

### Work packets

- `G0-C1`: repository scaffold;
- `G0-C2`: canonical JSON Schemas;
- `G0-C3`: generated TypeScript types;
- `G0-C4`: database migration foundation;
- `G0-C5`: provider/storage interfaces;
- `G0-C6`: orchestration state and gate runner;
- `G0-C7`: CI and contract-drift checks.

### Required contracts

- SourceRecord;
- Event;
- Observation;
- Signal;
- Hypothesis;
- Episode;
- ProfileAtom;
- ProfileEdge;
- TaskContext;
- RetrievalCandidate;
- MerakiPack;
- Run;
- Feedback;
- Outcome;
- Evaluation;
- Attribution;
- UpdateProposal;
- Job;
- API error;
- export/deletion request;
- experiment and experiment arm.

### Gate proof

- generated types match schemas;
- migrations apply and roll back;
- one fixture validates through all contracts;
- no application code hand-defines wire types;
- orchestrator can load task DAG and gate policy.

## Gate 1 — Explicit-correction vertical slice

### Objective

Prove the entire loop with the simplest high-authority signal.

### Flow

```text
user correction
→ event
→ direct observation
→ task-local candidate atom
→ confirmation
→ guide
→ deterministic pack
→ simulated run
→ feedback
→ evaluation
→ update proposal
→ changed future pack
```

### Implement only

- one source adapter: JSON fixture;
- one event: `output.corrected`;
- one extractor: before/after diff;
- one atom type: anti-pattern or procedural correction;
- one scope: task/project;
- one retrieval strategy: structured filter;
- one pack renderer;
- one run ledger;
- one evaluation;
- one proposal operation: reinforce.

### Gate proof

A correction to “avoid generic corporate openings for Meraki launch posts” enters the next related pack and is absent from an unrelated coding pack.

This gate must pass before broad ingestion or embeddings.

## Gate 2 — Evidence and extraction

### Parallel teams

#### Evidence team

Build:

- source registry;
- content-addressed artifacts;
- canonical event log;
- idempotency;
- source trust;
- consent;
- deletion lineage skeleton.

#### Deterministic extraction team

Build:

- text edit diff;
- phrase add/remove;
- selection;
- rejection;
- approval;
- regeneration;
- task-sequence extractor;
- code outcome extractor.

#### Model extraction team

Build:

- structured provider interface;
- observation prompts;
- evidence-span output;
- alternative explanations;
- sensitivity filter;
- validation and failure atomicity.

### Gate proof

Golden fixtures produce observations, never unsupported motives. Duplicate imports do not inflate evidence. Malformed model output mutates nothing.

## Gate 3 — Profile, modes, and lifecycle

### Parallel teams

#### Profile store

- immutable atom versions;
- typed facets;
- evidence and counterevidence;
- edges;
- optimistic concurrency;
- snapshots;
- materialized views.

#### Lifecycle

- support scoring;
- candidate promotion;
- confirmation;
- rescope;
- split/merge;
- decay;
- contradiction;
- supersession;
- revocation;
- unsupported state.

#### Mode engine

- explicit mode declaration;
- rule-based mode resolution;
- mode confidence;
- mode-specific atoms;
- mode leakage tests.

#### Preference model

- pairwise event schema;
- criterion-level reasons;
- Bradley–Terry offline score;
- uncertainty;
- contextual scope.

### Gate proof

The same user can prefer direct, profane language in private product critique and restrained language in a formal client email without conflict. Temporary current-state data expires. One visual choice does not become a global identity claim.

## Gate 4 — Retrieval and context compilation

### Work packets

- task analyzer;
- scope planner;
- full-text retrieval;
- vector adapter;
- candidate merger;
- policy filter;
- conflict resolver;
- utility scorer;
- redundancy reducer;
- token-budget allocator;
- pack compiler;
- provenance renderer;
- debug explanation.

### Required retrieval order

1. permissions;
2. status and validity;
3. exact scope;
4. mode;
5. facet and memory type;
6. lexical;
7. semantic;
8. linked evidence/examples;
9. utility rerank;
10. budget and compression.

### Gate proof

- mandatory atoms recall: 100% on the frozen small suite;
- final pack precision: at least 0.80;
- negative controls abstain;
- twenty compilations are byte-identical;
- unrelated evidence does not change pack hash.

## Gate 5 — Runtime and run ledger

### Work packets

- REST API;
- SDK;
- MCP adapter;
- CLI;
- run start/finish;
- exact model/config logging;
- output and tool-trace storage;
- feedback and outcome endpoints;
- restart persistence;
- local install scripts.

### MCP tools

- `meraki_get_guidance`;
- `meraki_get_examples`;
- `meraki_explain_guidance`;
- `meraki_record_feedback`;
- `meraki_record_outcome`.

No generic direct memory-write tool.

### Gate proof

Two fresh local agent sessions retrieve the same persisted profile and record runs against immutable pack hashes.

## Gate 6 — Evaluation and governed learning

### Work packets

- retrieval evaluator;
- pack evaluator;
- blind A/B harness;
- edit and correction metrics;
- voice evaluator;
- mode evaluator;
- criterion-level preference evaluator;
- attribution engine;
- update proposals;
- policy engine;
- active-question scheduler.

### Gate proof

A blind A/B run records baseline and guided arms. A targeted atom ablation removes the improvement. User feedback outranks a conflicting model judge. The next pack changes only after policy-approved update.

## Gate 7 — Longitudinal dogfood

### Corpus

Import real, permissioned Catalyst/Meraki history:

- user corrections;
- approved and rejected copy;
- landing-page decisions;
- visual references;
- coding instructions;
- project direction;
- modes.

### Frozen task suites

- founder/product writing;
- product critique;
- creative direction;
- coding plan;
- brainstorming;
- negative controls.

### Gate proof

The proof bundle shows:

- preference prediction;
- mode resolution;
- voice adaptation;
- lower correction burden;
- reduced repeated error;
- correct abstention;
- no unrelated profile leakage;
- complete provenance.

## Gate 8 — Release hardening

- tenant authority;
- row-level security;
- deletion propagation;
- export;
- profile poisoning;
- prompt injection;
- provider failure;
- concurrent idempotency;
- migration upgrade/rollback;
- clean install;
- known limitations;
- reproducible release proof.

## Studio gates integrated with core gates

```text
Core G0 → Studio S0
Core G1 → Studio S1
Core G3 → Studio S2
Core G5 → Studio S3
Core G6 → Studio S4
Core G7/G8 → Studio S5
```

Studio begins early because visual traceability is itself a mechanism test. It must never delay the first vertical correction loop, but it must expose that loop immediately after Core Gate 1 passes.
