# Meraki Core

**Meraki is a continuous learning layer for AI.**

**Every correction should improve the next result.**

That sounds obvious. It is not how most AI software works today.

You correct an answer. The chat moves on. A week later, the same mistake comes back.
Meraki Core is the engine we are building to close that loop.

It records what happened, proposes a small rule, tests whether that rule helped, and keeps a history of every change. A person or an explicit policy decides whether the change is used. It can be inspected, limited, or rolled back later.

This is still early. The local engine works. The hosted system and its PostgreSQL proof are not finished yet. See [What works today](#what-works-today) for the honest boundary.

## The short version

Imagine an agent writes:

> Our platform empowers teams with seamless AI workflows.

You reply:

> Too vague. Say what the product actually does. Do not use "empowers" or "seamless."

Meraki should not save that whole conversation as a mysterious blob and claim it learned your taste.

It should be able to show:

1. **What it saw:** your correction, stored as immutable evidence with its source.
2. **What it proposed:** a narrow writing rule for the relevant project and task.
3. **What changed:** the next matching agent run received that rule in its guidance pack.
4. **How it was tested:** the new result was compared with a baseline and with the rule removed.
5. **How to undo it:** revoke the rule or restore an earlier profile version.

If we cannot show those five things, we do not say the agent learned.

## What this repository is

Meraki Core is the engine behind the user-facing [Meraki](https://meraki.itscatalyst.com) product. It is built by [Catalyst](https://itscatalyst.com), an independent AI product and research lab.

The repository contains:

- **Core packages** for evidence, profiles, retrieval, guidance, evaluation, and controlled updates.
- **An API** for recording corrections, running connected agents, reviewing proposals, and reading traces.
- **An MCP server** that lets compatible agents request guidance and report feedback without receiving direct write access to the profile.
- **Meraki Studio**, a control surface for seeing evidence, proposed changes, run traces, evaluations, and rollback actions.
- **Database and security foundations** for tenant isolation, consent, audit, deletion, and durable PostgreSQL storage.

It does not contain the public Meraki landing page. It is also not a general-purpose model or an agent framework.

## The loop

```text
correction or outcome
        |
        v
immutable evidence
        |
        v
narrow proposed rule  -- nothing changes yet
        |
        v
review or policy approval
        |
        v
task-specific guidance for a later run
        |
        v
baseline + comparison + targeted removal
        |
        v
keep, weaken, rescope, replace, or roll back
```

Here is the part that matters: Meraki separates **evidence**, **interpretation**, and **action**.

A correction is evidence. A possible rule is an interpretation. Applying that rule to future work is an action. Treating all three as one automatic step would make the system hard to trust and hard to repair.

## What changes, exactly?

Meraki compiles a small, deterministic `MerakiPack` for a specific task. The pack contains only eligible guidance for the current subject, project, mode, permissions, and token budget.

For unchanged state and the same task context, the pack hash must stay the same. A new correction does not silently rewrite old evidence. It creates a new candidate or profile version with links back to the source.

Possible governed changes include:

- reinforce or weaken a rule;
- narrow or widen its scope;
- split an over-broad rule;
- replace it with a better version;
- expire or revoke it;
- restore an earlier state through another traceable version.

The agent never gets a tool that says "write anything into memory." It can request relevant guidance and return outcomes. Core owns the rules for what may change.

## How a change is evaluated

We are trying to solve a causal question, not a demo question: **did this exact guidance improve the relevant result without leaking into unrelated work?**

The evaluation layer can compare four arms:

| Arm | What it receives | Why it exists |
| --- | --- | --- |
| Baseline | no Meraki guidance | shows the old behavior |
| Raw memory | equal-budget unprocessed context | checks whether retrieval and scoping add value |
| Meraki | the compiled guidance pack | measures the proposed behavior |
| Targeted removal | the same pack without one rule | tests whether that rule caused the difference |

An improvement is not enough on its own. The unrelated control task should remain unchanged. The run trace records the task context, included and excluded rules, pack hash, source evidence, output, evaluation, and attribution.

We do not know if this works at useful scale yet. The repository has deterministic and connected-runtime tests for the loop. Independent human evaluation and the final live PostgreSQL proof are still open.

## What works today

The current codebase has local proof for:

- correction and activity intake as immutable evidence;
- evidence-backed candidate rules that do not affect behavior before approval;
- project- and mode-scoped retrieval;
- deterministic guidance packs;
- connected API and MCP runs;
- baseline, raw-memory, Meraki, and targeted-removal comparisons;
- versioned approve, edit, weaken, split, supersede, revoke, and rollback commands;
- source-to-rule-to-run traces in Studio;
- JSON-backed restart persistence;
- model-output and prompt-injection guards.

The current Gate 0 status is **implementation complete, external proof deferred**. PostgreSQL 16, pgvector, forced row-level security, and multi-connection idempotency still need to pass against a usable live database before that gate can be accepted. The detailed, command-backed record lives in [docs/completion-audit.md](docs/completion-audit.md).

## Repository map

```text
apps/
  api/          REST API and connected runtime
  cli/          command-line client
  mcp/          bounded MCP server
  studio/       inspection and control UI
  worker/       background work
packages/
  evidence/     immutable sources, events, observations, and signals
  profile/      versioned rules, scope, lifecycle, and provenance
  guidance/     retrieval and deterministic pack compilation
  evaluation/   comparisons, verdicts, and attribution
  learning/     proposals and governed updates
  db/           migrations, roles, RLS, and persistence helpers
  contracts/    generated types from canonical JSON Schemas
schemas/        canonical wire contracts
config/         build goal, gates, and execution graph
ops/            gate state, decisions, reviews, and proof manifests
docs/           public guides plus detailed technical notes
```

`GOAL.md` is the durable build contract. `config/execution_graph.yaml` is the only hand-maintained execution graph. JSON Schemas under `schemas/` are the wire-contract authority.

## Read the docs

Start with the short pages:

- [What Meraki is](docs/what-meraki-is.md)
- [How the loop works](docs/how-it-works.md)
- [Evidence and change](docs/evidence-and-change.md)
- [Evaluation and rollback](docs/evaluation-and-rollback.md)
- [FAQ](docs/faq.md)

Then use the detailed references when you need them:

- [Architecture](docs/architecture.md)
- [Contract matrix](docs/contracts.md)
- [Installation](docs/install.md)
- [Runtime prerequisite](docs/runtime-prerequisite.md)
- [Completion audit](docs/completion-audit.md)

## Run locally

You need Node.js 22, pnpm 10 through Corepack, Python 3 for contract and orchestration checks, and Git.

```powershell
git clone https://github.com/itscatalyst/merakicore.git
cd merakicore
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm install:verify
```

Run the adapter-backed API without PostgreSQL:

```powershell
corepack pnpm dev:api
```

Build Studio:

```powershell
corepack pnpm build:studio
```

Run the normal local checks:

```powershell
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

For the live database gate, use a disposable PostgreSQL 16 database with pgvector. Follow [docs/runtime-prerequisite.md](docs/runtime-prerequisite.md), set `DATABASE_URL`, then run:

```powershell
corepack pnpm ci:gate0
```

That suite applies and rolls back migrations and runs destructive isolation checks. Do not point it at a production database.

## Deploy

There is no one-click production deployment yet. That is deliberate.

A real hosted deployment needs:

1. PostgreSQL 16 with `vector` and `pgcrypto`.
2. The migrations under `migrations/`.
3. Restricted application roles from `corepack pnpm db:bootstrap-roles`.
4. A server-only `DATABASE_URL` and the required auth configuration.
5. The API, worker, MCP transport, and Studio built from the same accepted contract state.
6. `corepack pnpm ci:gate0` passing against the target class of database.

The repository includes `infra/docker-compose.yml` for a local database path. Hosted infrastructure is still being completed, so this section will change as the first invited-user deployment becomes reproducible.

## The three-part story

- **[Catalyst](https://itscatalyst.com) asks the question:** can AI systems improve through use without hiding how they changed?
- **[Meraki](https://meraki.itscatalyst.com) is the user-facing layer:** corrections, choices, and outcomes should make later work better.
- **[Meraki Core](https://github.com/itscatalyst/merakicore) is the engine:** it is trying to make that improvement scoped, testable, inspectable, and reversible.

## Writing rules

Write like a builder explaining something they actually care about.

Use short sentences. Name the evidence. Name the change. Name the test. Say what failed. Say what is still early.

Useful phrases are honest ones: "we're trying to solve," "we think," "here's the part that matters," "we don't know if this works yet," and "this failed because."

Avoid inflated claims. In particular: "revolutionary," "state-of-the-art," "seamless," "empowering," "leveraging," "agentic intelligence," "the future of work," and "autonomous."

Do not say an agent learned unless you can state:

- what evidence it saw;
- what changed;
- how the change was evaluated;
- how it can be rolled back.

One real example is better than six polished claims.

## License and contribution status

The repository is public, but the product is still in early construction. Before opening a large pull request, start with an issue that names the behavior, evidence, and test you want to change. The repository license is in [LICENSE](LICENSE) when present; if no license is included on your branch, the default is not permission to reuse the code.
