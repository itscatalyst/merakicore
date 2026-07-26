import { describe, expect, it } from "vitest";
import {
  assertBearerCredential,
  AuthenticationError,
  AuthorizationError,
  requireScopes,
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

  it("requires an exact bearer credential", () => {
    const token = "0123456789abcdef0123456789abcdef";
    expect(() => assertBearerCredential(`Bearer ${token}`, token)).not.toThrow();
    expect(() => assertBearerCredential(undefined, token)).toThrow(AuthenticationError);
    expect(() => assertBearerCredential(`Bearer ${token}x`, token)).toThrow(AuthenticationError);
    expect(() => assertBearerCredential("Basic dXNlcjpwYXNz", token)).toThrow(AuthenticationError);
  });
});
