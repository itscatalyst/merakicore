# Meraki Core + Studio — Persistent Build Goal

Build an installable Meraki Core and Meraki Studio in which a connected AI agent continuously learns from a user's explicit statements, behavior, edits, choices, approvals, rejections, examples, workflows, and outcomes; retrieves the correct understanding for each task and mode; changes its future behavior; and measurably reduces repeated corrections over time.

The finished system must make the agent feel as though it is learning the user rather than merely receiving a longer prompt.

## Required properties

The adaptation must be evidence-backed, contextual, temporal, inspectable, reversible, evaluated, and privacy-preserving. Model output is not user evidence unless the user explicitly acts on it or an objective outcome supports it.

## Engine loop

```text
extract → normalize → observe → form signals → build/update profile graph
→ resolve task and mode → retrieve → compile Meraki Pack → guide agent
→ record run → evaluate → attribute → propose governed update
→ improve the next related run
```

## Studio loop

```text
watch live activity → inspect inference and evidence → confirm/edit/rescope/revoke
→ inspect pack and run → compare controlled outputs → approve update
→ observe changed future behavior
```

## Completion conditions

The goal is complete only when all conditions are demonstrated:

1. A real user correction becomes immutable evidence.
2. Meraki extracts a narrow, defensible lesson.
3. Studio shows its evidence, scope, mode, confidence, and lifecycle.
4. A connected agent receives it only for a relevant task and visibly changes behavior.
5. Blind or objective evaluation records improvement and targeted ablation attributes the change.
6. The user can approve, edit, limit, or revoke the learning in Studio.
7. The next related run improves while an unrelated run remains unaffected.
8. The chain is traceable from output to source evidence.
9. The system survives restart and clean installation.

## Foundation non-goals

Consumer feeds, social networking, billing, hosted enterprise administration, clinical diagnosis, hidden manipulation, automatic model-weight training, autonomous production-code self-rewriting, and claims of recreating a user's consciousness are excluded.

This file and `config/goal.yaml` are the repository-canonical goal contracts. Native Codex goal state mirrors them but does not replace them.
