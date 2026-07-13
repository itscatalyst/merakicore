# Immediate Codex sequence

This is the command order to begin implementation now.

## Step 1 — Root reads and creates state

Codex must read:

1. `README.md`
2. `docs/00_TARGET_STATE.md`
3. `docs/02_SYSTEM_ARCHITECTURE.md`
4. `docs/03_EXECUTION_GRAPH.md`
5. `docs/04_AGENT_TEAM_OPERATING_SYSTEM.md`
6. `config/work_packets.yaml`
7. `config/gates.yaml`
8. `prompts/CODEX_ROOT_ORCHESTRATOR.md`

Then create:

```text
ops/orchestration/state.json
ops/orchestration/decision-log.md
ops/orchestration/contract-conflicts.md
ops/proof/
```

## Step 2 — Execute Gate 0

Spawn:

- architect for schemas;
- cheap worker for scaffold;
- infrastructure worker for database foundation;
- test worker for contract drift and migration tests.

Do not spawn Gate 1 workers until:

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm contracts:check
pnpm db:test-migrations
```

all pass and reviewer returns `ACCEPT`.

## Step 3 — Execute Gate 1 as one vertical slice

Spawn five bounded packets:

1. correction ingest;
2. deterministic correction extractor;
3. task-local atom store;
4. minimal guide/pack compiler;
5. end-to-end test.

Integrator merges in this order:

```text
ingest
→ extractor
→ atom
→ guide
→ loop test
```

Gate 1 is the first real milestone. No broad architecture expansion before it passes.

## Step 4 — Expand evidence/profile/retrieval in parallel

Once Gate 1 is accepted:

- Gate 2 evidence and extraction may proceed;
- Gate 3 contracts may be reviewed;
- Gate 4 retrieval fixtures may be prepared;
- Gate 6 eval harness skeleton may be prepared.

Implementation dependencies remain enforced.

## Step 5 — Constant integration

After every accepted packet:

- cherry-pick;
- run targeted tests;
- run previous gate tests;
- update state;
- update decision log;
- create regression fixture for discovered failures.

## Step 6 — Freeze and dogfood

After Gate 6:

- freeze profile snapshot;
- import real evidence;
- label expected modes and atoms;
- create held-out tasks;
- prohibit tuning on held-out results;
- run baseline/raw-memory/Meraki/ablation arms.

## Step 7 — Release only with proof

A release commit requires:

- gate manifests;
- test output;
- proof bundle;
- limitations;
- clean install;
- reviewer `ACCEPT`.

## Studio sequence

After Core Gate 0 is accepted, Codex may execute Studio S0.

After Core Gate 1 is accepted, execute Studio S1 immediately so the first end-to-end learning loop is visible.

Do not begin the full Brain Graph before Core Gate 3 contracts are frozen. The graph must visualize real typed profile atoms and edges, not placeholder psychology.

The root orchestrator must report two parallel states:

```json
{
  "core_gate": "G1",
  "studio_gate": "S1",
  "goal_progress": [],
  "behavior_change_proofs": []
}
```
