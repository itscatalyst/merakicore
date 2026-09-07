import type { MerakiApplication } from "@meraki/application";
import type { AuthenticatedContext } from "@meraki/auth";
import { readBoundedJsonBody } from "./body";
import { parseHostedConfig, type HostedConfig } from "./config";
import { HostedHttpError, safeHttpErrorResponse } from "./errors";
import { dispatchHostedRest, type HostedRestRequest, type HostedRestResult } from "./rest";
import { assertAllowedRequestOrigin, createRequestId, privateResponseHeaders } from "./security";
import { withHostedApplication } from "./services";

type ApplicationRunner = <T>(
  config: HostedConfig,
  authorizationHeader: string | null,
  operation: (context: Readonly<{ application: MerakiApplication; authority: AuthenticatedContext }>) => Promise<T>
) => Promise<T>;

export type HostedRestDependencies = Readonly<{
  loadConfig: () => HostedConfig;
  requestId: () => string;
  runWithApplication: ApplicationRunner;
}>;

const productionDependencies: HostedRestDependencies = {
  loadConfig: () => parseHostedConfig(process.env),
  requestId: () => createRequestId(),
  runWithApplication: withHostedApplication
};

const successfulResponse = (
  result: HostedRestResult,
  requestId: string,
  origin: string | undefined,
  config: HostedConfig
): Response => {
  const headers = privateResponseHeaders(requestId, {
    ...(origin === undefined ? {} : { origin }),
    allowedOrigins: config.allowedOrigins
  });
  for (const [name, value] of Object.entries(result.headers ?? {})) headers.set(name, value);
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers
  });
};

const preflightResponse = (requestId: string, origin: string | undefined, config: HostedConfig): Response => {
  if (origin === undefined) throw new HostedHttpError(403, "ORIGIN_NOT_ALLOWED");
  const headers = privateResponseHeaders(requestId, {
    origin,
    allowedOrigins: config.allowedOrigins
  });
  headers.set("access-control-allow-headers", "Authorization, Content-Type, Idempotency-Key, If-Match");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-max-age", "600");
  return new Response(null, { status: 204, headers });
};

/**
 * Next route-handler seam for the authenticated REST surface.
 *
 * Origin and configuration checks happen before authentication. Every
 * authenticated invocation receives a fresh Postgres-backed application and
 * the client is closed before this function returns.
 */
export const handleHostedRest = async (
  request: Request,
  path: readonly string[],
  dependencies: HostedRestDependencies = productionDependencies
): Promise<Response> => {
  const requestId = dependencies.requestId();
  let config: HostedConfig | undefined;
  let origin: string | undefined;
  try {
    const loadedConfig = dependencies.loadConfig();
    config = loadedConfig;
    origin = assertAllowedRequestOrigin(request.headers.get("origin"), loadedConfig.allowedOrigins);
    if (request.method === "OPTIONS") return preflightResponse(requestId, origin, loadedConfig);
    const method = request.method;
    if (method !== "GET" && method !== "POST") throw new HostedHttpError(404, "ROUTE_NOT_FOUND");
    const body = method === "POST" ? await readBoundedJsonBody(request, loadedConfig.maxRequestBytes) : undefined;

    return await dependencies.runWithApplication(
      loadedConfig,
      request.headers.get("authorization"),
      async ({ application, authority }) => {
        const result = await dispatchHostedRest(application, authority, {
          method,
          path,
          url: new URL(request.url),
          headers: request.headers,
          requestId,
          ...(body === undefined ? {} : { body })
        } satisfies HostedRestRequest);
        return successfulResponse(result, requestId, origin, loadedConfig);
      }
    );
  } catch (error) {
    const headers = privateResponseHeaders(requestId, {
      ...(origin === undefined ? {} : { origin }),
      allowedOrigins: config?.allowedOrigins ?? []
    });
    return safeHttpErrorResponse(error, requestId, headers);
  }
};
