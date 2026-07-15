# Meraki objective evidence audit

This is a living audit of the persistent build goal. It distinguishes executable
evidence from design intent and does not treat skipped live tests as proof.

## Gate 0 external-proof deferral

Gate 0 status is `IMPLEMENTATION_COMPLETE_EXTERNAL_PROOF_DEFERRED`, not
`ACCEPT`. The WSL CLI is healthy but no usable Ubuntu distribution is registered:
the web-download and Store-backed commands did not leave a runnable distribution,
the root probe returned `Wsl/Service/WSL_E_DISTRO_NOT_FOUND`, and bounded discovery
found no `.wsl` package or checksum under `C:\\Users\\Rakesh`. Exact command evidence
is in `C:\\Users\\Rakesh\\Desktop\\wsl-recovery.log` and the deferred requirements are
listed in `ops/orchestration/deferred-proof.yaml`.

| Requirement | Current evidence | Status |
|---|---|---|
| Immutable evidence stage separation | `packages/evidence/src/index.ts`, `packages/evidence/src/index.test.ts` | Proven at deterministic adapter level: SourceRecord → Event → Observation → Signal → Hypothesis; duplicate protection, consent gate, and evidence spans |
| Explicit activity and outcome normalization | `packages/evidence/src/index.test.ts`, `LearningEngine.recordActivity()`, `LearningEngine.extractActivityLesson()`, API activity-candidate test | Proven at deterministic adapter level: approvals, rejections, choices, corrections, edits, examples, workflow actions, and objective outcomes remain immutable source/event records; connected ingestion deterministically materializes a direct/deterministic observation and can create a cited scoped candidate only through the governed extraction path. It never silently activates a profile atom. |
| Connected activity/outcome ingestion | `POST /v1/activity`, `POST /v1/outcomes`, `apps/api/src/runtime.test.ts` | Proven at connected in-memory runtime level: explicit activities preserve `explicit_user` trust and objective outcomes preserve `objective_outcome` trust while returning immutable source/event lineage |
| Model output is not user evidence | `EvidenceLedger.ingestModelOutput()` / `observeCorrection()` test | Proven at deterministic adapter level: model-generated sources are rejected before observation |
| Correction becomes immutable evidence | `packages/learning/src/index.ts`, `packages/learning/src/index.test.ts`; frozen record and content hash | Proven at adapter level |
| Narrow lesson extraction | `LearningEngine.extractLesson()` and source event reference | Proven at adapter level |
| Governed activation and deterministic pack compilation | `packages/learning/src/index.test.ts` | Proven at adapter level: candidate excluded until approval; 20 byte-identical unchanged-state packs |
| Versioned profile graph | `packages/profile/src/index.ts`, `packages/profile/src/index.test.ts`; integrated into `LearningEngine` | Proven at deterministic adapter level: canonical candidate/active/revoked/superseded revisions, project and mode isolation, temporal current-state guard, inspectable counterevidence weakening, and reversible claim splitting into governed candidates |
| Provider-independent retrieval and pack filters | `packages/guidance/src/index.ts`, `packages/guidance/src/index.test.ts` | Proven at deterministic adapter level: lexical plus provider-port scoring, project/mode/revoked/sensitive exclusion, negative-control abstention, budget exclusion, provenance, and 20 byte-identical compilations; live pgvector scoring remains deferred |
| Prompt-injection evidence hold | `packages/evidence/src/index.ts`, `packages/evidence/src/index.test.ts` | Proven at deterministic adapter level: suspected instruction-injection text remains immutable auditable user evidence with the canonical `prompt_injection_suspected` security flag. Caller-supplied payload metadata cannot clear that flag, and automatic observation, hypothesis extraction, and profile-atom creation stop with `POTENTIAL_PROMPT_INJECTION_REVIEW_REQUIRED`. |
| Studio evidence/scope/mode/confidence/lifecycle | `apps/studio/src/App.tsx`, `apps/api/src/index.ts`, Studio/API tests | Proven at in-memory canonical read-model level: Studio does not create fixture learning or mutate atoms directly; it reads the API and submits versioned governed commands, including weaken-by-event, split, supersede, revoke, rescope, and approval. A build-verified correction intake records immutable evidence and requests a candidate through canonical endpoints; browser-level end-to-end proof remains open. |
| Studio Trace Viewer | `apps/studio/src/App.tsx`, `apps/studio/src/App.test.tsx`, `GET /v1/runs` | Proven at in-memory connected-read-model level: the newest recorded run displays its task-context digest, deterministic pack hash, included/excluded candidate decisions and reasons, and atom-to-immutable-event provenance; absent runs render an honest empty state |
| Relevant connected agent changes behavior | `apps/api/src/runtime.ts`, REST/runtime tests | Proven at in-memory runtime level |
| Connected-agent run ledger and read surface | `ConnectedAgentRuntime.recentRuns()`, `GET /v1/runs`, Studio command-center strip | Proven at in-memory runtime level: each agent run retains task context, pack hash, applied atoms, changed/baseline result, and recorded time for a read-only trace surface |
| Complete run trace and provenance | `AgentTrace`, `GET /v1/runs/:runId`, `GET /v1/profile/atoms/:id/trace`, API trace tests | Proven at in-memory runtime level: task-context digest, candidate scores/decisions/reasons, final pack hash, applied atom IDs, and source evidence event IDs are retrievable by run ID. Studio resolves a selected atom’s lineage by atom ID, so split successors cannot be confused with their shared source event. |
| Live Learning trace | `LearningEngine.learningTrace()`, `GET /v1/learning/trace/:eventId`, Studio selected-atom panel | Proven at connected read-model level: Studio can inspect the canonical immutable source → event → observation → signal → hypothesis → current-atom chain for selected learning; missing stages remain visibly pending rather than invented |
| MCP connected-agent surface | `apps/mcp/src/index.ts`, MCP tests | Proven at adapter level: retrieval, examples, explanation, feedback, and outcome tools route through the connected runtime; direct profile writes are intentionally absent |
| Unrelated task/mode unaffected | API runtime test and evaluation harness | Proven at adapter level |
| Objective evaluation and targeted ablation | `evaluateConnectedCausalComparison()`, `apps/api/src/runtime.test.ts`, `packages/evaluation/src/index.test.ts` | Proven at connected-runtime level: actual baseline, equal-token raw memory, Meraki Pack, and revoked-atom ablation runs retain run IDs; objective verdicts attach to Meraki and ablated runs, Meraki changes only the related task, raw memory leaks to the negative control, and the targeted ablation removes the improvement. Independent human-blind review remains open. |
| Connected evaluation record and priority | `ConnectedAgentRuntime.recordEvaluation()`, `POST/GET /v1/evaluations`, Studio Evaluation Lab | Proven at connected in-memory runtime level: a verdict is attached to an actual run, carries evaluator class/criteria/uncertainty, retains atom attribution only when guidance was applied, and an objective verdict supersedes an earlier weak-model verdict for the same run. A real independent blind-review dataset remains open. |
| Governed evaluation update proposals | `LearningEngine.proposeUpdate()`, API update-proposal routes, Studio Learning Queue | Proven at connected adapter/read-model level: explicit-user or objective-outcome evidence creates a pending proposal for one active atom only; reinforce is confidence/utility-capped, apply changes only the related pack, unrelated mode remains unchanged, and rollback creates a trace-preserving restoring revision. Model-generated evidence cannot propose an update. |
| Approve/edit/limit/revoke | Core versioned commands and Studio controls | Proven at adapter/UI level |
| Supersede and split lifecycle | `LearningEngine.split()`, `POST /v1/profile/atoms/:id/commands`, Core/API tests | Proven at deterministic adapter level: a version-checked split supersedes the source atom and creates trace-preserving candidate successors; each successor still requires governed activation |
| Evidence-backed weakening | `LearningEngine.weaken()`, `POST /v1/profile/atoms/:id/commands`, Core/API tests | Proven at deterministic adapter level: weakening requires an existing same-subject immutable event ID, records its evidence span as counterevidence, and lowers confidence; arbitrary free text is not accepted |
| Source traceability | Evidence event ID → ProfileAtom evidence → Meraki Pack atom manifest → run trace | Proven at adapter level |
| Restart survival | `JsonLearningEngineStore`, `JsonConnectedRuntimeStore`, `buildPersistentServer()`, runtime/API restart tests | Proven for deterministic JSON adapters: evidence, profile revisions, active guidance, recorded run trace, evaluation verdict, and attribution restore into a new connected runtime and through a clean Fastify close/reopen; PostgreSQL-backed restart remains open |
| Vitest worker lifecycle | `vitest.config.ts`, `apps/api/src/runtime.test.ts`, full `corepack pnpm test` command | Proven: Fastify readiness is established in its lifecycle hook before REST assertions, and bounded two-worker file serialization completes 68 tests with no worker-termination error or Meraki Node process; no forced exits or timeout inflation used |
| Clean installation | `docs/install.md`, frozen-lockfile build scripts | Static install path documented; clean machine not yet executed |
| PostgreSQL 16 + pgvector, RLS, concurrent idempotency | `packages/db/src/live-postgres.test.ts` and `ci:gate0` | **Deferred external proof: requires usable PostgreSQL 16 + pgvector runtime** |

