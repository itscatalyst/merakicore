# Fresh-agent reset protocol

Use this protocol for every implementation packet and every gate review. A role name may persist; an agent context may not.

## Before assignment

1. Confirm the previous context has stopped and has no pending command or uncommitted ownership of shared files.
2. Create a fresh agent context with only the approved task packet, canonical goal references, current gate state, relevant contracts/ADRs, fixtures, and explicit allowlist.
3. Record the new context ID against the packet in orchestration state. Never copy an implementer's conversation into an independent reviewer context.
4. Require the agent to read `GOAL.md`, `config/goal.yaml`, its task packet, and every packet input before mutation.
5. Confirm dependencies are accepted, files do not overlap active packets, and the packet has executable acceptance commands.

## During execution

- The allowlist is absolute: discovery outside it is read-only; mutation outside it stops the packet.
- Contract conflict, missing authority, security-invariant failure, or scope expansion stops work and creates an orchestration decision.
- The worker reports commands, exit codes, artifacts, hashes, regressions, and unresolved risks. Prose completion is not evidence.
- A context handles one packet. Follow-up repairs require a new bounded patch packet unless the original packet remains actively under review.

## Handoff and retirement

1. Capture changed files, commit, commands, proof artifacts, and unresolved items in the task packet handoff.
2. Verify the shared worktree has no unexpected edits owned by the retiring context.
3. Stop the context. Do not reuse it for integration, review, another packet, or a later gate.
4. The integrator independently verifies the handoff before adding it to a gate branch.

## Independent review reset

- Spawn a new reviewer context only after gate proof is frozen.
- Give it the goal, gate contract, proof manifest, diff/commits, test output, and reviewer template; omit implementation reasoning and advocacy.
- The reviewer inspects evidence and returns `ACCEPT`, `REVISE`, or `BLOCK`. It never repairs code.
- `ACCEPT` is invalid when required proof was not inspected, the reviewer shared an implementation context, or `implementation_repaired_by_reviewer` is true.

## Emergency reset

If an agent hangs, crosses its allowlist, or retains stale assumptions: stop it, inventory its filesystem changes without deleting them, mark its packet blocked, and create a fresh recovery packet that explicitly accepts or rejects each inherited change.
