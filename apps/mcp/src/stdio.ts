import {
  buildMcpAdapterFromEnvironment,
  MERAKI_MCP_TOOLS,
  MerakiMcpAdapter,
  type McpRequest,
  type McpResponse
} from "./index.js";

type JsonRpcId = string | number | null;
type JsonRpcEnvelope = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

const SERVER_INFO = { protocolVersion: "2024-11-05", capabilities: { tools: { listChanged: false } } } as const;
const emit = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value: object, property: string): boolean => Object.prototype.hasOwnProperty.call(value, property);
const jsonRpcId = (value: unknown): JsonRpcId =>
  typeof value === "string" || typeof value === "number" || value === null ? value : null;
const emitError = (id: JsonRpcId, code: number, message: string): void => {
  emit({ jsonrpc: "2.0", id, error: { code, message } });
};
const nonEmptyString = { type: "string", minLength: 1 } as const;
const scopeSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        level: { const: "user" },
        ref: nonEmptyString
      },
      required: ["level"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        level: {
          enum: ["run", "task", "project", "mode", "domain", "workspace", "relationship", "team"]
        },
        ref: nonEmptyString
      },
      required: ["level", "ref"],
      additionalProperties: false
    }
  ]
} as const;
const taskContextSchema = {
  type: "object",
  properties: {
    contract: { const: "task_context" },
    tenant_id: nonEmptyString,
    subject_id: nonEmptyString,
    task_id: nonEmptyString,
    task_type: nonEmptyString,
    scope: scopeSchema,
    mode: nonEmptyString,
    goal_id: nonEmptyString,
    constraints: { type: "array", items: { type: "string" } },
    permissions: { type: "array", items: nonEmptyString, uniqueItems: true },
    token_budget: { type: "integer", minimum: 0 }
  },
  required: [
    "contract",
    "tenant_id",
    "subject_id",
    "task_id",
    "task_type",
    "scope",
    "constraints",
    "permissions",
    "token_budget"
  ],
  additionalProperties: false
} as const;
const contextInputSchema = {
  type: "object",
  properties: { context: taskContextSchema },
  required: ["context"],
  additionalProperties: false
} as const;
const consentSchema = {
  type: "object",
  properties: {
    status: { enum: ["granted", "denied", "revoked"] },
    purposes: { type: "array", items: { type: "string" }, uniqueItems: true },
    recorded_at: { type: "string", format: "date-time" }
  },
  required: ["status", "purposes", "recorded_at"],
  additionalProperties: false
} as const;
const feedbackInputSchema = {
  type: "object",
  properties: {
    tenantId: nonEmptyString,
    subjectId: nonEmptyString,
    actorId: nonEmptyString,
    runId: nonEmptyString,
    taskType: nonEmptyString,
    activityType: {
      enum: ["approval", "rejection", "choice", "correction", "edit", "example", "workflow_action", "outcome"]
    },
    content: nonEmptyString,
    scope: scopeSchema,
    mode: nonEmptyString,
    payload: { type: "object", additionalProperties: true },
    consent: consentSchema
  },
  required: ["tenantId", "subjectId", "actorId", "runId", "taskType", "activityType", "content", "scope"],
  additionalProperties: false
} as const;
const outcomeInputSchema = {
  type: "object",
  properties: {
    tenantId: nonEmptyString,
    subjectId: nonEmptyString,
    runId: nonEmptyString,
    outcomeType: nonEmptyString,
    outcome: { type: "object", additionalProperties: true },
    scope: scopeSchema,
    mode: nonEmptyString
  },
  required: ["tenantId", "subjectId", "runId", "outcomeType", "outcome", "scope"],
  additionalProperties: false
} as const;
const toolDefinitions = {
  meraki_get_guidance: {
    description: "Retrieve scoped, active Meraki guidance for one authenticated task context.",
    inputSchema: contextInputSchema
  },
  meraki_get_examples: {
    description: "Retrieve scoped guidance as examples with atom provenance.",
    inputSchema: contextInputSchema
  },
  meraki_explain_guidance: {
    description: "Explain which profile candidates were included or excluded from a guidance pack.",
    inputSchema: contextInputSchema
  },
  meraki_record_feedback: {
    description: "Record explicit user feedback as immutable evidence; this does not activate a profile rule.",
    inputSchema: feedbackInputSchema
  },
  meraki_record_outcome: {
    description: "Record an externally observed outcome as immutable evidence.",
    inputSchema: outcomeInputSchema
  }
} as const satisfies Record<McpRequest["name"], { description: string; inputSchema: object }>;
const toolDescriptors = MERAKI_MCP_TOOLS.map((name) => ({ name, ...toolDefinitions[name] }));
const isToolName = (value: string): value is McpRequest["name"] =>
  (MERAKI_MCP_TOOLS as readonly string[]).includes(value);
