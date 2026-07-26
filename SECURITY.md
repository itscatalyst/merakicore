# Security

## Reporting

Please report suspected vulnerabilities privately through GitHub's security-advisory flow for `itscatalyst/merakicore`. Do not open a public issue containing exploit details or credentials.

## Supported boundary

The current repository is a local engineering prototype, not an internet-ready hosted service.

- Keep `MERAKI_JWT_SECRET` private and use at least 32 UTF-8 bytes.
- Do not commit `.env`, `.meraki/`, bearer tokens, or real user evidence.
- Do not expose the development API directly to the public internet.
- Treat local JSON storage as single-process and single-writer.

The API fails closed when JWT configuration is missing. Tenant, subject, actor, session, and scopes are derived from signed claims; request bodies cannot grant authority.
