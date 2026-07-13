# Meraki Core + Studio — Persistent Build Goal

## Goal

Build an installable Meraki Core and Meraki Studio in which a connected AI agent continuously learns from a user's explicit statements, behavior, edits, choices, approvals, rejections, examples, workflows, and outcomes; retrieves the correct understanding for each task and mode; changes its future behavior; and measurably reduces repeated corrections over time.

The finished system must make the agent feel as though it is learning the user rather than merely receiving a longer prompt.

## Required behavioral result

A connected agent must progressively adapt:

- what it knows about the user;
- what the user wants now;
- what the user likes and hates;
- how the user judges quality;
- how the user communicates;
- how the user thinks through problems;
- how the user prefers to collaborate;
- which mode the user is operating in;
- which workflows and standards apply;
- which errors must not repeat.

This adaptation must be:

- evidence-backed;
- contextual;
- temporal;
- inspectable;
- reversible;
- evaluated;
- privacy-preserving.

## Required engine loop

```text
extract
→ normalize
→ observe
→ form signals
→ build/update profile graph
→ resolve task and mode
→ retrieve
→ compile Meraki Pack
→ guide agent
→ record run
→ evaluate
→ attribute
→ update
→ improve next related run
```

## Required Studio loop

```text
watch live activity
→ inspect what Meraki inferred
→ trace evidence
→ confirm/edit/rescope/revoke
→ inspect agent pack and run
→ compare baseline/guided output
→ approve update
→ observe changed future behavior
```

## Completion condition

The goal is not complete when the repository compiles or when a profile graph renders.

It is complete only when all of the following are demonstrated:

1. A real user correction becomes immutable evidence.
2. Meraki extracts a narrow, defensible lesson.
3. The Studio shows the lesson, evidence, scope, mode, confidence, and lifecycle.
4. A connected agent receives the lesson only for a relevant task.
5. The agent visibly changes communication or execution behavior.
6. A blind or objective evaluation records improvement.
7. A targeted ablation shows the relevant Meraki component caused the change.
8. The user can approve, edit, limit, or revoke the learning in Studio.
9. The next related run improves.
10. An unrelated run remains unaffected.
11. The entire chain is traceable from output back to source evidence.
12. The system survives restart and clean installation.

## Non-goals for the foundation build

- consumer discovery feed;
- social network;
- billing;
- hosted enterprise administration;
- clinical psychological diagnosis;
- hidden manipulation;
- automatic model-weight training;
- autonomous production-code self-rewriting;
- claiming to recreate the user's consciousness.

## Codex Goal feature instruction

When the Codex runtime exposes a native Goal feature, create a goal using this document verbatim as the durable goal contract.

Do not rely only on the native UI state. Keep this file and `config/goal.yaml` canonical inside the repository so every spawned agent receives the same goal and completion conditions.
