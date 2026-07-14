import Fastify, { type FastifyInstance } from "fastify";
import { pathToFileURL } from "node:url";
import type { ProfileAtom, TaskContext } from "@meraki/contracts";
import type { ExplicitActivityType } from "@meraki/evidence";
import { ConnectedAgentRuntime, evaluateConnectedCausalComparison, JsonConnectedRuntimeStore, scopeFromUnknown } from "./runtime.js";
export { ConnectedAgentRuntime, JsonConnectedRuntimeStore } from "./runtime.js";

type CorrectionBody = { tenantId: string; subjectId: string; actorId: string; runId: string; taskType: string; scope: unknown; mode?: string; original: string; correction: string };
type ActivityBody = { tenantId: string; subjectId: string; actorId: string; runId: string; taskType: string; activityType: ExplicitActivityType; content: string; scope: unknown; mode?: string; payload?: Record<string, unknown> };
type OutcomeBody = { tenantId: string; subjectId: string; runId: string; outcomeType: string; outcome: Record<string, unknown>; scope: unknown; mode?: string };
type ActivityLessonBody = { event_id: string; claim: string; facet?: ProfileAtom["facet"]; temporal_horizon?: ProfileAtom["temporal_horizon"] };
type RunBody = { context: Omit<TaskContext, "scope"> & { scope: unknown }; request: string; baseline: string };
type AtomCommandBody = { atom_id: string; expected_version: number; operation: "confirm" | "edit" | "rescope" | "limit" | "revoke" | "supersede" | "weaken" | "split"; claim?: string; claims?: string[]; counterevidence_event_id?: string; scope?: unknown; mode?: string };
type UpdateProposalBody = { lesson_id: string; evidence_event_id: string; operation: "reinforce" | "weaken" };
type UpdateProposalCommandBody = { operation: "approve" | "reject" | "rollback" };
type EvaluationBody = { run_id: string; experiment_id: string; arm_id: string; evaluator_class: "human_blind" | "objective" | "model_weak"; criteria: Record<string, unknown>; result: "win" | "loss" | "tie" | "abstain"; uncertainty: number; reason?: string; evaluator_identity_digest?: string };
type CausalEvaluationBody = { correction: CorrectionBody; related: RunBody; unrelated: RunBody; experiment_id?: string };

