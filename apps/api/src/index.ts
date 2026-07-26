import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { pathToFileURL } from "node:url";
import type { ProfileAtom, TaskContext } from "@meraki/contracts";
import type { ExplicitActivityType } from "@meraki/core";
import {
  assertAuthenticatedIdentity,
  requestAuthenticatorFromEnvironment,
  StaticRequestAuthenticator,
  type AuthenticatedContext,
  type RequestAuthenticator
} from "@meraki/auth";
import { ConnectedAgentRuntime, evaluateConnectedCausalComparison, scopeFromUnknown } from "@meraki/core";
import { JsonConnectedRuntimeStore } from "@meraki/storage-local";
export { ConnectedAgentRuntime } from "@meraki/core";
export { JsonConnectedRuntimeStore } from "@meraki/storage-local";

type CorrectionBody = {
  tenantId: string;
  subjectId: string;
  actorId: string;
  runId: string;
  taskType: string;
  scope: unknown;
  mode?: string;
  original: string;
  correction: string;
};
type ActivityBody = {
  tenantId: string;
  subjectId: string;
  actorId: string;
  runId: string;
  taskType: string;
  activityType: ExplicitActivityType;
  content: string;
  scope: unknown;
  mode?: string;
  payload?: Record<string, unknown>;
};
type OutcomeBody = {
  tenantId: string;
  subjectId: string;
  runId: string;
  outcomeType: string;
  outcome: Record<string, unknown>;
  scope: unknown;
  mode?: string;
};
type ActivityLessonBody = {
  event_id: string;
  claim: string;
  facet?: ProfileAtom["facet"];
  temporal_horizon?: ProfileAtom["temporal_horizon"];
};
type RunBody = { context: Omit<TaskContext, "scope"> & { scope: unknown }; request: string; baseline: string };
type AtomCommandBody = {
  atom_id: string;
  expected_version: number;
  operation: "confirm" | "edit" | "rescope" | "limit" | "revoke" | "supersede" | "weaken" | "split";
  claim?: string;
  claims?: string[];
  counterevidence_event_id?: string;
  scope?: unknown;
  mode?: string;
};
type UpdateProposalBody = { lesson_id: string; evidence_event_id: string; operation: "reinforce" | "weaken" };
type UpdateProposalCommandBody = { operation: "approve" | "reject" | "rollback" };
type EvaluationBody = {
  run_id: string;
  experiment_id: string;
  arm_id: string;
  evaluator_class: "human_blind" | "objective" | "model_weak";
  criteria: Record<string, unknown>;
  result: "win" | "loss" | "tie" | "abstain";
  uncertainty: number;
  reason?: string;
  evaluator_identity_digest?: string;
};
type CausalEvaluationBody = {
  correction: CorrectionBody;
  related: RunBody;
  unrelated: RunBody;
  experiment_id?: string;
};
const errorCode = (error: unknown, fallback: string): string =>
  typeof error === "object" && error && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : error instanceof Error
      ? error.message
      : fallback;
const errorStatus = (code: string): number => {
  if (code === "invalid_token" || code === "missing_token" || code === "malformed_token") return 401;
  if (code === "identity_mismatch" || code === "insufficient_scope") return 403;
  if (code.includes("NOT_FOUND")) return 404;
  if (code.includes("VERSION_CONFLICT") || code.includes("NOT_PENDING") || code.includes("NOT_APPLIED")) return 409;
  return 422;
};
const sendError = (reply: FastifyReply, error: unknown, fallback: string) => {
  const code = errorCode(error, fallback);
  return reply.code(errorStatus(code)).send({ error: code });
};
const record = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
};
const required = (value: unknown, code: string): string =>
  typeof value === "string" && value.trim()
    ? value
    : (() => {
        throw new Error(code);
      })();
