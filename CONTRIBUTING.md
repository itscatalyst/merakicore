# Contributing

Meraki Core is early. Small changes with a complete behavioral proof are more useful than new scaffolding.

1. Create a short-lived branch from `main`.
2. Keep applications dependent on packages; never make one application import another.
3. Add or update tests for every behavior change.
4. Run `corepack pnpm ci`.
5. Open a pull request that states what changed, why, the user impact, and the checks run.

Do not commit user data, runtime state, generated build output, internal agent execution plans, or claims that are not demonstrated by tests.

Generated contract types come from `schemas/meraki.schema.json`. Run `corepack pnpm contracts:generate` after changing the schema.
