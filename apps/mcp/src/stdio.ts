import { buildMcpAdapterFromEnvironment, MerakiMcpAdapter, type McpRequest } from "./index.js";
import { MERAKI_MCP_TOOLS } from "./index.js";

type JsonRpcEnvelope = McpRequest & {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: { name?: string; arguments?: Record<string, unknown> };
};

const SERVER_INFO = { protocolVersion: "2024-11-05", capabilities: { tools: {} } } as const;
const emit = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
};
const toolDescriptors = MERAKI_MCP_TOOLS.map((name) => ({
  name,
  description: `Meraki Core ${name}`,
  inputSchema: { type: "object" }
}));

/** Minimal newline-delimited MCP host transport. Stdout is protocol-only; diagnostics stay on stderr. */
export const runStdioTransport = async (adapter: MerakiMcpAdapter): Promise<void> => {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  let pending = Promise.resolve();
  const handleLine = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    try {
      const request = JSON.parse(line) as McpRequest;
      const rpc = request as JsonRpcEnvelope;
      const isRpc = rpc.jsonrpc === "2.0";
      if (isRpc && rpc.method === "initialize") {
        emit({
          jsonrpc: "2.0",
          id: rpc.id,
          result: { ...SERVER_INFO, serverInfo: { name: "meraki-core", version: "0.0.0" } }
        });
      } else if (isRpc && rpc.method === "tools/list") {
        emit({ jsonrpc: "2.0", id: rpc.id, result: { tools: toolDescriptors } });
      } else if (isRpc && rpc.method === "tools/call") {
        const response = await adapter.handle({
          name: rpc.params?.name as McpRequest["name"],
          arguments: rpc.params?.arguments ?? {}
        });
        emit({ jsonrpc: "2.0", id: rpc.id, result: response });
      } else {
        emit(await adapter.handle(request));
      }
    } catch (error) {
      emit({
        isError: true,
        content: { code: error instanceof Error ? error.message : "MCP_PROTOCOL_REQUEST_FAILED" }
      });
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
