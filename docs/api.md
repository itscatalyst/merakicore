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
