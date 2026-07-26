# Meraki Core + Studio installation

Meraki is a pnpm workspace. Node 22 (`>=22 <25`) and pnpm 10 are required; `.nvmrc`
pins the Node version.

```bash
git clone https://github.com/itscatalyst/merakicore.git
cd merakicore
corepack enable && corepack prepare pnpm@10.15.1 --activate  # or: npm install -g pnpm@10.15.1
pnpm install --frozen-lockfile
pnpm install:verify
```

The connected API can be started without a database for the adapter-level
learning flow:

```bash
pnpm dev:api
```

The API fails closed outside tests unless `MERAKI_API_TOKEN` is at least 32
characters. Configure it together with `MERAKI_TENANT_ID`, `MERAKI_SUBJECT_ID`,
`MERAKI_ACTOR_ID`, and `MERAKI_SESSION_ID`; callers send the token as a Bearer
credential. See [Build and release](build-and-release.md) for a complete example.

It exposes `/v1/corrections`, `/v1/learning`, and `/v1/agent/run`. Studio is a
static Vite build:

```bash
pnpm build:studio
```

Before committing, run the static gate:

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test
```

For the production persistence gate, start PostgreSQL 16 with pgvector using
`infra/docker-compose.yml` or the supported WSL bootstrap in
`docs/runtime-prerequisite.md`, set `DATABASE_URL`, and run `pnpm ci:gate0`
(the Python validators need `PyYAML` and `jsonschema`). The adapter-level API
must not be mistaken for the live RLS proof.
