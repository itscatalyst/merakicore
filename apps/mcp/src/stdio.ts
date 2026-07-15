import { MerakiMcpAdapter, type McpRequest } from "./index.js";
import { MERAKI_MCP_TOOLS } from "./index.js";

/** Minimal newline-delimited MCP host transport. Stdout is protocol-only; diagnostics stay on stderr. */
export const runStdioTransport = async (adapter = new MerakiMcpAdapter()): Promise<void> => {
  process.stdin.setEncoding("utf8");
  let buffer = "";
  let pending = Promise.resolve();
  const handleLine = async (line: string): Promise<void> => {
    if (!line.trim()) return;
    try {
      const request = JSON.parse(line) as McpRequest;
      const rpc = request as McpRequest & { jsonrpc?: string; id?: string | number; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
      if (rpc.jsonrpc === "2.0" && rpc.method === "initialize") {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "meraki-core", version: "0.0.0" } } })}\n`);
      } else if (rpc.jsonrpc === "2.0" && rpc.method === "tools/list") {
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: MERAKI_MCP_TOOLS.map((name) => ({ name, description: `Meraki Core ${name}`, inputSchema: { type: "object" } })) } })}\n`);
      } else if (rpc.jsonrpc === "2.0" && rpc.method === "tools/call") {
        const response = await adapter.handle({ name: rpc.params?.name as McpRequest["name"], arguments: rpc.params?.arguments ?? {} });
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: response })}\n`);
      } else {
        const response = await adapter.handle(request);
        process.stdout.write(`${JSON.stringify(response)}\n`);
      }
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ isError: true, content: { code: error instanceof Error ? error.message : "MCP_PROTOCOL_REQUEST_FAILED" } })}\n`);
    }
  };
  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) pending = pending.then(() => handleLine(line));
  });
  process.stdin.resume();
  await new Promise<void>((resolve) => {
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
  if (buffer.trim()) pending = pending.then(() => handleLine(buffer));
  await pending;
};

if (process.argv[1] && process.argv[1].endsWith("stdio.js")) void runStdioTransport().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : "MCP_TRANSPORT_FAILED"}\n`); process.exitCode = 1; });
