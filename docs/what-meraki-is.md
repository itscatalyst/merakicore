# What Meraki is

Meraki is a continuous learning layer for AI.

The job is simple to say: when you correct an agent, the next relevant result should be better.

The hard part is making "better" honest. Meraki must retain the source correction, propose a narrow change, apply it only where it belongs, compare the result, and let you undo the change.

## Product and engine

[Meraki](https://meraki.itscatalyst.com) is the product people see. It collects explicit corrections, choices, and outcomes and gives people a place to inspect what may change.

Meraki Core is this repository. It stores evidence, versions profile rules, retrieves relevant guidance, records agent runs, evaluates changes, and controls approval or rollback.

[Catalyst](https://itscatalyst.com) is the independent lab behind both.

## What Meraki is not

It is not a model that retrains itself after every message. It is not a bag of chat history. It is not an unrestricted memory-writing tool for an agent.

Meraki keeps evidence, interpretations, and applied changes separate. That costs more work. We think it is necessary if people are going to trust the result.

## Current boundary

This is still early. The deterministic local loop is covered by tests. Independent human evaluation, the hosted invited-user flow, and final live PostgreSQL proof are still open.

For the technical shape, read [architecture.md](architecture.md). For the evidence record, read [completion-audit.md](completion-audit.md).
