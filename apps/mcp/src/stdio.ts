import {
  buildMcpAdapterFromEnvironment,
  isMerakiMcpTool,
  MERAKI_MCP_TOOL_DESCRIPTORS,
  MerakiMcpRegistry,
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
const callToolResult = (response: McpResponse) => {
  const serialized = JSON.stringify(response.content);
  return {
    content: [{ type: "text" as const, text: serialized === undefined ? "null" : serialized }],
    ...(response.isError === true ? { isError: true } : {})
  };
};

/** Newline-delimited stdio framing only. All tool semantics and descriptors live in @meraki/mcp-tools. */
export const runStdioTransport = async (registry: MerakiMcpRegistry): Promise<void> => {
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
    // Never execute request-shaped notifications, especially mutations:
    // a caller without an id cannot receive or reconcile the result.
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
        emit({ jsonrpc: "2.0", id, result: { tools: MERAKI_MCP_TOOL_DESCRIPTORS } });
      } else if (rpc.method === "tools/call") {
        if (!isRecord(rpc.params) || typeof rpc.params.name !== "string") {
          emitError(id, -32602, "Invalid params");
          return;
        }
        if (!isMerakiMcpTool(rpc.params.name)) {
          emitError(id, -32602, "Unknown tool");
          return;
        }
        if (rpc.params.arguments !== undefined && !isRecord(rpc.params.arguments)) {
          emitError(id, -32602, "Invalid params");
          return;
        }
        const response = await registry.handle({
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
      process.stdin.destroy();
      resolve();
    };
    process.stdin.once("end", finish);
    process.stdin.once("close", finish);
  });
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
