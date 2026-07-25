import type { TaskContext } from "@meraki/contracts";
import { ConnectedAgentRuntime } from "@meraki/api";
import {
  assertAuthenticatedIdentity,
  requestAuthenticatorFromEnvironment,
  type AuthenticatedContext
} from "@meraki/security";

export const MERAKI_MCP_TOOLS = [
  "meraki_get_guidance",
  "meraki_get_examples",
  "meraki_explain_guidance",
  "meraki_record_feedback",
  "meraki_record_outcome"
] as const;
export type MerakiMcpTool = (typeof MERAKI_MCP_TOOLS)[number];
export type McpRequest = Readonly<{ name: MerakiMcpTool; arguments: Record<string, unknown> }>;
export type McpResponse = Readonly<{ content: unknown; isError?: boolean }>;

type ContextInput = Omit<TaskContext, "scope"> & { scope: unknown };
const context = (value: unknown): TaskContext => {
  if (!value || typeof value !== "object") throw new Error("TASK_CONTEXT_REQUIRED");
  const input = value as ContextInput;
  if (
    typeof input.tenant_id !== "string" ||
    typeof input.subject_id !== "string" ||
    typeof input.task_id !== "string" ||
    typeof input.task_type !== "string" ||
    !input.scope
  )
    throw new Error("TASK_CONTEXT_INCOMPLETE");
  const scope = input.scope as TaskContext["scope"];
  if (
    !scope ||
    typeof scope !== "object" ||
    !["run", "task", "project", "mode", "domain", "workspace", "relationship", "user", "team"].includes(scope.level) ||
    (scope.ref !== undefined && typeof scope.ref !== "string")
  )
    throw new Error("SCOPE_INVALID");
  if (
    !Array.isArray(input.constraints) ||
    !Array.isArray(input.permissions) ||
    typeof input.token_budget !== "number" ||
    (input.mode !== undefined && typeof input.mode !== "string")
  )
    throw new Error("TASK_CONTEXT_INVALID");
  return { ...input, scope };
};
const object = (value: unknown, code: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
};
const stringField = (value: unknown, code: string): string =>
  typeof value === "string" && value.trim()
    ? value
    : (() => {
        throw new Error(code);
      })();
const feedback = (value: unknown) => {
  const input = object(value, "INVALID_FEEDBACK");
  for (const key of ["tenantId", "subjectId", "actorId", "runId", "taskType", "activityType"])
    stringField(input[key], `${key.toUpperCase()}_REQUIRED`);
  stringField(input.content, "ACTIVITY_CONTENT_REQUIRED");
  object(input.scope, "SCOPE_REQUIRED");
  return input as Parameters<ConnectedAgentRuntime["activity"]>[0];
};
const outcome = (value: unknown) => {
  const input = object(value, "INVALID_OUTCOME");
  for (const key of ["tenantId", "subjectId", "runId", "outcomeType"])
    stringField(input[key], `${key.toUpperCase()}_REQUIRED`);
  object(input.outcome, "OUTCOME_REQUIRED");
  object(input.scope, "SCOPE_REQUIRED");
  return input as Parameters<ConnectedAgentRuntime["outcome"]>[0];
};

/** Typed MCP-facing adapter. It exposes retrieval and evidence/outcome ingestion only; profile writes remain governed by Studio/API commands. */
export class MerakiMcpAdapter {
  constructor(
    private readonly runtime: ConnectedAgentRuntime,
    private readonly authority: AuthenticatedContext
  ) {}

  handle(request: McpRequest): Promise<McpResponse> {
    return Promise.resolve(this.dispatch(request));
  }

  private dispatch(request: McpRequest): McpResponse {
    try {
      switch (request.name as string) {
        case "meraki_get_guidance": {
          const taskContext = context(request.arguments.context);
          assertAuthenticatedIdentity(this.authority, {
            tenantId: taskContext.tenant_id,
            subjectId: taskContext.subject_id
          });
          return { content: this.runtime.retrieve(taskContext) };
        }
        case "meraki_get_examples": {
          const taskContext = context(request.arguments.context);
          assertAuthenticatedIdentity(this.authority, {
            tenantId: taskContext.tenant_id,
            subjectId: taskContext.subject_id
          });
          return {
            content: this.runtime
              .retrieve(taskContext)
              .pack.items.map((item) => ({ atom: item.atom, example: item.guidance, provenance: item.reason }))
          };
        }
        case "meraki_explain_guidance": {
          const taskContext = context(request.arguments.context);
          assertAuthenticatedIdentity(this.authority, {
            tenantId: taskContext.tenant_id,
            subjectId: taskContext.subject_id
          });
          const retrieved = this.runtime.retrieve(taskContext);
          return {
            content: {
              candidates: retrieved.candidates,
              pack: { id: retrieved.pack.id, hash: retrieved.pack.hash, atomManifest: retrieved.pack.atom_manifest }
            }
          };
        }
        case "meraki_record_feedback": {
          const input = feedback(request.arguments);
          assertAuthenticatedIdentity(this.authority, input);
          return { content: { evidence: this.runtime.activity(input) } };
        }
        case "meraki_record_outcome": {
          const input = outcome(request.arguments);
          assertAuthenticatedIdentity(this.authority, input);
          return { content: { evidence: this.runtime.outcome(input) } };
        }
      }
      throw new Error("UNKNOWN_MCP_TOOL");
    } catch (error) {
      return {
        isError: true,
        content: {
          code:
            typeof error === "object" &&
            error &&
            "code" in error &&
            typeof (error as { code?: unknown }).code === "string"
              ? (error as { code: string }).code
              : error instanceof Error
                ? error.message
                : "MCP_REQUEST_FAILED"
        }
      };
    }
  }
}

export async function buildMcpAdapterFromEnvironment(): Promise<MerakiMcpAdapter> {
  const token = process.env.MERAKI_MCP_TOKEN;
  if (!token) throw new Error("MERAKI_MCP_TOKEN is required");
  const authority = await requestAuthenticatorFromEnvironment().authenticate(`Bearer ${token}`);
  return new MerakiMcpAdapter(new ConnectedAgentRuntime(), authority);
}
