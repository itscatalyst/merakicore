import { spawn } from "node:child_process";
import { join } from "node:path";
import { signTestJwt } from "@meraki/auth";
import { describe, expect, it } from "vitest";

describe("MCP stdio transport", () => {
  it("serves one request and exits cleanly when stdin closes", async () => {
    const jwt = {
      secret: new TextEncoder().encode("meraki-stdio-secret-that-is-at-least-32-bytes"),
      issuer: "https://auth.meraki.test",
      audience: "meraki-core"
    } as const;
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
        MERAKI_MCP_TOKEN: token
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
    const request = {
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
    };
    child.stdin.write(`${JSON.stringify(request)}\n`);
    child.stdin.end();
    const exitCode = await exitCodePromise;
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ content: { pack: { hash: expect.stringMatching(/^sha256:/) } } });
    // Child-process startup competes with the workspace's parallel TypeScript
    // transforms; keep a bounded 30s ceiling while still requiring natural exit.
  }, 30000);
});
