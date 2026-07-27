# HTTP API

Start the API with `corepack pnpm dev:api`. It listens on port `3001` unless `PORT` is set and persists to `.meraki/runtime.json` unless `MERAKI_RUNTIME_PATH` is set.

`GET /health` is public. Every `/v1` route requires a signed bearer token whose issuer, audience, and signature match `MERAKI_JWT_ISSUER`, `MERAKI_JWT_AUDIENCE`, and `MERAKI_JWT_SECRET`.

The authoritative route and payload reference is [`api/openapi.yaml`](../api/openapi.yaml). Implemented Fastify routes and OpenAPI operations are compared in CI.

The main local flow is:

1. `POST /v1/corrections`
2. `POST /v1/learning/candidates`
3. `POST /v1/profile/atoms/{id}/commands` with `confirm`
4. `POST /v1/agent/run`

Request identity fields must match the authenticated claims. Reads are filtered to the authenticated tenant and subject.

Routes also enforce least-privilege scopes:

- `profile:read` retrieves guidance, profile state, runs, traces, proposals, and evaluations.
- `evidence:write` records corrections, activities, and outcomes.
- `profile:write` creates candidates and runs governed atom or proposal commands.
- `evaluation:write` records evaluator verdicts.

The controlled comparison route requires all four because it exercises the complete learning and evaluation flow. Missing scopes return `403 insufficient_scope`; missing or invalid bearer tokens return `401`.
