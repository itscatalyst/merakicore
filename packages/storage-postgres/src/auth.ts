import { createHmac } from "node:crypto";
import { AuthenticationError, type AuthenticatedContext, type RequestAuthenticator } from "@meraki/auth";
import type { SqlExecutor, SqlRow } from "./client.js";

type AccessTokenRow = SqlRow &
  Readonly<{
    id: string;
    tenant_id: string;
    subject_id: string;
    actor_id: string;
    scopes: unknown;
    expires_at: unknown;
    revoked_at: unknown;
  }>;

const TOKEN_LOOKUP_SQL = `
/* meraki:access-token */
select id, tenant_id, subject_id, actor_id, scopes, expires_at, revoked_at
from meraki_private.access_tokens
where token_digest = $1
limit 1
`;

const tokenFromHeader = (authorizationHeader: string | undefined): string => {
  if (authorizationHeader === undefined) throw new AuthenticationError("missing_token");
  const match = /^Bearer ([^\s]+)$/u.exec(authorizationHeader);
  if (match?.[1] === undefined) throw new AuthenticationError("malformed_token");
  if (match[1].length > 512) throw new AuthenticationError("malformed_token");
  return match[1];
};

const requiredIdentity = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) throw new AuthenticationError("invalid_token_record");
  return value;
};

const timestamp = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  const milliseconds =
    value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(milliseconds)) throw new AuthenticationError("invalid_token_record");
  return milliseconds;
};

export const validatedTokenScopes = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0) throw new AuthenticationError("invalid_token_record");
  const candidates: readonly unknown[] = value;
  const scopes: string[] = [];
  for (const scope of candidates) {
    if (typeof scope !== "string" || !scope || scope.trim() !== scope)
      throw new AuthenticationError("invalid_token_record");
    scopes.push(scope);
  }
  if (new Set(scopes).size !== scopes.length) throw new AuthenticationError("invalid_token_record");
  return scopes;
};

export const accessTokenDigest = (token: string, pepper: Uint8Array): `hmac-sha256:${string}` => {
  if (!token || token.length > 512) throw new AuthenticationError("malformed_token");
  if (pepper.byteLength < 32) throw new Error("MERAKI_TOKEN_PEPPER must contain at least 32 bytes");
  return `hmac-sha256:${createHmac("sha256", pepper).update(token, "utf8").digest("hex")}`;
};

/**
 * Authenticates opaque bearer tokens without storing the bearer secret.
 * Database rows contain only a peppered HMAC digest and server-derived
 * tenant/subject/actor authority.
 */
export class PostgresAccessTokenAuthenticator implements RequestAuthenticator {
  public constructor(
    private readonly sql: SqlExecutor,
    private readonly pepper: Uint8Array,
    private readonly now: () => Date = () => new Date()
  ) {
    if (pepper.byteLength < 32) throw new Error("MERAKI_TOKEN_PEPPER must contain at least 32 bytes");
  }

  public async authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedContext> {
    const token = tokenFromHeader(authorizationHeader);
    const digest = accessTokenDigest(token, this.pepper);
    const rows = await this.sql.query<AccessTokenRow>(TOKEN_LOOKUP_SQL, [digest]);
    const row = rows[0];
    if (row === undefined) throw new AuthenticationError("invalid_token");
    if (row.revoked_at !== null && row.revoked_at !== undefined) throw new AuthenticationError("revoked_token");
    const expiresAt = timestamp(row.expires_at);
    if (expiresAt !== undefined && expiresAt <= this.now().getTime()) throw new AuthenticationError("expired_token");
    const scopes = validatedTokenScopes(row.scopes);
    return Object.freeze({
      tenantId: requiredIdentity(row.tenant_id),
      subjectId: requiredIdentity(row.subject_id),
      actorId: requiredIdentity(row.actor_id),
      sessionId: `token:${requiredIdentity(row.id)}`,
      scopes: new Set(scopes),
      credentialId: requiredIdentity(row.id)
    });
  }
}