const validateIdentity = (value: unknown): void => {
  const input = record(value, "REQUEST_OBJECT_REQUIRED");
  required(input.tenantId, "TENANT_ID_REQUIRED");
  required(input.subjectId, "SUBJECT_ID_REQUIRED");
};
const validateCorrection = (value: unknown): void => {
  const input = record(value, "INVALID_CORRECTION");
  validateIdentity(input);
  for (const key of ["actorId", "runId", "taskType", "original", "correction"])
    required(input[key], `${key.toUpperCase()}_REQUIRED`);
  scopeFromUnknown(input.scope);
};
const validateActivity = (value: unknown): void => {
  const input = record(value, "INVALID_ACTIVITY");
  validateIdentity(input);
  for (const key of ["actorId", "runId", "taskType", "activityType", "content"])
    required(input[key], `${key.toUpperCase()}_REQUIRED`);
  scopeFromUnknown(input.scope);
};
const validateOutcome = (value: unknown): void => {
  const input = record(value, "INVALID_OUTCOME");
  validateIdentity(input);
  for (const key of ["runId", "outcomeType"]) required(input[key], `${key.toUpperCase()}_REQUIRED`);
  record(input.outcome, "OUTCOME_REQUIRED");
  scopeFromUnknown(input.scope);
};
const validateRun = (value: unknown): void => {
  const input = record(value, "INVALID_RUN");
  required(input.request, "REQUEST_REQUIRED");
  required(input.baseline, "BASELINE_REQUIRED");
  const ctx = record(input.context, "TASK_CONTEXT_REQUIRED");
  required(ctx.tenant_id, "TENANT_ID_REQUIRED");
  required(ctx.subject_id, "SUBJECT_ID_REQUIRED");
  required(ctx.task_id, "TASK_ID_REQUIRED");
  required(ctx.task_type, "TASK_TYPE_REQUIRED");
  scopeFromUnknown(ctx.scope);
};
const assertOwnedAtom = (runtime: ConnectedAgentRuntime, context: AuthenticatedContext, atomId: string): void => {
  const atom = runtime.profileAtoms().find((candidate) => candidate.id === atomId);
  if (atom === undefined) throw new Error("ATOM_NOT_FOUND");
  assertAuthenticatedIdentity(context, {
    tenantId: atom.tenant_id,
    subjectId: atom.subject_id
  });
};