const callToolResult = (response: McpResponse) => {
  const serialized = JSON.stringify(response.content);
  return {
    content: [{ type: "text" as const, text: serialized === undefined ? "null" : serialized }],
    ...(response.isError === true ? { isError: true } : {})
  };
};

/** Minimal newline-delimited MCP host transport. Stdout is protocol-only; diagnostics stay on stderr. */
export const runStdioTransport = async (adapter: MerakiMcpAdapter): Promise<void> => {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  let pending = Promise.resolve();
  const handleLine = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      emitError(null, -32700, "Parse error");
      return;
    }
    if (!isRecord(parsed)) {
      emitError(null, -32600, "Invalid Request");
      return;
    }
    const rpc = parsed as JsonRpcEnvelope;
    if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
      emitError(hasOwn(parsed, "id") ? jsonRpcId(rpc.id) : null, -32600, "Invalid Request");
      return;
    }
    const hasId = hasOwn(parsed, "id");
    const id = hasId ? jsonRpcId(rpc.id) : null;
    if (hasId && id === null && rpc.id !== null) {
      emitError(null, -32600, "Invalid Request");
      return;
    }
    // MCP requests require an id. Do not execute request-shaped notifications,
    // especially mutation tools, because the caller cannot receive a result.
    if (!hasId) return;
    try {
      if (rpc.method === "initialize") {
        emit({
          jsonrpc: "2.0",
          id,
          result: { ...SERVER_INFO, serverInfo: { name: "meraki-core", version: "0.0.0" } }
        });
      } else if (rpc.method === "ping") {
        emit({ jsonrpc: "2.0", id, result: {} });
      } else if (rpc.method === "tools/list") {
        emit({ jsonrpc: "2.0", id, result: { tools: toolDescriptors } });
      } else if (rpc.method === "tools/call") {
        if (!isRecord(rpc.params) || typeof rpc.params.name !== "string") {
          emitError(id, -32602, "Invalid params");
          return;
        }
        if (!isToolName(rpc.params.name)) {
          emitError(id, -32602, "Unknown tool");
          return;
        }
        if (rpc.params.arguments !== undefined && !isRecord(rpc.params.arguments)) {
          emitError(id, -32602, "Invalid params");
          return;
        }
        const response = await adapter.handle({
          name: rpc.params.name,
          arguments: rpc.params.arguments ?? {}
        });
        emit({ jsonrpc: "2.0", id, result: callToolResult(response) });
      } else {
        emitError(id, -32601, "Method not found");
      }
    } catch {
      emitError(id, -32603, "Internal error");
    }
  };
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) pending = pending.then(() => handleLine(line));
  });
  const inputClosed = new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      // Release the stdin handle after the host has signalled EOF so Node can
      // terminate naturally; this is stream cleanup, not process termination.
      process.stdin.destroy();
      resolve();
    };
    process.stdin.once("end", finish);
    process.stdin.once("close", finish);
  });
  // Install EOF listeners before entering flowing mode. Otherwise a fast
  // writer can close stdin between resume() and listener registration,
  // leaving the transport waiting forever despite having received EOF.
  process.stdin.resume();
  await inputClosed;
  if (buffer.trim()) pending = pending.then(() => handleLine(buffer));
  await pending;
};

if (process.argv[1] && process.argv[1].endsWith("stdio.js"))
  void buildMcpAdapterFromEnvironment()
    .then(runStdioTransport)
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "MCP_TRANSPORT_FAILED"}\n`);
      process.exitCode = 1;
    });