## Security regression verification — 2026-07-14

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Canonical prompt-injection flag cannot be overwritten by activity payload metadata | `corepack pnpm exec vitest run packages/evidence/src/index.test.ts -t 'retains suspected prompt injection for audit but blocks automatic observation and learning'` | Pass, exit `0`; 1 selected test passed in 4.95s | `packages/evidence/src/index.test.ts` |
| Evidence package regression suite | `corepack pnpm exec vitest run packages/evidence/src/index.test.ts` | Pass, exit `0`; 5 tests passed | `packages/evidence/src/index.test.ts` |
| Full workspace test suite and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 64 tests passed, 1 live-PostgreSQL file / 3 tests skipped; post-run `tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH` reported no Node processes | Captured stdout: `%TEMP%\\meraki-workspace-suite.stdout.log` |

## Governed activity learning verification — 2026-07-14

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Activity evidence becomes an inspectable candidate but cannot change behavior before approval | `corepack pnpm exec vitest run packages/learning/src/index.test.ts apps/api/src/runtime.test.ts` | Pass, exit `0`; 26 tests passed | `LearningEngine.extractActivityLesson()`, `POST /v1/learning/candidates`, Core/API tests |
| Related behavior changes only after canonical approval | Same focused command | Pass: candidate leaves baseline unchanged; canonical confirm changes the matching email/concise run | `apps/api/src/runtime.test.ts` |
| Full workspace regression and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 66 tests passed, 1 live-PostgreSQL file / 3 tests skipped; post-run `tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH` reported no Node processes | Captured stdout: `%TEMP%\\meraki-activity-candidate-workspace.stdout.log` |

