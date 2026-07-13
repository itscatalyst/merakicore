import Fastify, { type FastifyInstance } from "fastify";
import type { TaskContext } from "@meraki/contracts";
import { ConnectedAgentRuntime, scopeFromUnknown } from "./runtime.js";

type CorrectionBody = { tenantId: string; subjectId: string; actorId: string; runId: string; taskType: string; scope: unknown; mode?: string; original: string; correction: string };
type RunBody = { context: Omit<TaskContext, "scope"> & { scope: unknown }; request: string; baseline: string };

export const buildServer = (runtime = new ConnectedAgentRuntime()): FastifyInstance => {
  const server = Fastify({ logger: false });
  server.post<{ Body: CorrectionBody }>("/v1/corrections", async (request, reply) => {
    try {
      const evidence = runtime.correction({ ...request.body, scope: scopeFromUnknown(request.body.scope) });
      return reply.code(201).send({ evidence });
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_CORRECTION" }); }
  });
  server.post<{ Body: CorrectionBody }>("/v1/learning", async (request, reply) => {
    try {
      const receipt = runtime.learn({ ...request.body, scope: scopeFromUnknown(request.body.scope) });
      return reply.code(201).send(receipt);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_LEARNING" }); }
  });
  server.post<{ Body: RunBody }>("/v1/agent/run", async (request, reply) => {
    try {
      const result = runtime.run({ ...request.body, context: { ...request.body.context, scope: scopeFromUnknown(request.body.context.scope) } });
      return reply.send(result);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "INVALID_RUN" }); }
  });
  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3001);
  const server = buildServer();
  await server.listen({ port, host: "0.0.0.0" });
}