export const buildServer = (runtime = new ConnectedAgentRuntime()): FastifyInstance => {
  const server = Fastify({ logger: false });
  server.post<{ Body: CorrectionBody }>("/v1/corrections", async (request, reply) => {
    try {
      const evidence = runtime.correction({ ...request.body, scope: scopeFromUnknown(request.body.scope) });
      return reply.code(201).send({ evidence });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_CORRECTION" }); }
  });
  server.post<{ Body: ActivityBody }>("/v1/activity", async (request, reply) => {
    try { return reply.code(201).send({ evidence: runtime.activity({ ...request.body, scope: scopeFromUnknown(request.body.scope) }) }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_ACTIVITY" }); }
  });
  server.post<{ Body: OutcomeBody }>("/v1/outcomes", async (request, reply) => {
    try { return reply.code(201).send({ evidence: runtime.outcome({ ...request.body, scope: scopeFromUnknown(request.body.scope) }) }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_OUTCOME" }); }
  });
  server.post<{ Body: CorrectionBody }>("/v1/learning", async (request, reply) => {
    try {
      const receipt = runtime.learn({ ...request.body, scope: scopeFromUnknown(request.body.scope) });
      return reply.code(201).send(receipt);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_LEARNING" }); }
  });
  server.post<{ Body: ActivityLessonBody }>("/v1/learning/candidates", async (request, reply) => {
    try { return reply.code(201).send({ lesson: runtime.extractActivityLesson({ eventId: request.body.event_id, claim: request.body.claim, ...(request.body.facet === undefined ? {} : { facet: request.body.facet }), ...(request.body.temporal_horizon === undefined ? {} : { temporalHorizon: request.body.temporal_horizon }) }) }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_ACTIVITY_LESSON" }); }
  });
  server.post<{ Body: RunBody }>("/v1/agent/run", async (request, reply) => {
    try {
      const result = runtime.run({ ...request.body, context: { ...request.body.context, scope: scopeFromUnknown(request.body.context.scope) } });
      return reply.send(result);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_RUN" }); }
  });
  server.get("/v1/profile/atoms", async () => ({ items: runtime.profileAtoms() }));
  server.get<{ Params: { eventId: string } }>("/v1/learning/trace/:eventId", async (request, reply) => {
    try { return reply.send({ trace: runtime.learningTrace(request.params.eventId) }); }
    catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "LEARNING_TRACE_NOT_FOUND" }); }
  });
  server.get<{ Params: { id: string } }>("/v1/profile/atoms/:id/trace", async (request, reply) => {
    try { return reply.send({ trace: runtime.learningTraceForAtom(request.params.id) }); }
    catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "ATOM_TRACE_NOT_FOUND" }); }
  });
  server.get("/v1/update-proposals", async () => ({ items: runtime.updateProposals() }));
  server.post<{ Body: UpdateProposalBody }>("/v1/update-proposals", async (request, reply) => {
    try { return reply.code(201).send({ proposal: runtime.proposeUpdate(request.body.lesson_id, request.body.evidence_event_id, request.body.operation) }); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_UPDATE_PROPOSAL" }); }
  });
  server.post<{ Params: { id: string }; Body: UpdateProposalCommandBody }>("/v1/update-proposals/:id/commands", async (request, reply) => {
    try {
      const result = request.body.operation === "approve" ? runtime.applyUpdateProposal(request.params.id)
        : request.body.operation === "reject" ? { proposal: runtime.rejectUpdateProposal(request.params.id) }
        : runtime.rollbackUpdateProposal(request.params.id);
      return reply.send(result);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_UPDATE_PROPOSAL_COMMAND" }); }
  });
  server.get("/v1/runs", async () => ({ items: runtime.recentRuns() }));
  server.get("/v1/evaluations", async () => ({ items: runtime.evaluations() }));
  server.post<{ Body: CausalEvaluationBody }>("/v1/evaluations/causal", async (request, reply) => {
    try {
      const input = request.body;
      const report = evaluateConnectedCausalComparison({
        ...(input.experiment_id ? { experimentId: input.experiment_id } : {}),
        correction: { ...input.correction, scope: scopeFromUnknown(input.correction.scope) },
        related: { ...input.related, context: { ...input.related.context, scope: scopeFromUnknown(input.related.context.scope) } },
        unrelated: { ...input.unrelated, context: { ...input.unrelated.context, scope: scopeFromUnknown(input.unrelated.context.scope) } }
      });
      return reply.code(201).send({ report });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_CAUSAL_EVALUATION" }); }
  });
  server.post<{ Body: EvaluationBody }>("/v1/evaluations", async (request, reply) => {
    try {
      const { run_id, experiment_id, arm_id, evaluator_class, criteria, result, uncertainty, reason, evaluator_identity_digest } = request.body;
      return reply.code(201).send({ record: runtime.recordEvaluation({ runId: run_id, experimentId: experiment_id, armId: arm_id, evaluatorClass: evaluator_class, criteria, result, uncertainty, ...(reason === undefined ? {} : { reason }), ...(evaluator_identity_digest === undefined ? {} : { evaluatorIdentityDigest: evaluator_identity_digest }) }) });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_EVALUATION" }); }
  });
  server.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    const run = runtime.getRun(request.params.runId);
    return run ? reply.send(run) : reply.code(404).send({ error: "RUN_NOT_FOUND" });
  });
  server.post<{ Params: { id: string }; Body: AtomCommandBody }>("/v1/profile/atoms/:id/commands", async (request, reply) => {
    try {
      const { operation, expected_version, claim, mode } = request.body;
      if (request.body.atom_id !== request.params.id) throw new Error("ATOM_ID_MISMATCH");
      if (operation === "split") return reply.send({ atoms: runtime.split(request.params.id, request.body.claims ?? [], expected_version) });
      const atom = operation === "confirm" ? runtime.approve(request.params.id, expected_version)
        : operation === "edit" ? runtime.edit(request.params.id, claim ?? "", expected_version)
        : operation === "revoke" ? runtime.revoke(request.params.id, expected_version)
        : operation === "supersede" ? runtime.supersede(request.params.id, expected_version)
        : operation === "weaken" ? runtime.weaken(request.params.id, request.body.counterevidence_event_id ?? "", expected_version)
        : runtime.rescope(request.params.id, operation === "limit" ? { level: "task", ref: "current-task" } : scopeFromUnknown(request.body.scope), mode, expected_version);
      return reply.send({ atom });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_ATOM_COMMAND" }); }
  });
  return server;
};

/** Loads and atomically saves the local runtime adapter when Fastify closes. */
export const buildPersistentServer = async (path: string): Promise<FastifyInstance> => {
  const store = new JsonConnectedRuntimeStore(path);
  const runtime = await store.load();
  const server = buildServer(runtime);
  server.addHook("onClose", async () => { await store.save(runtime); });
  return server;
};

// pathToFileURL keeps the executable entrypoint check correct on Windows and POSIX.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3001);
  const server = process.env.MERAKI_RUNTIME_PATH ? await buildPersistentServer(process.env.MERAKI_RUNTIME_PATH) : buildServer();
  await server.listen({ port, host: "0.0.0.0" });
}
