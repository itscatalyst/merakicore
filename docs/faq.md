# FAQ

## Is Meraki a model?

No. Meraki sits around a model or agent runtime. It manages evidence, scoped guidance, runs, evaluation, and controlled changes.

## Does it train after every message?

No. A correction can create a candidate rule. Candidates do not affect later behavior until they are approved by a person or an explicit policy.

## Is this just memory or RAG?

Memory and retrieval are parts of it. The larger loop includes provenance, scope, deterministic packs, run records, evaluation, attribution, versioning, and rollback.

## What does "continuous learning" mean here?

It means corrections and outcomes can produce proposed changes for later relevant tasks. We only use the word "learning" when we can name the evidence, change, evaluation, and rollback path.

## Can an agent change my profile directly?

No. The MCP surface can request guidance and report feedback or outcomes. Canonical profile changes go through Core's governed commands.

## Can a rule affect every task?

It should not. Rules carry subject, project, task, mode, permission, sensitivity, and lifecycle constraints. Tests include unrelated control tasks to catch leakage.

## Can I undo a bad change?

Yes. Rules are versioned and can be weakened, narrowed, replaced, expired, revoked, or restored through another traceable version.

## What is proven today?

The local deterministic and connected-runtime loop has automated coverage. The hosted invited-user flow, independent human evaluation, and final PostgreSQL 16 plus pgvector proof are not complete. Read [completion-audit.md](completion-audit.md) for exact commands and gaps.

## Where is the product?

The public product site is [meraki.itscatalyst.com](https://meraki.itscatalyst.com). [Catalyst](https://itscatalyst.com) is the lab behind it. This repository is the engine.
