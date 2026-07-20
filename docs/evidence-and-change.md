# Evidence and change

Meraki only makes sense if we can answer: **why did this rule exist?**

## Evidence we can use

The current system distinguishes explicit instructions, corrections, edits, explained choices, approvals, rejections, workflow actions, and objective outcomes. Each source keeps provenance and a trust class.

Model output is not user evidence just because a model wrote it. Suspected prompt injection remains stored for audit but cannot automatically become a profile rule.

## From evidence to a rule

Evidence can support an observation. Observations can support a signal. Signals can support a falsifiable hypothesis. A hypothesis may become a candidate profile atom.

Those stages are separate on purpose. A source record says what happened. A profile atom says how future work might change.

Every atom includes scope, mode, confidence, lifecycle, supporting evidence, counterevidence, sensitivity, and version information. The original evidence remains immutable.

## What cannot happen

- A client cannot choose its own tenant or subject authority.
- An agent cannot write arbitrary profile state through MCP.
- A candidate cannot affect a guidance pack before approval.
- A provider response cannot partially commit malformed state.
- A revoked or out-of-scope atom cannot enter a pack.

For the canonical fields, read [contracts.md](contracts.md). For security and lifecycle decisions, read [architecture.md](architecture.md) and the ADRs under `docs/adr/`.
