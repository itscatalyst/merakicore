import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  AuthorizationError,
  JwtRequestAuthenticator,
  requireScopes,
  signTestJwt,
  toDatabaseSessionContext
} from "./index.js";

const context = {
  tenantId: "server-tenant",
  subjectId: "server-subject",
  actorId: "server-actor",
  sessionId: "server-session",
  scopes: new Set(["profile:read"])
} as const;

describe("authenticated authority", () => {
  const jwt = {
    secret: new TextEncoder().encode("meraki-test-secret-that-is-at-least-32-bytes"),
    issuer: "https://auth.meraki.test",
    audience: "meraki-core"
  } as const;

  it("derives authority from a valid signed bearer token", async () => {
    const token = await signTestJwt(
      {
        tenant_id: "server-tenant",
        subject_id: "server-subject",
        actor_id: "server-actor",
        session_id: "server-session",
        scope: ["profile:read", "evidence:write"]
      },
      jwt
    );
    const resolved = await new JwtRequestAuthenticator(jwt).authenticate(`Bearer ${token}`);
    expect(resolved).toMatchObject({
      tenantId: "server-tenant",
      subjectId: "server-subject",
      actorId: "server-actor",
      sessionId: "server-session"
    });
    expect([...resolved.scopes]).toEqual(["profile:read", "evidence:write"]);
  });

  it("rejects missing, malformed, expired, and wrongly signed tokens", async () => {
    const authenticator = new JwtRequestAuthenticator(jwt);
    await expect(authenticator.authenticate(undefined)).rejects.toMatchObject({ code: "missing_token" });
    await expect(authenticator.authenticate("Token nope")).rejects.toMatchObject({ code: "malformed_token" });
    const expired = await signTestJwt(
      {
        tenant_id: "server-tenant",
        subject_id: "server-subject",
        actor_id: "server-actor",
        session_id: "server-session",
        scope: "profile:read"
      },
      jwt,
      "0s"
    );
    await expect(authenticator.authenticate(`Bearer ${expired}`)).rejects.toBeInstanceOf(AuthenticationError);
    const wrongKeyToken = await signTestJwt(
      {
        tenant_id: "server-tenant",
        subject_id: "server-subject",
        actor_id: "server-actor",
        session_id: "server-session",
        scope: "profile:read"
      },
      { ...jwt, secret: new TextEncoder().encode("different-test-secret-that-is-over-32-bytes") }
    );
    await expect(authenticator.authenticate(`Bearer ${wrongKeyToken}`)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("accepts only present scopes", () => {
    expect(requireScopes(context, ["profile:read"])).toBe(context);
    expect(() => requireScopes(context, ["profile:write"])).toThrow(AuthorizationError);
  });

  it("creates database settings solely from authenticated context", () => {
    expect(toDatabaseSessionContext(context)).toEqual({
      tenantId: "server-tenant",
      subjectId: "server-subject",
      actorId: "server-actor",
      sessionId: "server-session",
      scopes: ["profile:read"]
    });
  });
});
