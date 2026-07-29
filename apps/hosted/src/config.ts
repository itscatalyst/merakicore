const MAX_HOSTED_REQUEST_BYTES = 1_048_576;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
const NODE_ENVIRONMENTS = new Set(["development", "production", "test"]);

export type HostedNodeEnvironment = "development" | "production" | "test";

export type HostedConfig = Readonly<{
  databaseUrl: string;
  tokenPepper: Uint8Array;
  allowedOrigins: readonly string[];
  publicBaseUrl: string;
  maxRequestBytes: number;
  nodeEnvironment: HostedNodeEnvironment;
}>;

export type HostedEnvironment = Readonly<Record<string, string | undefined>>;

export class HostedConfigurationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "HostedConfigurationError";
  }
}

const requiredEnvironmentValue = (environment: HostedEnvironment, name: string): string => {
  const value = environment[name];
  if (value === undefined || value === "" || value.trim() !== value) {
    throw new HostedConfigurationError(`${name}_INVALID`);
  }
  return value;
};

const databaseUrl = (environment: HostedEnvironment): string => {
  const value = requiredEnvironmentValue(environment, "DATABASE_URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HostedConfigurationError("DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname === "" ||
    parsed.username === "" ||
    parsed.password === "" ||
    parsed.hash !== ""
  ) {
    throw new HostedConfigurationError("DATABASE_URL_INVALID");
  }
  return value;
};

const isPermittedHttpOrigin = (url: URL): boolean =>
  url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));

export const canonicalHttpOrigin = (value: string, code = "ORIGIN_INVALID"): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HostedConfigurationError(code);
  }
  if (
    value === "null" ||
    value !== parsed.origin ||
    !isPermittedHttpOrigin(parsed) ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    throw new HostedConfigurationError(code);
  }
  return parsed.origin;
};

const allowedOrigins = (environment: HostedEnvironment): readonly string[] => {
  const value = requiredEnvironmentValue(environment, "MERAKI_ALLOWED_ORIGINS");
  const entries = value.split(",");
  if (entries.length === 0 || entries.some((entry) => entry === "" || entry.trim() !== entry)) {
    throw new HostedConfigurationError("MERAKI_ALLOWED_ORIGINS_INVALID");
  }
  const origins = entries.map((entry) => canonicalHttpOrigin(entry, "MERAKI_ALLOWED_ORIGINS_INVALID"));
  if (new Set(origins).size !== origins.length) {
    throw new HostedConfigurationError("MERAKI_ALLOWED_ORIGINS_INVALID");
  }
  return Object.freeze(origins);
};

const publicBaseUrl = (environment: HostedEnvironment): string =>
  canonicalHttpOrigin(
    requiredEnvironmentValue(environment, "MERAKI_PUBLIC_BASE_URL"),
    "MERAKI_PUBLIC_BASE_URL_INVALID"
  );

const maxRequestBytes = (environment: HostedEnvironment): number => {
  const value = requiredEnvironmentValue(environment, "MERAKI_MAX_REQUEST_BYTES");
  if (!/^[1-9]\d*$/u.test(value)) throw new HostedConfigurationError("MERAKI_MAX_REQUEST_BYTES_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_HOSTED_REQUEST_BYTES) {
    throw new HostedConfigurationError("MERAKI_MAX_REQUEST_BYTES_INVALID");
  }
  return parsed;
};

const tokenPepper = (environment: HostedEnvironment): Uint8Array => {
  const value = requiredEnvironmentValue(environment, "MERAKI_TOKEN_PEPPER");
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength < 32) throw new HostedConfigurationError("MERAKI_TOKEN_PEPPER_INVALID");
  return encoded;
};

const nodeEnvironment = (environment: HostedEnvironment): HostedNodeEnvironment => {
  const value = environment.NODE_ENV ?? "production";
  if (!NODE_ENVIRONMENTS.has(value)) throw new HostedConfigurationError("NODE_ENV_INVALID");
  return value as HostedNodeEnvironment;
};

/**
 * Parses all hosted settings at the process boundary. There are no permissive
 * production fallbacks: database authority, token pepper, origin allow-list,
 * public URL, and body limit must all be explicitly configured.
 */
export const parseHostedConfig = (environment: HostedEnvironment): HostedConfig => {
  const origins = allowedOrigins(environment);
  const baseUrl = publicBaseUrl(environment);
  if (!origins.includes(baseUrl)) {
    throw new HostedConfigurationError("MERAKI_PUBLIC_BASE_URL_NOT_ALLOWED");
  }
  return Object.freeze({
    databaseUrl: databaseUrl(environment),
    tokenPepper: tokenPepper(environment),
    allowedOrigins: origins,
    publicBaseUrl: baseUrl,
    maxRequestBytes: maxRequestBytes(environment),
    nodeEnvironment: nodeEnvironment(environment)
  });
};