## Studio correction intake verification — 2026-07-14

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Studio sends explicit correction evidence and candidate requests only through canonical APIs | `corepack pnpm --filter @meraki/studio build` and `corepack pnpm exec vitest run apps/studio/src/App.test.tsx apps/api/src/runtime.test.ts` | Pass, both exit `0`; Studio production build completed and 24 tests passed | `apps/studio/src/App.tsx`, `apps/studio/src/App.test.tsx` |
| Candidate remains approval-gated | Same focused command | Pass: API regression proves the candidate preserves baseline output until canonical confirmation | `apps/api/src/runtime.test.ts` |
| Full workspace regression and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 67 tests passed, 1 live-PostgreSQL file / 3 tests skipped; post-run `tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH` reported no Node processes | Captured stdout: `%TEMP%\\meraki-studio-correction-workspace.stdout.log` |

## Atom-scoped trace verification — 2026-07-14

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Split successor resolves its own source-to-atom lineage | `corepack pnpm exec vitest run apps/api/src/runtime.test.ts` | Pass, exit `0`; 15 API tests passed. The formerly flaky REST test completed in 2.04s after Fastify lifecycle initialization moved to `beforeAll`. | `LearningEngine.learningTraceForAtom()`, `GET /v1/profile/atoms/:id/trace`, `apps/api/src/runtime.test.ts` |
| Studio looks up the selected atom rather than its shared source event | `corepack pnpm --filter @meraki/studio build` and focused Studio test | Build passed; `atomTracePath()` regression passed | `apps/studio/src/App.tsx`, `apps/studio/src/App.test.tsx` |
| Full workspace regression and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 68 tests passed, 1 live-PostgreSQL file / 3 tests skipped; process inspection found `0` Meraki Node/Vitest/Vite processes | Captured stdout: `%TEMP%\\meraki-atom-trace-workspace.stdout.log` |

## Connected causal evaluation verification — 2026-07-14

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Actual connected four-arm comparison | `corepack pnpm --filter @meraki/api build` then `corepack pnpm exec vitest run apps/api/src/runtime.test.ts -t 'compares actual connected baseline, raw-memory, Meraki, and targeted-ablation arms'` | Pass, both exit `0`; selected causal test passed | `evaluateConnectedCausalComparison()` |
| Objective attribution and targeted ablation | Same focused command | Pass: objective verdict is attributed only to the related Meraki run; raw memory leaks into the unrelated mode; revoking the retrieved atom removes the relevant improvement | `apps/api/src/runtime.test.ts` |
| Full workspace regression and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 69 tests passed, 1 live-PostgreSQL file / 3 tests skipped; process inspection found `0` Meraki Node/Vitest/Vite processes | Captured stdout: `%TEMP%\\meraki-connected-causal-workspace.stdout.log` |

