import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export interface AuthenticatedContext {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly scopes: ReadonlySet<string>;
}

export interface RequestAuthenticator {
  authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedContext>;
}

export interface JwtAuthenticationOptions {
  readonly secret: Uint8Array;
  readonly issuer: string;
  readonly audience: string;
}

export interface JwtIdentityClaims {
  readonly tenant_id: string;
  readonly subject_id: string;
  readonly actor_id: string;
  readonly session_id: string;
  readonly scope: string | readonly string[];
}

export class AuthenticationError extends Error {
  public readonly code: string;

  public constructor(code = "invalid_token") {
    super("A valid bearer token is required");
    this.name = "AuthenticationError";
    this.code = code;
  }
}

export class AuthorizationError extends Error {
  public readonly code = "insufficient_scope";

  public constructor() {
    super("The authenticated principal lacks required authority");
    this.name = "AuthorizationError";
  }
}

export class IdentityMismatchError extends Error {
  public readonly code = "identity_mismatch";
  public constructor() {
    super("Request identity does not match the authenticated principal");
    this.name = "IdentityMismatchError";
  }
}

export class JwtRequestAuthenticator implements RequestAuthenticator {
  public constructor(private readonly options: JwtAuthenticationOptions) {}

  public async authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedContext> {
    const token = bearerToken(authorizationHeader);
    try {
      const verified = await jwtVerify(token, this.options.secret, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ["HS256"]
      });
      return contextFromClaims(verified.payload);
    } catch (error: unknown) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError();
    }
  }
}

export class StaticRequestAuthenticator implements RequestAuthenticator {
  public constructor(private readonly context: AuthenticatedContext) {}

  public authenticate(): Promise<AuthenticatedContext> {
    return Promise.resolve(this.context);
  }
}

export function requestAuthenticatorFromEnvironment(): RequestAuthenticator {
  const secret = process.env.MERAKI_JWT_SECRET;
  const issuer = process.env.MERAKI_JWT_ISSUER;
  const audience = process.env.MERAKI_JWT_AUDIENCE;
  if (!secret || !issuer || !audience) {
    throw new Error("MERAKI_JWT_SECRET, MERAKI_JWT_ISSUER, and MERAKI_JWT_AUDIENCE are required");
  }
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("MERAKI_JWT_SECRET must contain at least 32 UTF-8 bytes");
  }
  return new JwtRequestAuthenticator({
    secret: new TextEncoder().encode(secret),
    issuer,
    audience
  });
}

export async function signTestJwt(
  claims: JwtIdentityClaims,
  options: JwtAuthenticationOptions,
  expiresIn = "5m"
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(options.issuer)
    .setAudience(options.audience)
    .setSubject(claims.subject_id)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(options.secret);
}

export function assertAuthenticatedIdentity(
  context: AuthenticatedContext,
  identity: { tenantId?: unknown; subjectId?: unknown; actorId?: unknown }
): void {
  if (
    identity.tenantId !== context.tenantId ||
    identity.subjectId !== context.subjectId ||
    (identity.actorId !== undefined && identity.actorId !== context.actorId)
  )
    throw new IdentityMismatchError();
}

/**
 * Returns only server-authenticated authority. Callers must not merge request
 * payload tenant or subject fields into this context.
 */
export function requireScopes(context: AuthenticatedContext, required: readonly string[]): AuthenticatedContext {
  if (!required.every((scope) => context.scopes.has(scope))) {
    throw new AuthorizationError();
  }
  return context;
}

export function toDatabaseSessionContext(context: AuthenticatedContext) {
  return {
    tenantId: context.tenantId,
    subjectId: context.subjectId,
    actorId: context.actorId,
    sessionId: context.sessionId,
    scopes: [...context.scopes]
  } as const;
}

function bearerToken(authorizationHeader: string | undefined): string {
  if (authorizationHeader === undefined) throw new AuthenticationError("missing_token");
  const match = /^Bearer ([^\s]+)$/u.exec(authorizationHeader);
  if (match?.[1] === undefined) throw new AuthenticationError("malformed_token");
  return match[1];
}

function contextFromClaims(payload: JWTPayload): AuthenticatedContext {
  const claims = payload as Partial<JwtIdentityClaims>;
  const tenantId = requiredClaim(claims.tenant_id);
  const subjectId = requiredClaim(claims.subject_id);
  const actorId = requiredClaim(claims.actor_id);
  const sessionId = requiredClaim(claims.session_id);
  const scope = claims.scope;
  const scopes =
    typeof scope === "string"
      ? scope.split(/\s+/u).filter(Boolean)
      : Array.isArray(scope) && scope.every((value) => typeof value === "string")
        ? scope
        : [];
  if (scopes.length === 0) throw new AuthenticationError("invalid_token_claims");
  return Object.freeze({
    tenantId,
    subjectId,
    actorId,
    sessionId,
    scopes: new Set(scopes)
  });
}

function requiredClaim(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AuthenticationError("invalid_token_claims");
  }
  return value;
}
