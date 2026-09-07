import { CONTRACT_VERSION } from "@meraki/contracts";
import { parseHostedConfig } from "./config";
import { HostedHttpError, safeHttpErrorResponse } from "./errors";
import { assertAllowedRequestOrigin, createRequestId, privateResponseHeaders } from "./security";
import { checkHostedDatabase } from "./services";

export type HostedHealthDependencies = Readonly<{
  loadConfig: () => ReturnType<typeof parseHostedConfig>;
  requestId: () => string;
  checkDatabase: typeof checkHostedDatabase;
}>;

const productionDependencies: HostedHealthDependencies = {
  loadConfig: () => parseHostedConfig(process.env),
  requestId: () => createRequestId(),
  checkDatabase: checkHostedDatabase
};

export const handleHostedHealth = async (
  request: Request,
  dependencies: HostedHealthDependencies = productionDependencies
): Promise<Response> => {
  const requestId = dependencies.requestId();
  let config: ReturnType<typeof parseHostedConfig> | undefined;
  let origin: string | undefined;
  try {
    config = dependencies.loadConfig();
    origin = assertAllowedRequestOrigin(request.headers.get("origin"), config.allowedOrigins);
    await dependencies.checkDatabase(config);
    const headers = privateResponseHeaders(requestId, {
      ...(origin === undefined ? {} : { origin }),
      allowedOrigins: config.allowedOrigins
    });
    return Response.json(
      {
        status: "ok",
        service: "meraki-core",
        contract_version: CONTRACT_VERSION
      },
      { status: 200, headers }
    );
  } catch (error) {
    const headers = privateResponseHeaders(requestId, {
      ...(origin === undefined ? {} : { origin }),
      allowedOrigins: config?.allowedOrigins ?? []
    });
    if (error instanceof HostedHttpError) return safeHttpErrorResponse(error, requestId, headers);
    return Response.json(
      {
        status: "unavailable",
        service: "meraki-core"
      },
      { status: 503, headers }
    );
  }
};