export const buildServer = (
  runtime = new ConnectedAgentRuntime(),
  authentication: RequestAuthenticator | AuthenticatedContext = requestAuthenticatorFromEnvironment()
): FastifyInstance => {
  const authenticator =
    "authenticate" in authentication ? authentication : new StaticRequestAuthenticator(authentication);
  const requestContexts = new WeakMap<FastifyRequest, AuthenticatedContext>();
  const contextFor = (request: FastifyRequest): AuthenticatedContext => {
    const context = requestContexts.get(request);
    if (context === undefined) throw new Error("AUTHENTICATED_CONTEXT_REQUIRED");
    return context;
  };
  const server = Fastify({
    logger: process.env.NODE_ENV !== "test",
    bodyLimit: 1_048_576,
    requestIdHeader: "x-request-id"
  });
  server.get("/health", () => ({
    status: "ok",
    service: "meraki-core",
    contract_version: "0.1.0"
  }));
  server.addHook("onRequest", async (request, reply) => {
    if (request.url === "/health") return;
    try {
      requestContexts.set(request, await authenticator.authenticate(request.headers.authorization));
    } catch (error) {
      return reply.code(401).send({ error: errorCode(error, "AUTHENTICATED_CONTEXT_REQUIRED") });
    }
  });
  server.post<{ Body: CorrectionBody }>("/v1/corrections", async (request, reply) => {
    try {
      validateCorrection(request.body);
      const context = contextFor(request);
      assertAuthenticatedIdentity(context, request.body);
      const evidence = runtime.correction({
        ...request.body,
        tenantId: context.tenantId,
        subjectId: context.subjectId,
        actorId: context.actorId,
        scope: scopeFromUnknown(request.body.scope)
      });
      return reply.code(201).send({ evidence });
    } catch (error) {
      return sendError(reply, error, "INVALID_CORRECTION");
    }
  });
  server.post<{ Body: ActivityBody }>("/v1/activity", async (request, reply) => {
    try {
      validateActivity(request.body);
      const context = contextFor(request);
      assertAuthenticatedIdentity(context, request.body);
      return reply.code(201).send({
        evidence: runtime.activity({
          ...request.body,
          tenantId: context.tenantId,
          subjectId: context.subjectId,
          actorId: context.actorId,
          scope: scopeFromUnknown(request.body.scope)
        })
      });
    } catch (error) {
      return sendError(reply, error, "INVALID_ACTIVITY");
    }
  });
  server.post<{ Body: OutcomeBody }>("/v1/outcomes", async (request, reply) => {
    try {
      validateOutcome(request.body);
      const context = contextFor(request);
      assertAuthenticatedIdentity(context, request.body);
      return reply.code(201).send({
        evidence: runtime.outcome({
          ...request.body,
          tenantId: context.tenantId,
          subjectId: context.subjectId,
          scope: scopeFromUnknown(request.body.scope)
        })
      });
    } catch (error) {
      return sendError(reply, error, "INVALID_OUTCOME");
    }
  });
  server.post<{ Body: ActivityLessonBody }>("/v1/learning/candidates", async (request, reply) => {
    try {
      const sourceTrace = runtime.learningTrace(request.body.event_id);
      assertAuthenticatedIdentity(contextFor(request), {
        tenantId: sourceTrace.event.tenant_id,
        subjectId: sourceTrace.event.subject_id
      });
      return reply.code(201).send({
        lesson: runtime.extractActivityLesson({
          eventId: request.body.event_id,
          claim: request.body.claim,
          ...(request.body.facet === undefined ? {} : { facet: request.body.facet }),
          ...(request.body.temporal_horizon === undefined ? {} : { temporalHorizon: request.body.temporal_horizon })
        })
      });
    } catch (error) {
      return sendError(reply, error, "INVALID_ACTIVITY_LESSON");
    }
  });
  server.post<{ Body: RunBody }>("/v1/agent/run", async (request, reply) => {
    try {
      validateRun(request.body);
      const context = contextFor(request);
      assertAuthenticatedIdentity(context, {
        tenantId: request.body.context.tenant_id,
        subjectId: request.body.context.subject_id
      });
      const result = runtime.run({
        ...request.body,
        context: {
          ...request.body.context,
          tenant_id: context.tenantId,
          subject_id: context.subjectId,
          scope: scopeFromUnknown(request.body.context.scope)
        }
      });
      return reply.send(result);
    } catch (error) {
      return sendError(reply, error, "INVALID_RUN");
    }
  });
  server.get("/v1/profile/atoms", (request) => {
    const context = contextFor(request);
    return {
      items: runtime
        .profileAtoms()
        .filter((atom) => atom.tenant_id === context.tenantId && atom.subject_id === context.subjectId)
    };
  });
  server.get<{ Params: { eventId: string } }>("/v1/learning/trace/:eventId", async (request, reply) => {
    try {
      const trace = runtime.learningTrace(request.params.eventId);
      assertAuthenticatedIdentity(contextFor(request), {
        tenantId: trace.event.tenant_id,
        subjectId: trace.event.subject_id
      });
      return reply.send({ trace });
    } catch (error) {
      return sendError(reply, error, "LEARNING_TRACE_NOT_FOUND");
    }
  });
  server.get<{ Params: { id: string } }>("/v1/profile/atoms/:id/trace", async (request, reply) => {
    try {
      const trace = runtime.learningTraceForAtom(request.params.id);
      assertAuthenticatedIdentity(contextFor(request), {
        tenantId: trace.event.tenant_id,
        subjectId: trace.event.subject_id
      });
      return reply.send({ trace });
    } catch (error) {
      return sendError(reply, error, "ATOM_TRACE_NOT_FOUND");
    }
  });
  server.get("/v1/update-proposals", (request) => {
    const context = contextFor(request);
    return {
      items: runtime
        .updateProposals()
        .filter((proposal) => proposal.tenant_id === context.tenantId && proposal.subject_id === context.subjectId)
    };
  });
  server.post<{ Body: UpdateProposalBody }>("/v1/update-proposals", async (request, reply) => {
    try {
      assertOwnedAtom(runtime, contextFor(request), request.body.lesson_id);
      return reply.code(201).send({
        proposal: runtime.proposeUpdate(request.body.lesson_id, request.body.evidence_event_id, request.body.operation)
      });
    } catch (error) {
      return sendError(reply, error, "INVALID_UPDATE_PROPOSAL");
    }
  });
  server.post<{ Params: { id: string }; Body: UpdateProposalCommandBody }>(
    "/v1/update-proposals/:id/commands",
    async (request, reply) => {
      try {
        const proposal = runtime.updateProposals().find((candidate) => candidate.id === request.params.id);
        if (proposal === undefined) return reply.code(404).send({ error: "UPDATE_PROPOSAL_NOT_FOUND" });
        assertAuthenticatedIdentity(contextFor(request), {
          tenantId: proposal.tenant_id,
          subjectId: proposal.subject_id
        });
        const result =
          request.body.operation === "approve"
            ? runtime.applyUpdateProposal(request.params.id)
            : request.body.operation === "reject"
              ? { proposal: runtime.rejectUpdateProposal(request.params.id) }
              : runtime.rollbackUpdateProposal(request.params.id);
        return reply.send(result);
      } catch (error) {
        return sendError(reply, error, "INVALID_UPDATE_PROPOSAL_COMMAND");
      }
    }
  );
  server.get("/v1/runs", (request) => {
    const context = contextFor(request);
    return {
      items: runtime
        .recentRuns()
        .filter((run) => run.context.tenant_id === context.tenantId && run.context.subject_id === context.subjectId)
    };
  });
  server.get("/v1/evaluations", (request) => {
    const context = contextFor(request);
    return {
      items: runtime
        .evaluations()
        .filter(
          (entry) =>
            entry.evaluation.tenant_id === context.tenantId && entry.evaluation.subject_id === context.subjectId
        )
    };
  });
  server.post<{ Body: CausalEvaluationBody }>("/v1/evaluations/causal", async (request, reply) => {
    try {
      const input = request.body;
      const context = contextFor(request);
      assertAuthenticatedIdentity(context, input.correction);
      assertAuthenticatedIdentity(context, {
        tenantId: input.related.context.tenant_id,
        subjectId: input.related.context.subject_id
      });
      assertAuthenticatedIdentity(context, {
        tenantId: input.unrelated.context.tenant_id,
        subjectId: input.unrelated.context.subject_id
      });
      const report = evaluateConnectedCausalComparison({
        ...(input.experiment_id ? { experimentId: input.experiment_id } : {}),
        correction: {
          ...input.correction,
          tenantId: context.tenantId,
          subjectId: context.subjectId,
          actorId: context.actorId,
          scope: scopeFromUnknown(input.correction.scope)
        },
        related: {
          ...input.related,
          context: {
            ...input.related.context,
            tenant_id: context.tenantId,
            subject_id: context.subjectId,
            scope: scopeFromUnknown(input.related.context.scope)
          }
        },
        unrelated: {
          ...input.unrelated,
          context: {
            ...input.unrelated.context,
            tenant_id: context.tenantId,
            subject_id: context.subjectId,
            scope: scopeFromUnknown(input.unrelated.context.scope)
          }
        }
      });
      return reply.code(201).send({ report });
    } catch (error) {
      return sendError(reply, error, "INVALID_CAUSAL_EVALUATION");
    }
  });
  server.post<{ Body: EvaluationBody }>("/v1/evaluations", async (request, reply) => {
    try {
      const run = runtime.getRun(request.body.run_id);
      if (run === undefined) return reply.code(404).send({ error: "RUN_NOT_FOUND" });
      assertAuthenticatedIdentity(contextFor(request), {
        tenantId: run.context.tenant_id,
        subjectId: run.context.subject_id
      });
      const {
        run_id,
        experiment_id,
        arm_id,
        evaluator_class,
        criteria,
        result,
        uncertainty,
        reason,
        evaluator_identity_digest
      } = request.body;
      return reply.code(201).send({
        record: runtime.recordEvaluation({
          runId: run_id,
          experimentId: experiment_id,
          armId: arm_id,
          evaluatorClass: evaluator_class,
          criteria,
          result,
          uncertainty,
          ...(reason === undefined ? {} : { reason }),
          ...(evaluator_identity_digest === undefined ? {} : { evaluatorIdentityDigest: evaluator_identity_digest })
        })
      });
    } catch (error) {
      return sendError(reply, error, "INVALID_EVALUATION");
    }
  });
  server.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    const run = runtime.getRun(request.params.runId);
    if (run === undefined) return reply.code(404).send({ error: "RUN_NOT_FOUND" });
    assertAuthenticatedIdentity(contextFor(request), {
      tenantId: run.context.tenant_id,
      subjectId: run.context.subject_id
    });
    return reply.send(run);
  });
  server.post<{ Params: { id: string }; Body: AtomCommandBody }>(
    "/v1/profile/atoms/:id/commands",
    async (request, reply) => {
      try {
        assertOwnedAtom(runtime, contextFor(request), request.params.id);
        const { operation, expected_version, claim, mode } = request.body;
        if (request.body.atom_id !== request.params.id) throw new Error("ATOM_ID_MISMATCH");
        if (operation === "split")
          return reply.send({ atoms: runtime.split(request.params.id, request.body.claims ?? [], expected_version) });
        const atom =
          operation === "confirm"
            ? runtime.approve(request.params.id, expected_version)
            : operation === "edit"
              ? runtime.edit(request.params.id, claim ?? "", expected_version)
              : operation === "revoke"
                ? runtime.revoke(request.params.id, expected_version)
                : operation === "supersede"
                  ? runtime.supersede(request.params.id, expected_version)
                  : operation === "weaken"
                    ? runtime.weaken(request.params.id, request.body.counterevidence_event_id ?? "", expected_version)
                    : runtime.rescope(
                        request.params.id,
                        operation === "limit"
                          ? { level: "task", ref: "current-task" }
                          : scopeFromUnknown(request.body.scope),
                        mode,
                        expected_version
                      );
        return reply.send({ atom });
      } catch (error) {
        return sendError(reply, error, "INVALID_ATOM_COMMAND");
      }
    }
  );
  return server;
};

/** Loads and atomically saves the local runtime adapter when Fastify closes. */
export const buildPersistentServer = async (
  path: string,
  authentication: RequestAuthenticator | AuthenticatedContext = requestAuthenticatorFromEnvironment()
): Promise<FastifyInstance> => {
  const store = new JsonConnectedRuntimeStore(path);
  const runtime = await store.load();
  const server = buildServer(runtime, authentication);
  server.addHook("onClose", async () => {
    await store.save(runtime);
  });
  return server;
};

// pathToFileURL keeps the executable entrypoint check correct on Windows and POSIX.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3001);
  const server = await buildPersistentServer(process.env.MERAKI_RUNTIME_PATH ?? ".meraki/runtime.json");
  await server.listen({ port, host: "0.0.0.0" });
}
