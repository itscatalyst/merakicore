# Meraki Studio — Brain IDE specification

## Product role

Meraki Studio is the internal operating surface for the engine.

It is not a generic analytics dashboard and not the consumer Meraki feed. It must make the invisible learning mechanism visible, debuggable, controllable, and testable.

The core question the Studio answers is:

> What does Meraki currently believe, why does it believe it, what did an agent receive, what changed the output, and what will Meraki learn next?

## Design character

The interface should feel closer to an IDE, observability console, and graph debugger than a SaaS admin panel.

Characteristics:

- dense but legible;
- dark-first;
- keyboard-driven;
- multi-pane;
- live;
- trace-oriented;
- local-first;
- no decorative graph animation;
- minimal visual noise;
- serious provenance and debugging information.

## Technical stack

Recommended foundation:

```text
apps/studio
Vite + React + TypeScript
TanStack Router
TanStack Query for remote/server state
small local UI store for viewport, selection and panel state
React Flow for graph rendering
shadcn/ui primitives copied into the repository
Tailwind CSS
SSE for live engine events
Vitest + Testing Library
Playwright for end-to-end tests
```

The graph library is a renderer, not the graph database or canonical domain model.

Do not let UI-library node types leak into engine contracts.

## Application shell

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Command bar: workspace / project / mode / search / goal / connection state│
├───────────────┬──────────────────────────────────────┬─────────────────────┤
│ Left rail     │ Main workbench                       │ Context inspector   │
│               │                                      │                     │
│ Overview      │ Graph / list / run / experiment      │ Evidence            │
│ Brain         │                                      │ Scope               │
│ Learning      │                                      │ Confidence          │
│ Agents        │                                      │ Versions            │
│ Runs          │                                      │ Actions             │
│ Evals         │                                      │                     │
│ Goals         │                                      │                     │
│ Sources       │                                      │                     │
│ Policies      │                                      │                     │
├───────────────┴──────────────────────────────────────┴─────────────────────┤
│ Bottom console: live events / jobs / traces / errors / update proposals    │
└────────────────────────────────────────────────────────────────────────────┘
```

Panels are resizable and their layout is persisted locally per user.

## Primary surfaces

### 1. Command Center

Purpose:

- tell the user whether Meraki is learning and improving;
- show what is active now;
- show failures that require intervention.

Widgets:

- current goal and goal progress;
- connected agents;
- current mode;
- active project;
- latest runs;
- latest learned atoms;
- unresolved contradictions;
- pending confirmations;
- evaluation trend;
- correction-burden trend;
- source ingestion health;
- queue and provider health.

The Command Center must avoid vanity metrics such as total memory count without utility context.

### 2. Brain Graph

A queryable projection of the Meraki Profile and its provenance.

#### Node types

- `subject`;
- `workspace`;
- `project`;
- `mode`;
- `goal`;
- `profile_atom`;
- `fact`;
- `preference`;
- `judgment_rule`;
- `voice_rule`;
- `workflow_rule`;
- `exemplar`;
- `anti_pattern`;
- `episode`;
- `source`;
- `observation`;
- `signal`;
- `hypothesis`;
- `agent`;
- `pack`;
- `run`;
- `evaluation`;
- `update_proposal`.

#### Edge types

- `derived_from`;
- `supports`;
- `contradicts`;
- `counterevidence_for`;
- `scoped_to`;
- `active_in_mode`;
- `belongs_to_project`;
- `compiled_into`;
- `retrieved_for`;
- `used_by_run`;
- `corrected_by`;
- `evaluated_by`;
- `updated_by`;
- `supersedes`;
- `depends_on_goal`;
- `connected_to_agent`.

#### Default graph behavior

Do not open with the full graph.

Start from a focused root:

- current task;
- selected profile atom;
- selected run;
- selected mode;
- selected goal.

Expand one or two hops on demand.

Default visible limit:

- 150–300 nodes;
- server-side filtering;
- cluster older evidence;
- lazy expansion;
- saved viewport;
- stable layouts;
- graph layout in a web worker.

#### Node visual semantics

Use shape, icon, border, label, and status—not color alone.

Examples:

- candidate atom: dashed border;
- confirmed atom: solid border;
- contradiction: split marker;
- revoked: strike or muted;
- current-state atom: clock badge;
- locked core: lock badge;
- low confidence: uncertainty indicator;
- high utility: utility marker.

#### Graph interactions

- click → open right inspector;
- double-click → focus and expand;
- keyboard arrows → navigate;
- `/` → search;
- `F` → fit selection;
- `E` → show evidence;
- `R` → show runs using node;
- `C` → compare versions;
- context menu → confirm, edit, rescope, revoke;
- command palette → graph queries.

Node dragging changes only the saved visual layout. It does not change semantic edges.

### 3. Profile Explorer

List/tree representation for precise editing.

Sections:

- Identity, declared;
- Current state;
- Goals and direction;
- Facts;
- Behavior;
- Cognitive collaboration;
- Communication;
- Voice;
- Taste;
- Judgment;
- Workflow;
- Modes;
- Exemplars;
- Anti-patterns;
- Uncertainty and contradictions.

Each atom row shows:

- claim;
- scope;
- mode;
- lifecycle;
- epistemic class;
- confidence;
- utility;
- evidence count;
- last reinforced;
- last retrieved;
- outcome history.

Actions:

- inspect;
- confirm;
- edit wording;
- narrow or expand scope;
- set temporal horizon;
- attach counterevidence;
- mark temporary;
- revoke;
- compare versions;
- view dependent packs and runs.

All mutations go through versioned engine commands.

### 4. Live Learning

A chronological stream:

```text
source ingested
event normalized
observation extracted
signal reinforced
hypothesis proposed
atom promoted
mode changed
pack compiled
run finished
feedback received
evaluation completed
update proposed/applied
```

Filters:

- agent;
- project;
- run;
- source;
- facet;
- severity;
- status;
- time.

Every event opens lineage.

### 5. Agents

Show connected runtimes and their behavior.

Agent card:

- name;
- runtime;
- provider/model;
- connection type;
- current state;
- current task;
- current pack;
- active mode;
- heartbeat;
- token/cost usage;
- last outcome;
- learning permissions.

Agent detail:

- latest runs;
- packs requested;
- tools called;
- feedback sent;
- profile access policy;
- recurring failures;
- baseline versus guided performance.

Actions:

- inspect current context;
- pause guidance;
- disconnect;
- restrict scopes;
- run a test task;
- start baseline/guided experiment.

### 6. Runs and Trace Viewer

Three-pane trace:

```text
input/task
→ resolved task and mode
→ retrieved candidates
→ exclusions and scores
→ final Meraki Pack
→ agent prompt/tool trace
→ output
→ feedback
→ evaluation
→ update proposal
```

Required comparisons:

- baseline versus guided;
- raw memory versus compiled pack;
- current pack versus prior pack;
- pack with atom versus ablated pack.

The trace must make prompt-context attribution inspectable.

### 7. Evaluation Lab

Capabilities:

- create an experiment;
- select frozen profile snapshot;
- select task suite;
- select baseline/raw-memory/Meraki/ablation arms;
- run or import outputs;
- blind-review candidates;
- collect criterion-level decisions;
- inspect metrics and uncertainty;
- generate proof bundle.

Views:

- experiment table;
- pairwise review;
- retrieval metrics;
- correction-burden trend;
- preference calibration;
- mode confusion matrix;
- ablation results;
- failures and error taxonomy.

### 8. Learning Queue

The user governs what Meraki learns.

Queue item:

- proposed claim;
- evidence;
- alternative explanation;
- proposed scope;
- proposed mode;
- confidence;
- potential impact;
- affected future tasks;
- operation.

Actions:

- approve;
- edit and approve;
- limit to project;
- limit to mode;
- mark temporary;
- reject;
- request more evidence;
- merge with existing atom.

High-impact and identity-level changes always require confirmation.

### 9. Goals

Two distinct concepts are shown:

#### Build goal

Read-only display of the canonical engineering goal during development.

#### User goals

Profile-level goals used by connected agents:

- long-term;
- active objective;
- milestone;
- deadline;
- success criteria;
- constraints;
- current progress;
- supporting projects;
- conflicting goals.

A goal is not completed merely because an agent claims completion. It requires explicit criteria or an objective outcome.

### 10. Sources

- imported sources;
- trust class;
- consent;
- parser/extractor version;
- event count;
- derived atoms;
- last processed;
- deletion impact preview.

Deletion preview must show which atoms, packs, and evaluations will become unsupported.

### 11. Policies and Debug

Expose:

- lifecycle thresholds;
- retrieval weights;
- token budgets;
- sensitivity policies;
- provider versions;
- prompt versions;
- feature flags;
- current contract versions.

Policy editing is disabled by default in the first Studio release. Read-only inspection comes first.

## Read/write boundary

Studio reads projections and issues domain commands.

Allowed writes:

- confirm atom;
- edit atom through a new version;
- rescope;
- revoke;
- approve/reject update proposal;
- add explicit feedback;
- create experiment;
- connect/disconnect agent;
- create/update user goal.

Forbidden:

- direct SQL;
- mutating immutable evidence;
- manually editing pack manifests;
- directly changing evaluation outcomes;
- silently overriding engine policy.

## Studio API additions

```text
GET  /v1/studio/overview
GET  /v1/studio/stream
GET  /v1/graph
GET  /v1/graph/neighbors/:id
GET  /v1/agents
GET  /v1/agents/:id
GET  /v1/runs
GET  /v1/runs/:id/trace
GET  /v1/evaluations
GET  /v1/experiments
POST /v1/experiments
GET  /v1/update-proposals
POST /v1/update-proposals/:id/approve
POST /v1/update-proposals/:id/reject
GET  /v1/goals
POST /v1/goals
PATCH /v1/goals/:id
GET  /v1/sources/:id/impact
```

The stream uses SSE in v0:

```text
event: meraki.event
data: { typed event envelope }
```

## Studio data projections

Do not query raw normalized tables directly from UI handlers.

Create read models:

- `studio_overview_view`;
- `profile_atom_view`;
- `graph_node_view`;
- `graph_edge_view`;
- `agent_status_view`;
- `run_trace_view`;
- `learning_queue_view`;
- `evaluation_summary_view`;
- `goal_progress_view`;
- `source_impact_view`.

These are rebuildable projections, not canonical truth.

## Performance rules

The target machine may be weak.

- lazy-load heavy routes;
- load graph only on the Brain route;
- do not render the full evidence graph;
- virtualize long lists;
- paginate traces and sources;
- stream incremental updates;
- precompute graph projections;
- run layout in a worker;
- retain server-side filtering;
- cache server state;
- avoid Three.js and decorative WebGL;
- disable animated edges by default;
- use reduced-motion preference;
- keep initial Command Center bundle small.

## Accessibility

- graph nodes keyboard-navigable;
- every visual status has text;
- screen-reader labels;
- focus management;
- no color-only meaning;
- reduced motion;
- table/list alternative for graph data;
- command palette accessible without mouse.

## Security

- Studio inherits engine authorization;
- no tenant or subject selected solely from client input;
- sensitive source excerpts are redacted by policy;
- no raw secrets or provider prompts in browser logs;
- mutations require CSRF-safe authenticated commands;
- SSE is authenticated and tenant-scoped;
- audit every profile-changing action.
