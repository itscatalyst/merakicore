import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { signTestJwt } from "@meraki/auth";
import { MERAKI_MCP_TOOL_DESCRIPTORS } from "@meraki/mcp-tools";
import { describe, expect, it } from "vitest";

type RpcResponse = {
  jsonrpc: string;
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};
type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
type ToolResult = {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
};

const jwt = {
  secret: new TextEncoder().encode("meraki-stdio-secret-that-is-at-least-32-bytes"),
  issuer: "https://auth.meraki.test",
  audience: "meraki-core"
} as const;

const runSession = async (lines: string[]): Promise<{ responses: RpcResponse[]; stderr: string; exitCode: number }> => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "meraki-mcp-stdio-"));
  try {
    const token = await signTestJwt(
      {
        tenant_id: "tenant-a",
        subject_id: "user-a",
        actor_id: "user-a",
        session_id: "stdio-test",
        scope: ["profile:read", "evidence:write"]
      },
      jwt
    );
    const child = spawn(process.execPath, [join(process.cwd(), "apps/mcp/dist/stdio.js")], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MERAKI_JWT_SECRET: "meraki-stdio-secret-that-is-at-least-32-bytes",
        MERAKI_JWT_ISSUER: jwt.issuer,
        MERAKI_JWT_AUDIENCE: jwt.audience,
        MERAKI_MCP_TOKEN: token,
        MERAKI_RUNTIME_PATH: join(temporaryDirectory, "runtime.json")
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });
    child.stdin.end(`${lines.join("\n")}\n`);
    const exitCode = await exitCodePromise;
    return {
      responses: stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RpcResponse),
      stderr,
      exitCode
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};

const initialize = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "stdio-test", version: "1.0.0" }
  }
});
const initialized = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });

describe("MCP stdio transport", () => {
  it("completes the MCP lifecycle, advertises useful schemas, returns content blocks, and exits on EOF", async () => {
    const session = await runSession([
      initialize,
      initialized,
      JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 999, reason: "notification must stay silent" }
      }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "meraki_get_guidance",
          arguments: {
            context: {
              contract: "task_context",
              tenant_id: "tenant-a",
              subject_id: "user-a",
              task_id: "stdio-task",
              task_type: "email",
              scope: { level: "project", ref: "acme" },
              constraints: [],
              permissions: [],
              token_budget: 1000
            }
          }
        }
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "meraki_record_feedback",
          arguments: {
            tenantId: "tenant-a",
            subjectId: "user-a",
            actorId: "user-a",
            runId: "stdio-feedback",
            taskType: "email",
            activityType: "edit",
            content: "Use a concise subject",
            scope: { level: "project", ref: "acme" },
            mode: "concise",
            payload: { before: "Long subject", after: "Concise subject" }
          }
        }
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "meraki_list_candidates", arguments: {} }
      }),
      JSON.stringify({ jsonrpc: "2.0", id: 6, method: "ping" })
    ]);

    expect(session.stderr).toBe("");
    expect(session.exitCode).toBe(0);
    expect(session.responses.map((response) => response.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(session.responses[0]).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "meraki-core" }
      }
    });

    const tools = (session.responses[1]?.result as { tools: ToolDescriptor[] }).tools;
    expect(tools).toEqual(MERAKI_MCP_TOOL_DESCRIPTORS);
    expect(tools.slice(0, 5).map((tool) => tool.name)).toEqual([
      "meraki_get_guidance",
      "meraki_get_examples",
      "meraki_explain_guidance",
      "meraki_record_feedback",
      "meraki_record_outcome"
    ]);
    expect(tools.map((tool) => tool.name)).toContain("meraki_propose_candidate");
    expect(tools.map((tool) => tool.name)).toContain("meraki_approve_candidate");
    expect(tools.map((tool) => tool.name)).toContain("meraki_get_learning_trace");
    expect(tools.every((tool) => tool.description.length > 20)).toBe(true);
    expect(tools.find((tool) => tool.name === "meraki_get_guidance")?.inputSchema).toMatchObject({
      type: "object",
      required: ["context"],
      additionalProperties: false,
      properties: {
        context: {
          type: "object",
          required: expect.arrayContaining([
            "contract",
            "tenant_id",
            "subject_id",
            "task_id",
            "task_type",
            "scope",
            "constraints",
            "permissions",
            "token_budget"
          ]),
          additionalProperties: false
        }
      }
    });
    expect(tools.find((tool) => tool.name === "meraki_record_feedback")?.inputSchema).toMatchObject({
      required: expect.arrayContaining(["activityType", "content", "scope"])
    });
    expect(tools.find((tool) => tool.name === "meraki_record_outcome")?.inputSchema).toMatchObject({
      required: expect.arrayContaining(["runId", "outcomeType", "outcome", "scope"])
    });

    const result = session.responses[2]?.result as ToolResult;
    expect(result).toMatchObject({ content: [{ type: "text", text: expect.any(String) }] });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]?.text ?? "{}")).toMatchObject({
      pack: { hash: expect.stringMatching(/^sha256:/) }
    });
    const feedback = session.responses[3]?.result as ToolResult;
    expect(feedback.isError).toBeUndefined();
    expect(JSON.parse(feedback.content[0]?.text ?? "{}")).toMatchObject({
      evidence: {
        source: { trust_class: "explicit_user" },
        event: { event_type: "edit" }
      }
    });
    const candidates = session.responses[4]?.result as ToolResult;
    expect(candidates.isError).toBeUndefined();
    expect(JSON.parse(candidates.content[0]?.text ?? "{}")).toEqual({ candidates: [] });
    expect(session.responses[5]).toEqual({ jsonrpc: "2.0", id: 6, result: {} });
  }, 30_000);

  it("uses JSON-RPC errors for protocol failures and content-block errors for tool failures", async () => {
    const session = await runSession([
      initialize,
      initialized,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "not_a_meraki_tool", arguments: {} }
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "meraki_get_guidance", arguments: {} }
      }),
      JSON.stringify({ jsonrpc: "2.0", id: 4, method: "unknown/method" }),
      JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "meraki_record_outcome", arguments: {} }
      })
    ]);

    expect(session.stderr).toBe("");
    expect(session.exitCode).toBe(0);
    expect(session.responses.map((response) => response.id)).toEqual([1, 2, 3, 4]);
    expect(session.responses[1]).toMatchObject({
      error: { code: -32602, message: "Unknown tool" }
    });
    const toolFailure = session.responses[2]?.result as ToolResult;
    expect(toolFailure).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.any(String) }]
    });
    expect(JSON.parse(toolFailure.content[0]?.text ?? "{}")).toEqual({ code: "TASK_CONTEXT_REQUIRED" });
    expect(session.responses[3]).toMatchObject({
      error: { code: -32601, message: "Method not found" }
    });
  }, 30_000);

  it("reports malformed input deterministically without responding to notifications", async () => {
    const session = await runSession([
      "{",
      "[]",
      JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/unknown", params: {} })
    ]);

    expect(session.stderr).toBe("");
    expect(session.exitCode).toBe(0);
    expect(session.responses).toEqual([
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } },
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }
    ]);
  }, 30_000);
});
