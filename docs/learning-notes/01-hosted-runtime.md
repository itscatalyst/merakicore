# Gate A1 learning note: the hosted runtime

Meraki's hosted layer is an adapter, not a second brain. A request enters a
Next.js Node Route Handler, where origin, body, content type, and request IDs
are checked. Authentication derives tenant, subject, actor, and scopes from
the bearer credential. The adapter then calls the shared application service.

The application service is the only place that knows how evidence, profile
atoms, guidance, runs, proposals, and evaluations change. The hosted process
does not keep that state in module globals. It opens a request-scoped database
client, reads or locks the subject snapshot, runs the command, and closes the
client before returning.

Postgres is the durable boundary. A process restart therefore reconstructs the
same runtime from the stored canonical snapshot. Every successful mutation
publishes a new revision and snapshot hash. An optimistic revision check stops
two writers from silently overwriting each other. An idempotency key lets a
retry replay the committed receipt instead of executing the command twice.

Authentication answers “who presented this credential?” Authorisation answers
“is that identity allowed to perform this operation?” Meraki derives both
identity and permissions from the authenticated record; request JSON cannot
select another tenant or subject.

The Studio shell is intentionally inert. It has no private data until its
bearer-authenticated API request succeeds. Responses are `no-store`, origins
are exact matches, and a per-response CSP nonce binds the inline Studio blocks.
The hosted UI can inspect evidence summaries, lineage, proposals, runs, and
evaluations, but it cannot approve, rescope, or revoke knowledge without an
explicit reason and a versioned command.

Self-check before claiming this gate:

- What state belongs to the adapter, and what state belongs to the application?
- What survives if the Node process is killed halfway through a request?
- Why are a revision and an idempotency key different protections?
- Why is a valid token not enough to authorise a cross-subject read?
- Which data does the Studio intentionally omit from its bounded evidence view?
