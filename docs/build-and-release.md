# Build and release guide

## Supported toolchain

- Node.js 22 (the package allows `>=22 <25`)
- pnpm 10.15.1 through Corepack
- Python 3.12 with PyYAML 6.0.2 and jsonschema 4.23.0 for validators
- PostgreSQL 16 with pgvector for the live Gate 0 checks

## Reproducible local build

```bash
corepack enable
corepack prepare pnpm@10.15.1 --activate
corepack pnpm install --frozen-lockfile
corepack pnpm install:verify
```

`install:verify` repeats the frozen install, builds every workspace that has a build script, and typechecks the workspace. Run the complete static suite before review:

```bash
corepack pnpm ci:static
corepack pnpm contracts:check
```

## Run the local API safely

The current executable uses one server-bound tenant, subject, actor, and session. Identity headers select that already-authenticated context; they are not credentials. Set a high-entropy bearer token as well as the context:

```bash
export MERAKI_TENANT_ID=tenant-a
export MERAKI_SUBJECT_ID=user-a
export MERAKI_ACTOR_ID=user-a
export MERAKI_SESSION_ID=local-session
export MERAKI_API_TOKEN="$(openssl rand -hex 32)"
corepack pnpm dev:api
```

Every request must send `Authorization: Bearer <MERAKI_API_TOKEN>`, `X-Meraki-Tenant-Id`, and `X-Meraki-Subject-Id`. Do not expose the development server directly to the public internet. TLS termination, credential rotation, rate limits, and multi-principal identity-provider integration remain deployment responsibilities.

## Build flow

```mermaid
flowchart TD
  C[Canonical schemas + execution graph] --> V[Contract and orchestration validation]
  L[Lockfile] --> I[Frozen dependency install]
  I --> B[Workspace build]
  V --> T[Typecheck + lint + format]
  B --> T
  T --> U[Unit and connected-runtime tests]
  U --> D[Live PostgreSQL destructive tests]
  D --> M[Integrity-addressed proof manifest]
  M --> R[Independent reviewer]
  R -->|ACCEPT only| A[Gate accepted]
```

## Live Gate 0

Start the disposable database from `infra/docker-compose.yml`, set `DATABASE_URL`, and run:

```bash
docker compose -f infra/docker-compose.yml up -d --wait
export DATABASE_URL=postgresql://meraki:meraki_local@127.0.0.1:5432/meraki
corepack pnpm ci:gate0
```

This gate is destructive. Never point it at production or at a database containing real user data. A passing command is evidence for review; it does not self-accept the gate. An independent reviewer must issue `ACCEPT` and the proof manifest must reference immutable command output.

## Release checklist

1. Working tree is clean and generated contracts match their JSON Schemas.
2. `ci:static` and `contracts:check` pass from the frozen lockfile.
3. The live database gate passes against the target database class.
4. Proof output is captured and its digest verifies.
5. An independent reviewer records `ACCEPT`.
6. No real dogfood data is used before the dogfood-security checkpoint is accepted.
