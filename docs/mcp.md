# MCP adapter

Meraki Core exposes a local stdio MCP server. It is designed for one trusted user and one writer process at a time.

## One-command Windows setup

From the repository root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-mcp.ps1
```

The setup:

- verifies Node.js 22+ and installs the locked workspace;
- creates a private `.meraki/mcp.env` identity file ignored by Git;
- builds the MCP server;
- registers Meraki at user scope in Claude Code when `claude` is installed;
- registers Meraki globally in Codex when `codex` is installed.

The launcher creates a fresh short-lived bearer token every time an MCP client starts it. No expiring token is stored in either tool's configuration.

Restart Claude Code or Codex after setup, then confirm that the `meraki_*` tools are visible. The default local identity is tenant `local`, subject `builder`, and actor `builder`. Override those values during setup when needed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-mcp.ps1 `
  -TenantId local `
  -SubjectId pratham `
  -ActorId pratham
```

Use `-SkipClaude` or `-SkipCodex` to register only one client.

## Manual local host

After `.meraki/mcp.env` exists, start the reusable launcher with:

```bash
corepack pnpm mcp:local
```

For lower-level development with an externally supplied bearer token, the original command remains available:

```bash
corepack pnpm dev:mcp
```

`dev:mcp` requires the normal JWT environment plus `MERAKI_MCP_TOKEN`. The token is verified before the server starts.

## Stable tools

- `meraki_get_guidance`
- `meraki_get_examples`
- `meraki_explain_guidance`
- `meraki_record_feedback`
- `meraki_record_outcome`

The adapter retrieves scoped guidance and records explicit evidence or outcomes. It cannot directly activate, rewrite, or delete profile rules. Governance remains behind authenticated API commands.

Guidance, example, and explanation tools require `profile:read`. Feedback and outcome tools require `evidence:write`. Calls without the required scope return a deterministic `insufficient_scope` MCP error and do not mutate the runtime.

## Operating boundary

The MCP and API adapters can use the same `MERAKI_RUNTIME_PATH`, but the local JSON adapter supports only one writer process at a time. Do not run Studio/API and an MCP client against the same snapshot simultaneously. Close one process before opening the other, and restart the MCP client after Studio changes so it reloads the snapshot.

This local host is the correct dogfood path for the current engine. A remote multi-device MCP endpoint requires durable multi-writer storage and a Streamable HTTP transport; it should not be simulated with ephemeral serverless JSON files.
