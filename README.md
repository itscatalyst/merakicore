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
- a supported Studio UI;
- automatic extraction from everything a user does;
- proof that the approach works at useful scale.

Those return only after the local correction-to-guidance loop creates repeatable value.

Read [Architecture](docs/architecture.md), [HTTP API](docs/api.md), [MCP](docs/mcp.md), and [Limitations](docs/limitations.md) for the technical boundary.

## License

Apache-2.0. See [LICENSE](LICENSE).
