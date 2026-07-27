# Meraki Core

Meraki Core is a local-first learning engine for AI agents.

It turns an explicit correction into immutable evidence, proposes a narrow rule, waits for approval, and returns that rule only when a later task matches its subject, project, task type, and mode.

This repository is early. The local engine, HTTP adapter, and MCP adapter work. It is not a hosted service, a model-training system, or an autonomous memory that silently rewrites itself.

## One concrete example

An agent writes a vague email subject. You correct it:

> Use a concise, concrete subject line.

Meraki records that correction without changing future behavior. It proposes a scoped candidate. After approval, a matching email task receives the rule. A creative-writing task does not. The evidence, rule version, pack hash, and decision remain inspectable.

Run that complete flow:

```bash
git clone https://github.com/itscatalyst/merakicore.git
cd merakicore
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm example:quickstart
```

The example proves:

- a candidate is inactive before approval;
- approved guidance changes a related run;
- unrelated work stays at baseline;
- local state survives restart.

## Run the adapters

Copy `.env.example` values into your shell, then generate a local bearer token:

```bash
corepack pnpm dev:token
```

Set the printed value as `MERAKI_MCP_TOKEN` for MCP clients or send it as `Authorization: Bearer <token>` to the API.

```bash
corepack pnpm dev:api
corepack pnpm dev:mcp
```

Both adapters use `.meraki/runtime.json` by default. Do not run multiple writers against the same local file.

## Inspect a synthetic workload in Studio

The generator creates active correction-derived guidance, governed candidates, update proposals,
agent runs, varied generated outcomes, and retained prompt-injection audit events. Every activity
and outcome cites the actual run trace that produced it. It also creates
same-tenant/other-subject and other-tenant/same-subject records so the API filter can be checked
rather than assumed.

Its evaluation records are synthetic, illustrative UI/load fixtures. Their verdicts come from
generated outcome fields such as completion, score, latency, and attempts. Evaluator-class variety
exists only to exercise Studio rendering and precedence behavior; it is not human/model evaluation
evidence, and a `win` does not prove Meraki improved the output. Summary counts therefore say
`guidance_applied_runs`, not “improved runs,” and every synthetic evaluation reason begins with
`synthetic:`.

First export the three JWT settings from `.env.example`; `.env` files are not loaded automatically.
Then run the generator and create a token in the **same shell**:

```bash
# bash
export MERAKI_JWT_SECRET=replace-with-at-least-32-utf8-bytes
export MERAKI_JWT_ISSUER=https://auth.meraki.local
export MERAKI_JWT_AUDIENCE=meraki-core
corepack pnpm demo:synthetic 1000
corepack pnpm dev:token
export MERAKI_RUNTIME_PATH=.meraki/synthetic-runtime.json
corepack pnpm dev:api
```

```powershell
# PowerShell
$env:MERAKI_JWT_SECRET = "replace-with-at-least-32-utf8-bytes"
$env:MERAKI_JWT_ISSUER = "https://auth.meraki.local"
$env:MERAKI_JWT_AUDIENCE = "meraki-core"
corepack pnpm demo:synthetic 1000
corepack pnpm dev:token
$env:MERAKI_RUNTIME_PATH = ".meraki/synthetic-runtime.json"
corepack pnpm dev:api
```

Open `http://localhost:3001/dashboard` and paste the printed token. With no identity overrides,
both the generator and token use tenant `local`, subject `builder`, and actor `builder`. The
generator summary separates total records from the records visible to that dashboard identity.
If you set `MERAKI_TENANT_ID`, `MERAKI_SUBJECT_ID`, or `MERAKI_ACTOR_ID`, set them before both
generation and token creation.

The snapshot is written to `.meraki/synthetic-runtime.json`. `MERAKI_SYNTHETIC_OUTPUT` chooses a
different path, while `MERAKI_SYNTHETIC_SEED` changes the deterministic workload mix. The same
count and seed produce the same `logical_workload_sha256` and aggregate mix. Snapshot bytes still
differ because audit records intentionally receive new UUIDs and timestamps. Generation fails if
a flagged injection enters the observation/learning pipeline, a negative-control event creates
learning, any workload event disagrees with its run scope or mode, or the snapshot cannot survive a
load-from-disk round trip.

## Repository map

```text
apps/
  api/             authenticated HTTP adapter
  mcp/             bounded MCP adapter
packages/
  core/            evidence, profile, guidance, learning, evaluation, runtime
  contracts/       generated wire types
  auth/            signed JWT authority
  storage-local/   atomic local JSON persistence
schemas/           canonical wire contracts
examples/          executable correction-to-guidance walkthrough
```

The dependency direction is deliberate: applications depend on packages. MCP does not import API internals.

## Verify

```bash
corepack pnpm verify
```

This builds and typechecks the clean workspace, checks formatting and lint, runs unit and integration tests, verifies schema/OpenAPI drift, and executes the quickstart.

## Honest boundary

Meraki Core does not currently provide:

- hosted or multi-process persistence;
- PostgreSQL, teams, billing, or public signup;
- a production identity provider;
- a production or multi-user Studio;
- automatic extraction from everything a user does;
- proof that the approach works at useful scale.

Those return only after the local correction-to-guidance loop creates repeatable value.

Read [Architecture](docs/architecture.md), [HTTP API](docs/api.md), [MCP](docs/mcp.md), and [Limitations](docs/limitations.md) for the technical boundary.

## License

Apache-2.0. See [LICENSE](LICENSE).
