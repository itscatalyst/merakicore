# Meraki Studio acceptance tests

## Core inspection

- [ ] Select a run and trace it to its exact pack hash.
- [ ] Select a pack item and trace it to atom version and evidence.
- [ ] Select evidence and view the immutable source event.
- [ ] Compare current and prior atom versions.
- [ ] Explain why a candidate was included or excluded.

## Profile control

- [ ] Confirm a candidate atom.
- [ ] Edit an atom by creating a new version.
- [ ] Limit an atom to a project.
- [ ] Limit an atom to a mode.
- [ ] Mark current state temporary.
- [ ] Revoke an atom.
- [ ] Roll back to a previous profile snapshot.
- [ ] See dependent packs and runs before changing an atom.

## Graph correctness

- [ ] Graph nodes map to canonical IDs and versions.
- [ ] Graph edges map to canonical typed relations.
- [ ] Dragging a node changes only layout.
- [ ] Focused expansion does not silently omit conflicts.
- [ ] List fallback exposes the same data.
- [ ] Revoked and unsupported states are visible.
- [ ] Graph remains usable at configured visible-node limit.

## Agent operations

- [ ] Connected agent appears with heartbeat.
- [ ] Current task, mode and pack are visible.
- [ ] Agent can be paused or disconnected.
- [ ] Scope permissions are enforced.
- [ ] Restart preserves run and connection history.
- [ ] Multiple sessions remain distinguishable.

## Evaluation Lab

- [ ] Create frozen experiment.
- [ ] Run baseline, raw-memory, Meraki and ablation arms.
- [ ] Reviewer cannot see arm identity.
- [ ] Capture choice, reason and edits.
- [ ] Show retrieval and output metrics separately.
- [ ] Show sample size and uncertainty.
- [ ] Export a reproducible proof bundle.
- [ ] Include failures, ties and abstentions.

## Learning loop

- [ ] Feedback produces a proposed update.
- [ ] Proposal shows evidence and expected impact.
- [ ] Approve/update changes only relevant future pack.
- [ ] Reject leaves profile unchanged.
- [ ] Unrelated task pack hash remains invariant.
- [ ] Timeline shows the entire update chain.

## Goals

- [ ] Canonical build goal is visible.
- [ ] User goal can include success criteria and constraints.
- [ ] Agent run can link to a goal.
- [ ] Goal progress depends on evidence/outcomes.
- [ ] Agent cannot mark a goal complete without criteria.

## Sources and privacy

- [ ] Source trust and consent are visible.
- [ ] Deletion impact preview lists dependent atoms/packs.
- [ ] Deletion removes eligibility and raw content.
- [ ] Sensitive excerpts obey policy.
- [ ] All mutations are audited.

## Accessibility and performance

- [ ] Critical flows work without a mouse.
- [ ] Graph has accessible list alternative.
- [ ] Reduced motion is respected.
- [ ] Long lists are virtualized.
- [ ] Heavy graph code is route-lazy.
- [ ] Initial Command Center works on the target low-end laptop.
- [ ] No decorative animation blocks interaction.

## Final product proof

A reviewer can watch:

```text
correction
→ learning event
→ proposed atom
→ user approval
→ graph update
→ relevant pack change
→ agent behavior change
→ evaluation
→ utility update
→ improved later run
```

without opening the database or reading server logs.
