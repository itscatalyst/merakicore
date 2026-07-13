# Meraki Core + Studio installation

Meraki is a pnpm workspace. Node 22+ and Corepack are required.

```powershell
cd C:\Users\Rakesh\Desktop\Pratham\execution\projects\meraki-core
corepack pnpm install --frozen-lockfile
corepack pnpm install:verify
```

The connected API can be started without a database for the adapter-level
learning flow:

```powershell
corepack pnpm dev:api
```

It exposes `/v1/corrections`, `/v1/learning`, and `/v1/agent/run`. Studio is a
static Vite build:

```powershell
corepack pnpm build:studio
```

For the production persistence gate, start PostgreSQL 16 with pgvector using
`infra/docker-compose.yml` or the supported WSL bootstrap in
`docs/runtime-prerequisite.md`, set `DATABASE_URL`, and run `corepack pnpm
ci:gate0`. The adapter-level API must not be mistaken for the live RLS proof.
