import { describe, expect, it } from "vitest";
import type { HostedConfig } from "./config.js";
import { handleHostedHealth, type HostedHealthDependencies } from "./health.js";

const config: HostedConfig = {
  databaseUrl: "postgresql://runtime:private-password@db.example.test:6543/postgres",
  tokenPepper: new TextEncoder().encode("0123456789abcdef0123456789abcdef"),
  allowedOrigins: ["https://meraki.example.test"],
  publicBaseUrl: "https://meraki.example.test",
  maxRequestBytes: 256,
  nodeEnvironment: "test"
};

const dependencies = (checkDatabase: HostedHealthDependencies["checkDatabase"]): HostedHealthDependencies => ({
  loadConfig: () => config,
  requestId: () => "health-request-123",
  checkDatabase
});

describe("hosted health handler", () => {
  it("returns a no-store readiness response only after the database check succeeds", async () => {
    let checkedConfig: HostedConfig | undefined;
    const response = await handleHostedHealth(
      new Request("https://meraki.example.test/health", {
        headers: { origin: "https://meraki.example.test" }
      }),
      dependencies((input) => {
        checkedConfig = input;
        return Promise.resolve();
      })
    );

    expect(checkedConfig).toBe(config);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://meraki.example.test");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe("health-request-123");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      service: "meraki-core",
      contract_version: expect.any(String)
    });
  });

  it("returns a generic no-store 503 without leaking database failures", async () => {
    const secret = "postgresql://runtime:private-password@db.internal";
    const response = await handleHostedHealth(
      new Request("https://meraki.example.test/health"),
      dependencies(() => Promise.reject(new Error(`could not connect to ${secret}`)))
    );
    const serialized = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-request-id")).toBe("health-request-123");
    expect(serialized).toBe('{"status":"unavailable","service":"meraki-core"}');
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("private-password");
  });

  it("returns a structured 403 for a supplied hostile origin", async () => {
    const response = await handleHostedHealth(
      new Request("https://meraki.example.test/health", {
        headers: { origin: "https://evil.example.test" }
      }),
      dependencies(() => Promise.resolve())
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ORIGIN_NOT_ALLOWED", requestId: "health-request-123" }
    });
  });
});
