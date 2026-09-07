import { MerakiApplicationService, type MerakiApplication } from "@meraki/application";
import type { AuthenticatedContext } from "@meraki/auth";
import {
  PostgresAccessTokenAuthenticator,
  PostgresRuntimeUnitOfWork,
  createPostgresClient,
  type TransactionalSqlClient
} from "@meraki/storage-postgres";
import type { HostedConfig } from "./config";

export type HostedApplicationContext = Readonly<{
  application: MerakiApplication;
  authority: AuthenticatedContext;
}>;

export type HostedApplicationOperation<T> = (context: HostedApplicationContext) => Promise<T>;

const closeQuietly = async (client: TransactionalSqlClient): Promise<void> => {
  try {
    await client.close();
  } catch {
    // A close failure must not replace the request's primary result or error.
  }
};

/**
 * Opens one transaction-pooler client for one hosted request and closes it
 * before returning. Application, authority, and mutable runtime state are
 * deliberately absent from module scope.
 */
export const withHostedApplication = async <T>(
  config: HostedConfig,
  authorizationHeader: string | null,
  operation: HostedApplicationOperation<T>
): Promise<T> => {
  const client = createPostgresClient(config.databaseUrl);
  try {
    const authenticator = new PostgresAccessTokenAuthenticator(client, config.tokenPepper);
    const authority = await authenticator.authenticate(authorizationHeader ?? undefined);
    const application = new MerakiApplicationService(new PostgresRuntimeUnitOfWork(client));
    return await operation({ application, authority });
  } finally {
    await closeQuietly(client);
  }
};

/** Performs a bounded database readiness check without exposing database data. */
export const checkHostedDatabase = async (config: HostedConfig): Promise<void> => {
  const client = createPostgresClient(config.databaseUrl);
  try {
    const rows = await client.query<{ ready: unknown }>("select 1 as ready");
    if (rows.length !== 1 || rows[0]?.ready !== 1) throw new Error("DATABASE_NOT_READY");
  } finally {
    await closeQuietly(client);
  }
};
