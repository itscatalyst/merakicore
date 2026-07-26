export interface AuthenticatedContext {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly scopes: ReadonlySet<string>;
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

export class AuthenticationError extends Error {
  public readonly code = "authentication_required";
  public constructor() {
    super("A valid bearer credential is required");
    this.name = "AuthenticationError";
  }
}

/** Fail closed outside tests: the API must never treat identity headers as credentials. */
export function resolveApiToken(): string | undefined {
  const token = process.env.MERAKI_API_TOKEN;
  if (token && token.length >= 32) return token;
  if (process.env.NODE_ENV === "test") return undefined;
  throw new Error("MERAKI_API_TOKEN_REQUIRED");
}

export function assertBearerCredential(authorization: unknown, expectedToken: string): void {
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) throw new AuthenticationError();
  const supplied = authorization.slice("Bearer ".length);
  // Compare every character without an early exit. The fixed minimum also prevents accidental weak deployment secrets.
  let difference = supplied.length ^ expectedToken.length;
  const length = Math.max(supplied.length, expectedToken.length);
  for (let index = 0; index < length; index += 1)
    difference |= (supplied.charCodeAt(index) || 0) ^ (expectedToken.charCodeAt(index) || 0);
  if (difference !== 0) throw new AuthenticationError();
}

export function resolveAuthenticatedContext(): AuthenticatedContext {
  const tenantId = process.env.MERAKI_TENANT_ID;
  const subjectId = process.env.MERAKI_SUBJECT_ID;
  const actorId = process.env.MERAKI_ACTOR_ID;
  const sessionId = process.env.MERAKI_SESSION_ID;
  if (tenantId && subjectId && actorId && sessionId)
    return {
      tenantId,
      subjectId,
      actorId,
      sessionId,
      scopes: new Set(["profile:read", "profile:write", "evidence:write", "evaluation:write"])
    };
  if (process.env.NODE_ENV === "test")
    return {
      tenantId: "tenant-a",
      subjectId: "user-a",
      actorId: "user-a",
      sessionId: "test-session",
      scopes: new Set(["profile:read", "profile:write", "evidence:write", "evaluation:write"])
    };
  throw new Error("AUTHENTICATED_CONTEXT_REQUIRED");
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
