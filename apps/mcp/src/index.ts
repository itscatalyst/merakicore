import { requestAuthenticatorFromEnvironment } from "@meraki/auth";
import { createInMemoryApplication } from "@meraki/application";
import { MerakiMcpRegistry } from "@meraki/mcp-tools";
import { JsonConnectedRuntimeStore } from "@meraki/storage-local";

export {
  isMerakiMcpTool,
  MERAKI_MCP_REGISTRY,
  MERAKI_MCP_TOOL_DESCRIPTORS,
  MERAKI_MCP_TOOLS,
  MerakiMcpRegistry,
  MerakiMcpRegistry as MerakiMcpAdapter,
  type McpRequest,
  type McpResponse,
  type MerakiMcpTool
} from "@meraki/mcp-tools";

export async function buildMcpAdapterFromEnvironment(): Promise<MerakiMcpRegistry> {
  const token = process.env.MERAKI_MCP_TOKEN;
  if (!token) throw new Error("MERAKI_MCP_TOKEN is required");
  const authority = await requestAuthenticatorFromEnvironment().authenticate(`Bearer ${token}`);
  const store = new JsonConnectedRuntimeStore(process.env.MERAKI_RUNTIME_PATH ?? ".meraki/runtime.json");
  const runtime = await store.load();
  const { application } = createInMemoryApplication(runtime, (_identity, candidate) => store.save(candidate));
  return new MerakiMcpRegistry(application, authority);
}
