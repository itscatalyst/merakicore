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

/**
 * Returns only server-authenticated authority. Callers must not merge request
 * payload tenant or subject fields into this context.
 */
export function requireScopes(
  context: AuthenticatedContext,
  required: readonly string[]
): AuthenticatedContext {
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
