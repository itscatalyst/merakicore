# Meraki Studio execution graph

Studio is built incrementally alongside the core so it continually verifies the mechanism.

## Studio Gate S0 — Shell and goal

Dependencies:

- Core Gate 0.

Outputs:

- `apps/studio`;
- routing;
- command bar;
- resizable shell;
- goal display;
- health/connection state;
- generated API client;
- basic design tokens;
- accessibility baseline.

Proof:

- Studio loads against a clean local engine;
- shows canonical goal;
- shows health and contract versions;
- no handwritten API wire types.

## Studio Gate S1 — Vertical-slice inspector

Dependencies:

- Core Gate 1.

Purpose:

Expose the first full correction loop.

Views:

- event;
- observation;
- atom;
- pack;
- run;
- evaluation;
- update proposal.

Proof:

- click from changed output back to source evidence;
- confirm/revoke task-local atom;
- related pack changes;
- unrelated pack remains unchanged;
- no direct DB mutation.

This is the first UI milestone.

## Studio Gate S2 — Profile IDE and brain graph

Dependencies:

- Core Gate 3.

Outputs:

- Profile Explorer;
- focused graph;
- node inspector;
- evidence and counterevidence;
- modes;
- versions;
- contradictions;
- learning queue;
- confirm/edit/rescope/revoke.

Proof:

- same user has two valid communication modes;
- graph and list show the same canonical atom versions;
- visual node movement does not alter semantic state;
- revoked atom disappears from future eligibility.

## Studio Gate S3 — Agents and live operations

Dependencies:

- Core Gate 5.

Outputs:

- agent registry;
- connection state;
- heartbeats;
- current task/mode/pack;
- run list;
- live event console;
- trace viewer;
- pause/restrict/disconnect actions.

Proof:

- two connected sessions appear independently;
- restart preserves history;
- current pack can be inspected during/after a run;
- agent permissions are enforced.

## Studio Gate S4 — Eval Lab and improvement control

Dependencies:

- Core Gate 6.

Outputs:

- experiment builder;
- baseline/raw-memory/Meraki/ablation arms;
- blind pairwise review;
- retrieval metrics;
- criterion-level evaluation;
- update proposal queue;
- learning approval;
- longitudinal charts.

Proof:

- one experiment can be created and reproduced;
- arm identities remain blind during review;
- targeted ablation is visible;
- approving an update changes the next relevant pack;
- rejecting it leaves profile unchanged.

## Studio Gate S5 — Goals, sources, and release

Dependencies:

- Core Gates 7 and 8.

Outputs:

- user-goal graph;
- goal progress and evidence;
- source registry;
- deletion impact;
- export;
- policy/debug screen;
- clean-install verification;
- error/empty/loading states;
- accessibility and performance gates.

Proof:

- goal state traces to objective outcomes;
- deletion preview is accurate;
- deletion invalidates dependent profile eligibility;
- clean machine installs Engine + Studio;
- all critical flows work by keyboard.

## Parallel agent assignments

### Studio architect

Owns:

- route information architecture;
- frontend contracts;
- read-model contracts;
- command boundaries;
- design tokens;
- performance and accessibility rules.

### Graph engineer

Owns:

- graph data adapter;
- React Flow projection;
- layouts;
- search;
- expansion;
- filtering;
- graph accessibility;
- graph performance.

### Observability engineer

Owns:

- live event stream;
- agents;
- runs;
- traces;
- job status;
- error console.

### Profile UX engineer

Owns:

- Profile Explorer;
- atom inspector;
- evidence;
- lifecycle actions;
- contradiction handling;
- learning queue.

### Evaluation UX engineer

Owns:

- experiments;
- blind review;
- metrics;
- ablations;
- proof bundles;
- longitudinal views.

### UI systems worker

Owns bounded work:

- primitive components;
- form wiring;
- loading states;
- table/list virtualization;
- route scaffolding;
- tests.

### Studio reviewer

Independently reviews:

- engine/UI truth consistency;
- direct-mutation violations;
- provenance;
- accessibility;
- performance;
- causal-eval visibility;
- graph semantic correctness.

## Merge boundaries

Studio depends on generated contracts and public API/read models.

Engine packages must never import from `apps/studio`.

Studio cannot create alternative profile semantics.

When a UI requirement exposes missing domain semantics, create an architecture decision and update engine contracts first.
