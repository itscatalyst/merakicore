import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const APP_GRANT_ROLE = "meraki_app";
export const WORKER_GRANT_ROLE = "meraki_worker";
export const APP_LOGIN_ROLE = "meraki_app_login";
export const WORKER_LOGIN_ROLE = "meraki_worker_login";

export interface BootstrapRolesOptions {
  readonly connectionString: string;
  readonly appPassword: string;
  readonly workerPassword: string;
}

type RuntimeLoginRole = typeof APP_LOGIN_ROLE | typeof WORKER_LOGIN_ROLE;

export async function bootstrapRoles(options: BootstrapRolesOptions): Promise<void> {
  assertPassword("MERAKI_APP_DATABASE_PASSWORD", options.appPassword);
  assertPassword("MERAKI_WORKER_DATABASE_PASSWORD", options.workerPassword);
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_GRANT_ROLE}') THEN
          CREATE ROLE ${APP_GRANT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${WORKER_GRANT_ROLE}') THEN
          CREATE ROLE ${WORKER_GRANT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_LOGIN_ROLE}') THEN
          CREATE ROLE ${APP_LOGIN_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${WORKER_LOGIN_ROLE}') THEN
          CREATE ROLE ${WORKER_LOGIN_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
        END IF;
      END
      $$
    `);
    await setPassword(client, APP_LOGIN_ROLE, options.appPassword);
    await setPassword(client, WORKER_LOGIN_ROLE, options.workerPassword);
    await client.query(
      `ALTER ROLE ${APP_GRANT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`
    );
    await client.query(
      `ALTER ROLE ${WORKER_GRANT_ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`
    );
    await client.query(`ALTER ROLE ${APP_LOGIN_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`);
    await client.query(
      `ALTER ROLE ${WORKER_LOGIN_ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT`
    );
    await client.query(`REVOKE ${WORKER_GRANT_ROLE} FROM ${APP_LOGIN_ROLE}`);
    await client.query(`REVOKE ${APP_GRANT_ROLE} FROM ${WORKER_LOGIN_ROLE}`);
    await client.query(`GRANT ${APP_GRANT_ROLE} TO ${APP_LOGIN_ROLE}`);
    await client.query(`GRANT ${WORKER_GRANT_ROLE} TO ${WORKER_LOGIN_ROLE}`);
  } finally {
    await client.end();
  }
}

export function runtimeConnectionString(
  adminConnectionString: string,
  loginRole: RuntimeLoginRole,
  password: string
): string {
  const url = new URL(adminConnectionString);
  url.username = loginRole;
  url.password = password;
  return url.toString();
}

async function setPassword(client: pg.Client, role: RuntimeLoginRole, password: string): Promise<void> {
  const formatted = await client.query<{ statement: string }>(
    "SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS statement",
    [role, password]
  );
  const statement = formatted.rows[0]?.statement;
  if (statement === undefined) throw new Error(`Could not prepare password update for ${role}`);
  await client.query(statement);
}

function assertPassword(variable: string, password: string): void {
  if (password.length < 16) throw new Error(`${variable} must contain at least 16 characters`);
}

async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  const appPassword = process.env["MERAKI_APP_DATABASE_PASSWORD"];
  const workerPassword = process.env["MERAKI_WORKER_DATABASE_PASSWORD"];
  if (connectionString === undefined) throw new Error("DATABASE_URL is required");
  if (appPassword === undefined) throw new Error("MERAKI_APP_DATABASE_PASSWORD is required");
  if (workerPassword === undefined) throw new Error("MERAKI_WORKER_DATABASE_PASSWORD is required");
  await bootstrapRoles({ connectionString, appPassword, workerPassword });
  process.stdout.write("Meraki database roles are configured.\n");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  await main();
}