## Connected Evaluation Lab verification — 2026-07-14

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Canonical connected causal evaluation API | `corepack pnpm --filter @meraki/api build`; `corepack pnpm exec vitest run apps/api/src/runtime.test.ts -t 'exposes the connected causal proof through the canonical API'` | Pass, exit `0`; API build passed and route test returned `201` with related improvement, unrelated-control isolation, and targeted-ablation removal | `apps/api/src/index.ts`, `apps/api/src/runtime.test.ts` |
| Studio Evaluation Lab can launch and display the connected report | `corepack pnpm --filter @meraki/studio build`; `corepack pnpm exec vitest run apps/studio/src/App.test.tsx -t 'causal'` | Pass, exit `0`; production build passed and causal request payload regression passed | `apps/studio/src/App.tsx`, `apps/studio/src/App.test.tsx` |
| Full workspace regression and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 71 tests passed, 1 live-PostgreSQL file / 3 tests skipped; no worker termination error; post-run inspection found `0` Meraki Node/Vitest/Vite processes | Captured stdout: `%TEMP%\\meraki-causal-workspace.stdout.log` |

## MCP connected Core verification — 2026-07-15

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Governed MCP tool surface | `corepack pnpm exec vitest run apps/mcp/src/index.test.ts` | Pass, exit `0`; 8 tests passed. The adapter exposes guidance, examples, explanation, feedback, and outcome tools; no direct profile-write or arbitrary memory-write tool exists. | `apps/mcp/src/index.ts`, `apps/mcp/src/index.test.ts` |
| MCP reuses canonical connected learning and retrieval | Same focused command | Pass: one `ConnectedAgentRuntime` learns the approved correction and the MCP adapter retrieves it for the matching task/mode; creative mode receives no atom. | `apps/mcp/src/index.test.ts` |
| Determinism, revocation, and malformed-input safety | Same focused command | Pass: repeated guidance requests return the same pack hash; examples expose canonical guidance; revoking the atom removes it; malformed feedback/outcome returns an error without a successful evidence receipt. | `apps/mcp/src/index.test.ts` |
| MCP build and clean test process | `corepack pnpm --filter @meraki/mcp build` | Pass, exit `0`; TypeScript build completed. Focused Vitest process exited cleanly. | `apps/mcp/dist/index.js`, post-run process inspection |

## Canonical Meraki launch-copy loop — 2026-07-15

| Requirement | Exact command | Result | Evidence |
|---|---|---|---|
| Correction → immutable evidence → narrow scoped `judgment.copy` atom | `corepack pnpm --filter @meraki/api build`; `corepack pnpm exec vitest run apps/api/src/runtime.test.ts -t 'canonical Meraki launch-copy'` | Pass, exit `0`; correction is recorded, candidate is `judgment.copy`, lifecycle remains candidate until governed API commands, and the exact claim is preserved | `apps/api/src/runtime.test.ts`, `schemas/meraki.schema.json`, `packages/contracts/src/generated.ts` |
| Approval/edit/rescope and relevant retrieval | Same focused command | Pass: edit, rescope, and confirm commands activate the atom; product-writing/public-founder-voice receives the claim while coding/engineering and client-email/formal negative controls remain baseline | `apps/api/src/runtime.test.ts` |
| Complete lineage and connected behavior change | Same focused command | Pass: source, event, observation, signal, hypothesis, atom trace is inspectable; related run changes and carries the exact guidance | `GET /v1/profile/atoms/:id/trace`, `apps/api/src/runtime.test.ts` |
| Feedback/outcome → evaluation → attributed update → later pack change | Same focused command | Pass: explicit feedback and objective outcome preserve trust classes; objective evaluation is recorded; reinforce proposal applies through governed approval and changes the later pack hash | `POST /v1/activity`, `POST /v1/outcomes`, `POST /v1/evaluations`, update-proposal routes |
| Revocation removes future behavior | Same focused command | Pass: revoking the atom returns the related run to the generic baseline | `apps/api/src/runtime.test.ts` |
| Full Core regression and worker cleanup | `corepack pnpm test` | Pass, exit `0`; 11 files / 75 tests passed, 1 live-PostgreSQL file / 3 tests skipped; no worker termination error; no Meraki Node/Vitest/Vite/Fastify process remained | Captured stdout: `%TEMP%\\meraki-v0-canonical-loop.stdout.log` |

The goal must not be marked complete until the final row is executed against a
real PostgreSQL 16 + pgvector instance and an independent reviewer accepts the
result.
