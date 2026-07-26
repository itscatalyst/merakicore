# MCP adapter

Start the newline-delimited stdio server with:

```bash
corepack pnpm dev:mcp
```

It requires the normal JWT environment plus `MERAKI_MCP_TOKEN`. The token is verified before the server starts.

The stable tool names are:

- `meraki_get_guidance`
- `meraki_get_examples`
- `meraki_explain_guidance`
- `meraki_record_feedback`
- `meraki_record_outcome`

The adapter can retrieve scoped guidance and record evidence or outcomes. It cannot directly activate, rewrite, or delete profile rules. Governance remains behind authenticated API commands.

The MCP and API adapters can use the same `MERAKI_RUNTIME_PATH`, but the local JSON adapter supports only one writer at a time. Restart an MCP process to load changes written by a separate API process.
