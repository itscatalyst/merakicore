import type { TaskContext } from "@meraki/contracts";
import type { ExplicitActivityType } from "@meraki/evidence";
import { ConnectedAgentRuntime } from "@meraki/api";

export const MERAKI_MCP_TOOLS = ["meraki_get_guidance", "meraki_get_examples", "meraki_explain_guidance", "meraki_record_feedback", "meraki_record_outcome"] as const;
export type MerakiMcpTool = typeof MERAKI_MCP_TOOLS[number];
export type McpRequest = Readonly<{ name: MerakiMcpTool; arguments: Record<string, unknown> }>;
export type McpResponse = Readonly<{ content: unknown; isError?: boolean }>;

type ContextInput = Omit<TaskContext, "scope"> & { scope: unknown };
const context = (value: unknown): TaskContext => {
  if (!value || typeof value !== "object") throw new Error("TASK_CONTEXT_REQUIRED");
  const input = value as ContextInput;
  if (!input.tenant_id || !input.subject_id || !input.task_id || !input.task_type || !input.scope) throw new Error("TASK_CONTEXT_INCOMPLETE");
  const scope = input.scope as TaskContext["scope"];
  if (typeof scope.level !== "string") throw new Error("SCOPE_REQUIRED");
  return { ...input, scope } as TaskContext;
};

/** Typed MCP-facing adapter. It exposes retrieval and evidence/outcome ingestion only; profile writes remain governed by Studio/API commands. */
export class MerakiMcpAdapter {
  constructor(private readonly runtime = new ConnectedAgentRuntime()) {}

  async handle(request: McpRequest): Promise<McpResponse> {
    try {
      switch (request.name) {
        case "meraki_get_guidance": return { content: this.runtime.retrieve(context(request.arguments.context)) };
        case "meraki_get_examples": return { content: this.runtime.retrieve(context(request.arguments.context)).pack.items.map((item) => ({ atom: item.atom, example: item.guidance, provenance: item.reason })) };
        case "meraki_explain_guidance": {
          const retrieved = this.runtime.retrieve(context(request.arguments.context));
          return { content: { candidates: retrieved.candidates, pack: { id: retrieved.pack.id, hash: retrieved.pack.hash, atomManifest: retrieved.pack.atom_manifest } } };
        }
        case "meraki_record_feedback": {
          const input = request.arguments as { tenantId: string; subjectId: string; actorId: string; runId: string; taskType: string; activityType: ExplicitActivityType; content: string; scope: TaskContext["scope"]; mode?: string; payload?: Record<string, unknown> };
          return { content: { evidence: this.runtime.activity(input) } };
        }
        case "meraki_record_outcome": {
          const input = request.arguments as { tenantId: string; subjectId: string; runId: string; outcomeType: string; outcome: Record<string, unknown>; scope: TaskContext["scope"]; mode?: string };
          return { content: { evidence: this.runtime.outcome(input) } };
        }
      }
    } catch (error) { return { isError: true, content: { code: error instanceof Error ? error.message : "MCP_REQUEST_FAILED" } }; }
  }
}
