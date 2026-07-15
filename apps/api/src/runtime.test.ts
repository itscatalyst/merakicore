import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPersistentServer, buildServer } from "./index.js";
import { ConnectedAgentRuntime, evaluateConnectedCausalComparison, JsonConnectedRuntimeStore } from "./runtime.js";

const context = (overrides: Record<string, unknown> = {}) => ({ contract: "task_context" as const, tenant_id: "tenant-a", subject_id: "user-a", task_id: "task-1", task_type: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", constraints: [], permissions: [], token_budget: 1000, ...overrides });
const correction = { tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "run-a", taskType: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", original: "Draft email", correction: "Use a concise subject" };
const server = buildServer();

beforeAll(async () => {
  await server.ready();
});

afterAll(async () => {
  await server.close();
});

describe("connected agent adapter", () => {
  it("changes a relevant run and returns a trace, while unrelated mode stays baseline", () => {
    const runtime = new ConnectedAgentRuntime();
    runtime.learn(correction);
    const related = runtime.run({ context: context(), request: "Draft", baseline: "BASELINE" });
    const unrelated = runtime.run({ context: context({ mode: "creative" }), request: "Draft", baseline: "BASELINE" });
    expect(related.output).toContain("Meraki guidance applied");
    expect(related.trace.changed).toBe(true);
    expect(related.trace.appliedAtomIds).toHaveLength(1);
    expect(unrelated.output).toBe("BASELINE");
    expect(unrelated.trace.changed).toBe(false);
  });

  it("compares actual connected baseline, raw-memory, Meraki, and targeted-ablation arms", () => {
    const report = evaluateConnectedCausalComparison({ correction, related: { context: context(), request: "Draft", baseline: "BASELINE" }, unrelated: { context: context({ mode: "creative" }), request: "Draft", baseline: "BASELINE" }, experimentId: "connected-causal-proof" });
    expect(report.arms.rawMemory.tokenCount).toBe(report.arms.merakiPack.tokenCount);
    expect(report.relatedImproves).toBe(true);
    expect(report.unrelatedUnaffected).toBe(true);
    expect(report.targetedAblationRemovesImprovement).toBe(true);
    expect(report.correctionBurden).toEqual({ baseline: 1, rawMemory: 1, merakiPack: 0, ablatedPack: 1 });
    expect(report.arms.merakiPack.related.trace.appliedAtomIds).toHaveLength(1);
    expect(report.arms.merakiPack.unrelated.output).toBe("BASELINE");
    expect(report.arms.rawMemory.unrelated.output).toContain(report.guidance);
    expect(report.objectiveRecords.merakiRelated).toMatchObject({ effective: true, attribution: { effect: 1 } });
    expect(report.objectiveRecords.ablatedRelated.attribution).toBeUndefined();
  });

  it("exposes the connected causal proof through the canonical API", async () => {
    const response = await server.inject({ method: "POST", url: "/v1/evaluations/causal", payload: { experiment_id: "api-causal-proof", correction, related: { context: context(), request: "Draft", baseline: "BASELINE" }, unrelated: { context: context({ mode: "creative" }), request: "Draft", baseline: "BASELINE" } } });
    expect(response.statusCode).toBe(201);
    expect(response.json<{ report: { relatedImproves: boolean; unrelatedUnaffected: boolean; targetedAblationRemovesImprovement: boolean; correctionBurden: Record<string, number> } }>().report).toMatchObject({ relatedImproves: true, unrelatedUnaffected: true, targetedAblationRemovesImprovement: true, correctionBurden: { baseline: 1, rawMemory: 1, merakiPack: 0, ablatedPack: 1 } });
  });

  it("exposes correction and run over REST with immutable evidence and trace", async () => {
    const response = await server.inject({ method: "POST", url: "/v1/learning", payload: correction });
    expect(response.statusCode).toBe(201);
    const evidence = response.json<{ evidence: { eventId: string } }>().evidence;
    expect(evidence.eventId).toBeTypeOf("string");
    const runResponse = await server.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } });
    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json<{ output: string; trace: { changed: boolean } }>().output).toContain("Meraki guidance applied");
    expect(runResponse.json<{ output: string; trace: { changed: boolean } }>().trace.changed).toBe(true);
  });

  it("exposes the complete immutable learning chain for a selected evidence event", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const learned = await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const eventId = learned.json<{ evidence: { eventId: string } }>().evidence.eventId;
    const trace = await isolated.inject({ method: "GET", url: `/v1/learning/trace/${eventId}` });
    expect(trace.statusCode).toBe(200);
    expect(trace.json<{ trace: { source: { trust_class: string }; event: { id: string }; observation?: { id: string }; signal?: { id: string }; hypothesis?: { id: string }; atom?: { lifecycle: string } } }>().trace).toMatchObject({ source: { trust_class: "explicit_user" }, event: { id: eventId }, observation: { id: expect.any(String) }, signal: { id: expect.any(String) }, hypothesis: { id: expect.any(String) }, atom: { lifecycle: "active" } });
    await isolated.close();
  });

  it("exposes governed profile atoms through the API without a direct write route", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const learned = await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const lesson = learned.json<{ lesson: { id: string; version: number } }>().lesson;
    const listed = await isolated.inject({ method: "GET", url: "/v1/profile/atoms" });
    expect(listed.json<{ items: Array<{ id: string; lifecycle: string }> }>().items).toContainEqual(expect.objectContaining({ id: lesson.id, lifecycle: "active" }));
    const revoked = await isolated.inject({ method: "POST", url: `/v1/profile/atoms/${lesson.id}/commands`, payload: { atom_id: lesson.id, expected_version: lesson.version, operation: "revoke" } });
    expect(revoked.json<{ atom: { lifecycle: string } }>().atom.lifecycle).toBe("revoked");
    await isolated.close();
  });

  it("records connected runs for a read-only trace surface", async () => {
    const isolated = buildServer();
    await isolated.ready();
    await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    await isolated.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } });
    const runs = await isolated.inject({ method: "GET", url: "/v1/runs" });
    expect(runs.json<{ items: Array<{ run: { trace: { changed: boolean; packHash: string } } }> }>().items[0]?.run.trace).toMatchObject({ changed: true, packHash: expect.stringMatching(/^sha256:/) });
    await isolated.close();
  });

  it("governs supersession and splitting through versioned profile commands", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const learned = await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const lesson = learned.json<{ lesson: { id: string; version: number } }>().lesson;
    const split = await isolated.inject({ method: "POST", url: `/v1/profile/atoms/${lesson.id}/commands`, payload: { atom_id: lesson.id, expected_version: lesson.version, operation: "split", claims: ["Use concise subjects", "Use detailed technical plans"] } });
    expect(split.statusCode).toBe(200);
    const successors = split.json<{ atoms: Array<{ id: string; lifecycle: string }> }>().atoms;
    expect(successors).toHaveLength(2);
    const successorTrace = await isolated.inject({ method: "GET", url: `/v1/profile/atoms/${successors[1]!.id}/trace` });
    expect(successorTrace.json<{ trace: { atom?: { id: string; lifecycle: string }; event: { id: string } } }>().trace).toMatchObject({ atom: { id: successors[1]!.id, lifecycle: "candidate" }, event: { id: expect.any(String) } });
    const listed = await isolated.inject({ method: "GET", url: "/v1/profile/atoms" });
    expect(listed.json<{ items: Array<{ id: string; lifecycle: string }> }>().items).toContainEqual(expect.objectContaining({ id: lesson.id, lifecycle: "superseded" }));
    await isolated.close();
  });

  it("weakens only against a canonical same-subject evidence event", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const learned = await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const lesson = learned.json<{ lesson: { id: string; version: number; confidence: number } }>().lesson;
    const counter = await isolated.inject({ method: "POST", url: "/v1/corrections", payload: { ...correction, runId: "counter-run", correction: "Use more detail in technical plans" } });
    const eventId = counter.json<{ evidence: { eventId: string } }>().evidence.eventId;
    const weakened = await isolated.inject({ method: "POST", url: `/v1/profile/atoms/${lesson.id}/commands`, payload: { atom_id: lesson.id, expected_version: lesson.version, operation: "weaken", counterevidence_event_id: eventId } });
    expect(weakened.statusCode).toBe(200);
    expect(weakened.json<{ atom: { counterevidence: Array<{ event_id: string }>; confidence: number } }>().atom).toMatchObject({ confidence: expect.any(Number), counterevidence: [{ event_id: eventId }] });
    await isolated.close();
  });

  it("restores a connected agent with active guidance after process reconstruction", () => {
    const first = new ConnectedAgentRuntime();
    first.learn(correction);
    const restored = ConnectedAgentRuntime.fromSnapshot(first.snapshot());
    const result = restored.run({ context: context(), request: "Draft", baseline: "BASELINE" });
    expect(result.trace.changed).toBe(true);
    expect(result.trace.appliedAtomIds).toHaveLength(1);
  });

  it("ingests explicit activities and objective outcomes as immutable source events", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const activity = await isolated.inject({ method: "POST", url: "/v1/activity", payload: { tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "run-activity", taskType: "email", activityType: "approval", content: "Approved concise subject", scope: { level: "project", ref: "acme" }, mode: "concise" } });
    expect(activity.statusCode).toBe(201);
    expect(activity.json<{ evidence: { event: { event_type: string; source_id: string }; source: { trust_class: string } } }>().evidence).toMatchObject({ source: { trust_class: "explicit_user" }, event: { event_type: "approval" } });
    const activityEventId = activity.json<{ evidence: { event: { id: string } } }>().evidence.event.id;
    expect((await isolated.inject({ method: "GET", url: `/v1/learning/trace/${activityEventId}` })).json<{ trace: { observation?: { epistemicClass: string }; atom?: unknown } }>().trace).toMatchObject({ observation: { epistemicClass: "direct" } });
    const outcome = await isolated.inject({ method: "POST", url: "/v1/outcomes", payload: { tenantId: "tenant-a", subjectId: "user-a", runId: "run-activity", outcomeType: "accepted", outcome: { accepted: true }, scope: { level: "project", ref: "acme" }, mode: "concise" } });
    expect(outcome.statusCode).toBe(201);
    expect(outcome.json<{ evidence: { event: { event_type: string }; source: { trust_class: string } } }>().evidence).toMatchObject({ source: { trust_class: "objective_outcome" }, event: { event_type: "outcome" } });
    await isolated.close();
  });

  it("keeps an activity-derived lesson governed until a canonical approval changes a related run", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const activity = await isolated.inject({ method: "POST", url: "/v1/activity", payload: { tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "activity-candidate", taskType: "email", activityType: "edit", content: "Replace the long subject with a concise subject", scope: correction.scope, mode: correction.mode, payload: { before: "Long", after: "Concise" } } });
    const eventId = activity.json<{ evidence: { event: { id: string } } }>().evidence.event.id;
    const proposed = await isolated.inject({ method: "POST", url: "/v1/learning/candidates", payload: { event_id: eventId, claim: "For email, use concise subject lines.", facet: "communication" } });
    expect(proposed.statusCode).toBe(201);
    const lesson = proposed.json<{ lesson: { id: string; version: number; lifecycle: string } }>().lesson;
    expect(lesson.lifecycle).toBe("candidate");
    expect((await isolated.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } })).json<{ output: string }>().output).toBe("BASELINE");
    const approved = await isolated.inject({ method: "POST", url: `/v1/profile/atoms/${lesson.id}/commands`, payload: { atom_id: lesson.id, expected_version: lesson.version, operation: "confirm" } });
    expect(approved.statusCode).toBe(200);
    expect((await isolated.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } })).json<{ output: string }>().output).toContain("concise subject lines");
    await isolated.close();
  });

  it("exposes targeted update proposals as governed API resources", async () => {
    const isolated = buildServer();
    await isolated.ready();
    const learned = await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const lesson = learned.json<{ lesson: { id: string } }>().lesson;
    const outcome = await isolated.inject({ method: "POST", url: "/v1/outcomes", payload: { tenantId: "tenant-a", subjectId: "user-a", runId: "run-a", outcomeType: "accepted", outcome: { accepted: true }, scope: correction.scope, mode: correction.mode } });
    const eventId = outcome.json<{ evidence: { event: { id: string } } }>().evidence.event.id;
    const created = await isolated.inject({ method: "POST", url: "/v1/update-proposals", payload: { lesson_id: lesson.id, evidence_event_id: eventId, operation: "reinforce" } });
    expect(created.statusCode).toBe(201);
    const proposal = created.json<{ proposal: { id: string; status: string; target: { id: string } } }>().proposal;
    expect(proposal).toMatchObject({ status: "pending", target: { id: lesson.id } });
    const approved = await isolated.inject({ method: "POST", url: `/v1/update-proposals/${proposal.id}/commands`, payload: { operation: "approve" } });
    expect(approved.json<{ proposal: { status: string }; atom: { utility: number } }>().proposal.status).toBe("applied");
    expect(approved.json<{ proposal: { status: string }; atom: { utility: number } }>().atom.utility).toBeGreaterThan(0);
    const listed = await isolated.inject({ method: "GET", url: "/v1/update-proposals" });
    expect(listed.json<{ items: Array<{ id: string; status: string }> }>().items).toContainEqual(expect.objectContaining({ id: proposal.id, status: "applied" }));
    const rollback = await isolated.inject({ method: "POST", url: `/v1/update-proposals/${proposal.id}/commands`, payload: { operation: "rollback" } });
    expect(rollback.json<{ proposal: { status: string } }>().proposal.status).toBe("rolled_back");
    await isolated.close();
  });

  it("exposes candidate decisions and evidence provenance through trace lookup", async () => {
    const isolated = buildServer();
    await isolated.ready();
    await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const response = await isolated.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } });
    const trace = response.json<{ trace: { runId: string; taskContextDigest: string; candidates: Array<{ decision: string; reasons: string[] }>; provenance: Array<{ evidenceEventIds: string[] }> } }>().trace;
    expect(trace.taskContextDigest).toMatch(/^sha256:/);
    expect(trace.candidates.some((candidate) => candidate.decision === "included")).toBe(true);
    expect(trace.provenance[0]?.evidenceEventIds.length).toBeGreaterThan(0);
    const lookup = await isolated.inject({ method: "GET", url: `/v1/runs/${trace.runId}` });
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json<{ run: { trace: { runId: string } } }>().run.trace.runId).toBe(trace.runId);
    await isolated.close();
  });

  it("records a traceable evaluator verdict and lets objective evidence outrank a model judge", async () => {
    const isolated = buildServer();
    await isolated.ready();
    await isolated.inject({ method: "POST", url: "/v1/learning", payload: correction });
    const run = await isolated.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } });
    const runId = run.json<{ trace: { runId: string } }>().trace.runId;
    const model = await isolated.inject({ method: "POST", url: "/v1/evaluations", payload: { run_id: runId, experiment_id: "experiment-1", arm_id: "meraki", evaluator_class: "model_weak", criteria: { clarity: 0.9 }, result: "win", uncertainty: 0.2 } });
    expect(model.statusCode).toBe(201);
    const objective = await isolated.inject({ method: "POST", url: "/v1/evaluations", payload: { run_id: runId, experiment_id: "experiment-1", arm_id: "meraki", evaluator_class: "objective", criteria: { accepted: 1 }, result: "win", uncertainty: 0 } });
    expect(objective.json<{ record: { effective: boolean; attribution?: { target: { id: string }; effect: number } } }>().record).toMatchObject({ effective: true, attribution: { effect: 1 } });
    const evaluations = await isolated.inject({ method: "GET", url: "/v1/evaluations" });
    const items = evaluations.json<{ items: Array<{ evaluation: { evaluator_class: string }; effective: boolean }> }>().items;
    expect(items.find((item) => item.evaluation.evaluator_class === "objective")?.effective).toBe(true);
    expect(items.find((item) => item.evaluation.evaluator_class === "model_weak")?.effective).toBe(false);
    await isolated.close();
  });

  it("restores connected guidance, run trace, and evaluation attribution through a new runtime", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meraki-runtime-"));
    try {
      const original = new ConnectedAgentRuntime();
      original.learn(correction);
      const run = original.run({ context: context(), request: "Draft", baseline: "BASELINE" });
      original.recordEvaluation({ runId: run.trace.runId, experimentId: "restart-experiment", armId: "meraki", evaluatorClass: "objective", criteria: { accepted: 1 }, result: "win", uncertainty: 0 });
      const store = new JsonConnectedRuntimeStore(join(directory, "runtime.json"));
      await store.save(original);
      const restored = await store.load();
      expect(restored.getRun(run.trace.runId)?.run.trace.packHash).toBe(run.trace.packHash);
      expect(restored.evaluations()[0]).toMatchObject({ runId: run.trace.runId, effective: true, attribution: { effect: 1 } });
      expect(restored.run({ context: context(), request: "Later draft", baseline: "BASELINE" }).trace.changed).toBe(true);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("persists runs and evaluations across a clean Fastify close and reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meraki-api-restart-"));
    try {
      const path = join(directory, "runtime.json");
      const first = await buildPersistentServer(path);
      await first.ready();
      await first.inject({ method: "POST", url: "/v1/learning", payload: correction });
      const run = await first.inject({ method: "POST", url: "/v1/agent/run", payload: { context: context(), request: "Draft", baseline: "BASELINE" } });
      const runId = run.json<{ trace: { runId: string } }>().trace.runId;
      await first.inject({ method: "POST", url: "/v1/evaluations", payload: { run_id: runId, experiment_id: "api-restart", arm_id: "meraki", evaluator_class: "objective", criteria: { accepted: 1 }, result: "win", uncertainty: 0 } });
      await first.close();
      const second = await buildPersistentServer(path);
      await second.ready();
      expect((await second.inject({ method: "GET", url: `/v1/runs/${runId}` })).statusCode).toBe(200);
      expect((await second.inject({ method: "GET", url: "/v1/evaluations" })).json<{ items: Array<{ runId: string }> }>().items[0]?.runId).toBe(runId);
      await second.close();
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
