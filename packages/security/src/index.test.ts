import { describe, expect, it } from "vitest";
import { AuthorizationError, requireScopes, toDatabaseSessionContext } from "./index.js";

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
});
