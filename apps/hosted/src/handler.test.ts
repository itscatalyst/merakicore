import { createInMemoryApplication, type MerakiApplication } from "@meraki/application";
import type { AuthenticatedContext } from "@meraki/auth";
import { describe, expect, it } from "vitest";
import type { HostedConfig } from "./config.js";
import { handleHostedRest, type HostedRestDependencies } from "./handler.js";

const authority: AuthenticatedContext = {
  tenantId: "tenant-a",
  subjectId: "user-a",
  actorId: "user-a",
  sessionId: "hosted-handler-test",
  scopes: new Set(["profile:read", "profile:write", "evidence:write", "evaluation:write"])
};

const config: HostedConfig = {
  databaseUrl: "postgresql://runtime:private-password@db.example.test:6543/postgres",
  tokenPepper: new TextEncoder().encode("0123456789abcdef0123456789abcdef"),
  allowedOrigins: ["https://meraki.example.test"],
  publicBaseUrl: "https://meraki.example.test",
  maxRequestBytes: 256,
  nodeEnvironment: "test"
};

const dependenciesFor = (
  input: Readonly<{
    application?: MerakiApplication;
    config?: HostedConfig;
    requestId?: string;
    beforeApplication?: () => void;
    failure?: Error;
  }> = {}
): HostedRestDependencies => {
  const application = input.application ?? createInMemoryApplication().application;
  return {
    loadConfig: () => input.config ?? config,
    requestId: () => input.requestId ?? "server-request-123",
    runWithApplication: async (_config, _authorizationHeader, operation) => {
      input.beforeApplication?.();
      if (input.failure !== undefined) throw input.failure;
      return operation({ application, authority });
    }
  };
};

describe("hosted REST request handler", () => {
  it("rejects a hostile Origin before authentication or database work", async () => {
    let applicationCalls = 0;
    const response = await handleHostedRest(
      new Request("https://meraki.example.test/v1/profile/atoms", {
        headers: {
          origin: "https://meraki.example.test.evil",
          authorization: "Bearer should-never-be-read"
        }
      }),
      ["profile", "atoms"],
      dependenciesFor({ beforeApplication: () => (applicationCalls += 1) })
    );

    expect(response.status).toBe(403);
    expect(applicationCalls).toBe(0);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "The request is not permitted.",
        requestId: "server-request-123"
      }
    });
  });

  it("returns private no-store JSON, exact CORS, and a server-owned request ID", async () => {
    const response = await handleHostedRest(
      new Request("https://meraki.example.test/v1/profile/atoms?limit=1", {
        headers: {
          origin: "https://meraki.example.test",
          authorization: "Bearer test-token",
          "x-request-id": "client-controlled"
        }
      }),
      ["profile", "atoms"],
      dependenciesFor()
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://meraki.example.test");
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toBe("server-request-123");
    expect(response.headers.get("x-request-id")).not.toBe("client-controlled");
    await expect(response.json()).resolves.toEqual({ items: [] });
  });

  it("enforces the configured request-body limit at the route boundary", async () => {
    let applicationCalls = 0;
    const response = await handleHostedRest(
      new Request("https://meraki.example.test/v1/corrections", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": "9"
        },
        body: "{}"
      }),
      ["corrections"],
      dependenciesFor({
        config: { ...config, maxRequestBytes: 8 },
        beforeApplication: () => (applicationCalls += 1)
      })
    );

    expect(applicationCalls).toBe(0);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "REQUEST_BODY_TOO_LARGE",
        requestId: "server-request-123"
      }
    });
  });

  it("sanitizes unexpected infrastructure failures without leaking secrets", async () => {
    const secret = "postgresql://runtime:private-password@db.internal";
    const response = await handleHostedRest(
      new Request("https://meraki.example.test/v1/profile/atoms"),
      ["profile", "atoms"],
      dependenciesFor({ failure: new Error(`database unavailable: ${secret}`) })
    );
    const serialized = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBe("server-request-123");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(serialized).toContain('"code":"INTERNAL_ERROR"');
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("private-password");
  });

  it("answers an allowed preflight without opening the application", async () => {
    let applicationCalls = 0;
    const response = await handleHostedRest(
      new Request("https://meraki.example.test/v1/profile/atoms", {
        method: "OPTIONS",
        headers: { origin: "https://meraki.example.test" }
      }),
      ["profile", "atoms"],
      dependenciesFor({ beforeApplication: () => (applicationCalls += 1) })
    );

    expect(response.status).toBe(204);
    expect(applicationCalls).toBe(0);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://meraki.example.test");
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
