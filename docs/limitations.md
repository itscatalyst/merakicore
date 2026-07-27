# Limitations

Meraki Core is a local engineering prototype.

- JSON persistence is atomic but single-process. It has no locking or multi-writer coordination.
- JWT verification uses a configured symmetric development secret. Production identity-provider discovery and key rotation are not included.
- MCP has no remote transport or OAuth handshake.
- Evaluation proves deterministic fixture behavior, not independent human preference improvement.
- Candidate claims are supplied by an authenticated caller; broad autonomous extraction is not supported.
- Local durability rewrites the whole JSON snapshot after each successful mutation, so unusually large synthetic snapshots make writes slow.
- Studio is a local, single-subject observability and governance surface, not a production or multi-user application. There is no hosted database, deployment package, backup service, billing, or team administration.

These omissions are deliberate. A capability returns only with a working user flow, explicit failure behavior, and tests that demonstrate its boundary.
