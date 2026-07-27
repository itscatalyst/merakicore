import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envPath = process.env.MERAKI_MCP_ENV_PATH ?? resolve(repositoryRoot, ".meraki", "mcp.env");

const loadEnvironment = async () => {
  const source = await readFile(envPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error(`MERAKI_MCP_ENV_NOT_FOUND: run the local MCP setup first (${envPath})`);
    }
    throw error;
  });

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.replace(/^\uFEFF/u, "").trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`MERAKI_MCP_ENV_INVALID: ${rawLine}`);
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (process.env[name] === undefined) process.env[name] = value;
  }
};

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

await loadEnvironment();

const configuredRuntimePath = process.env.MERAKI_RUNTIME_PATH ?? ".meraki/runtime.json";
process.env.MERAKI_RUNTIME_PATH = isAbsolute(configuredRuntimePath)
  ? configuredRuntimePath
  : resolve(repositoryRoot, configuredRuntimePath);

const secret = required("MERAKI_JWT_SECRET");
if (Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("MERAKI_JWT_SECRET must contain at least 32 UTF-8 bytes");
}

const { signTestJwt } = await import("../packages/auth/dist/index.js");
process.env.MERAKI_MCP_TOKEN = await signTestJwt(
  {
    tenant_id: process.env.MERAKI_TENANT_ID ?? "local",
    subject_id: process.env.MERAKI_SUBJECT_ID ?? "builder",
    actor_id: process.env.MERAKI_ACTOR_ID ?? process.env.MERAKI_SUBJECT_ID ?? "builder",
    session_id: process.env.MERAKI_SESSION_ID ?? `mcp-${process.pid}`,
    scope: ["profile:read", "profile:write", "evidence:write", "evaluation:write"]
  },
  {
    secret: new TextEncoder().encode(secret),
    issuer: required("MERAKI_JWT_ISSUER"),
    audience: required("MERAKI_JWT_AUDIENCE")
  },
  "12h"
);

const [{ buildMcpAdapterFromEnvironment }, { runStdioTransport }] = await Promise.all([
  import("../apps/mcp/dist/index.js"),
  import("../apps/mcp/dist/stdio.js")
]);

await runStdioTransport(await buildMcpAdapterFromEnvironment());
