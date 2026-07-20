# How the loop works

Here is one correction moving through Meraki.

## 1. Record

The user says, "Do not call this seamless. Explain the actual workflow."

Meraki stores that correction as immutable evidence. The source, actor, time, consent, and relevant text span stay attached.

## 2. Propose

The engine may propose a rule: "For Catalyst product copy, replace vague benefit words with the concrete action the product performs."

The proposal has a scope, confidence, supporting evidence, and lifecycle state. It is not active yet.

## 3. Approve

A user or an explicit policy can approve, edit, limit, or reject the proposal. Approval creates a new profile version. It does not rewrite the old one.

## 4. Retrieve

On a later matching writing task, Core selects eligible rules and compiles a deterministic `MerakiPack`. An unrelated coding task should not receive the copywriting rule.

## 5. Run and compare

The connected agent runs with the pack. Meraki records which rules were included, the pack hash, the output, and the result.

The evaluation layer can compare the baseline, equal-budget raw memory, the Meraki pack, and a version with the target rule removed.

## 6. Keep or undo

If the rule helped the matching task and did not affect the control task, it may be reinforced. If it failed, it can be weakened, narrowed, replaced, expired, or revoked.

Nothing disappears from history. Rollback creates a traceable restoring version.

The detailed data flow is in [architecture.md](architecture.md). Wire shapes and safety fields are in [contracts.md](contracts.md).
