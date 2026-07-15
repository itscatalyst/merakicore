import { spawn } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("MCP stdio transport", () => {
  it("serves one request and exits cleanly when stdin closes", async () => {
    const child = spawn(process.execPath, [join(process.cwd(), "apps/mcp/dist/stdio.js")], {
      cwd: process.cwd(),
      env: { ...process.env, MERAKI_TENANT_ID: "tenant-a", MERAKI_SUBJECT_ID: "user-a", MERAKI_ACTOR_ID: "user-a", MERAKI_SESSION_ID: "stdio-test" },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code ?? -1));
    });
    child.stdin.write(`${JSON.stringify({ name: "meraki_get_guidance", arguments: { context: { contract: "task_context", tenant_id: "tenant-a", subject_id: "user-a", task_id: "stdio-task", task_type: "email", scope: { level: "project", ref: "acme" }, constraints: [], permissions: [], token_budget: 1000 } } })}\n`);
    child.stdin.end();
    const exitCode = await exitCodePromise;
    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toMatchObject({ content: { pack: { hash: expect.stringMatching(/^sha256:/) } } });
  // Child-process startup competes with the workspace's parallel TypeScript
  // transforms; keep a bounded 30s ceiling while still requiring natural exit.
  }, 30000);
});
