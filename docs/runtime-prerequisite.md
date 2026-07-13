# Gate 0 runtime prerequisite

Gate 0 requires behavioral PostgreSQL evidence. Static SQL assertions and skipped integration tests do not satisfy the gate.

The supported local path is WSL2 Ubuntu 24.04 with PGDG PostgreSQL 16 and `postgresql-16-pgvector`. PGlite and native SQLite are not substitutes because the tests must prove PostgreSQL roles, forced RLS, independent-connection idempotency, `vector`, and `pgcrypto` semantics.

From PowerShell, inspect first:

```powershell
./scripts/bootstrap/install-wsl-postgres.ps1
```

After confirming the Windows/admin prompt and completing any requested reboot or first-launch Linux-user setup, install:

```powershell
./scripts/bootstrap/install-wsl-postgres.ps1 -Install
```

Then point the test runner at a disposable database and run:

```powershell
$env:DATABASE_URL = "postgresql://postgres:<password>@localhost:5432/meraki_gate0"
corepack pnpm db:test-live
corepack pnpm ci:gate0
```

The live suite is destructive by design: it applies, rolls back, reapplies, races two connections against the same idempotency key, and verifies same-scope access plus cross-tenant and cross-subject denial. Do not use a production database.
