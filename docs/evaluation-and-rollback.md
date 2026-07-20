# Evaluation and rollback

Changing an answer is easy. Showing that one specific rule caused a useful change is harder.

## The comparison

Meraki can run four versions of the same task:

1. **Baseline:** no Meraki guidance.
2. **Raw memory:** the same context budget filled with unprocessed memory.
3. **Meraki:** the scoped, compiled guidance pack.
4. **Targeted removal:** the Meraki pack with one tested rule removed.

The fourth arm matters. If removing one rule removes the improvement, there is better evidence that the rule mattered. An unrelated control task checks for leakage.

## The record

Each run can retain its task-context digest, included and excluded candidates, pack hash, applied atom versions, source evidence IDs, output, evaluator class, criteria, uncertainty, and result.

Objective outcomes outrank weak model judgments. Independent human-blind review is still open work.

## Rollback

Profile rules are versioned. A user can edit, rescope, weaken, split, supersede, expire, or revoke a rule. Restoring earlier behavior creates another version that points back through the same evidence chain.

Rollback does not delete the fact that a change happened. Source deletion is a separate lineage-aware process with an impact preview and content-free audit tombstones.

The implemented proof and remaining gaps are listed in [completion-audit.md](completion-audit.md).
