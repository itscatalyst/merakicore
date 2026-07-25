export interface IdentityToken {
  readonly scheme: "bearer" | "session";
  readonly credential: string;
}

export interface IdentityResolution {
  readonly tenantId: string;
  readonly subjectId: string;
  readonly actorId: string;
  readonly sessionId: string;
  readonly scopes: readonly string[];
}

export interface IdentityProvider {
  resolve(token: IdentityToken): Promise<IdentityResolution | null>;
}

export class StaticIdentityProvider implements IdentityProvider {
  public constructor(private readonly identities: ReadonlyMap<string, IdentityResolution>) {}

  public resolve(token: IdentityToken): Promise<IdentityResolution | null> {
    return Promise.resolve(this.identities.get(`${token.scheme}:${token.credential}`) ?? null);
  }
}
