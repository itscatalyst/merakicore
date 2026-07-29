import { describe, expect, it } from "vitest";
import { HostedConfigurationError, canonicalHttpOrigin, parseHostedConfig, type HostedEnvironment } from "./config.js";

const validEnvironment = (overrides: HostedEnvironment = {}): HostedEnvironment => ({
  DATABASE_URL: "postgresql://runtime:private-password@db.example.test:6543/postgres?sslmode=require",
  MERAKI_TOKEN_PEPPER: "0123456789abcdef0123456789abcdef",
  MERAKI_ALLOWED_ORIGINS: "https://meraki.example.test,http://localhost:3000",
  MERAKI_PUBLIC_BASE_URL: "https://meraki.example.test",
  MERAKI_MAX_REQUEST_BYTES: "262144",
  NODE_ENV: "production",
  ...overrides
});

describe("hosted configuration", () => {
  it("parses explicit hosted settings without normalizing authority boundaries", () => {
    const config = parseHostedConfig(validEnvironment());

    expect(config).toMatchObject({
      databaseUrl: expect.stringMatching(/^postgresql:/u),
      allowedOrigins: ["https://meraki.example.test", "http://localhost:3000"],
      publicBaseUrl: "https://meraki.example.test",
      maxRequestBytes: 262144,
      nodeEnvironment: "production"
    });
    expect(config.tokenPepper.byteLength).toBe(32);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.allowedOrigins)).toBe(true);
  });

  it.each([
    ["DATABASE_URL", undefined, "DATABASE_URL_INVALID"],
    ["DATABASE_URL", "https://runtime:password@db.example.test/postgres", "DATABASE_URL_INVALID"],
    ["DATABASE_URL", "postgresql://db.example.test/postgres", "DATABASE_URL_INVALID"],
    ["MERAKI_TOKEN_PEPPER", "only-thirty-one-ascii-bytes----", "MERAKI_TOKEN_PEPPER_INVALID"],
    ["MERAKI_ALLOWED_ORIGINS", "", "MERAKI_ALLOWED_ORIGINS_INVALID"],
    ["MERAKI_ALLOWED_ORIGINS", "https://meraki.example.test/", "MERAKI_ALLOWED_ORIGINS_INVALID"],
    [
      "MERAKI_ALLOWED_ORIGINS",
      "https://meraki.example.test, https://studio.example.test",
      "MERAKI_ALLOWED_ORIGINS_INVALID"
    ],
    [
      "MERAKI_ALLOWED_ORIGINS",
      "https://meraki.example.test,https://meraki.example.test",
      "MERAKI_ALLOWED_ORIGINS_INVALID"
    ],
    ["MERAKI_ALLOWED_ORIGINS", "null", "MERAKI_ALLOWED_ORIGINS_INVALID"],
    ["MERAKI_ALLOWED_ORIGINS", "http://meraki.example.test", "MERAKI_ALLOWED_ORIGINS_INVALID"],
    ["MERAKI_PUBLIC_BASE_URL", "https://meraki.example.test/studio", "MERAKI_PUBLIC_BASE_URL_INVALID"],
    ["MERAKI_PUBLIC_BASE_URL", "HTTPS://meraki.example.test", "MERAKI_PUBLIC_BASE_URL_INVALID"],
    ["MERAKI_PUBLIC_BASE_URL", "https://studio.example.test", "MERAKI_PUBLIC_BASE_URL_NOT_ALLOWED"],
    ["MERAKI_MAX_REQUEST_BYTES", "0", "MERAKI_MAX_REQUEST_BYTES_INVALID"],
    ["MERAKI_MAX_REQUEST_BYTES", "1.5", "MERAKI_MAX_REQUEST_BYTES_INVALID"],
    ["MERAKI_MAX_REQUEST_BYTES", "1048577", "MERAKI_MAX_REQUEST_BYTES_INVALID"],
    ["NODE_ENV", "staging", "NODE_ENV_INVALID"]
  ])("rejects unsafe %s configuration", (name, value, expectedCode) => {
    expect(() => parseHostedConfig(validEnvironment({ [name]: value }))).toThrow(
      expect.objectContaining({ code: expectedCode })
    );
  });

  it("measures the token pepper in UTF-8 bytes", () => {
    const config = parseHostedConfig(validEnvironment({ MERAKI_TOKEN_PEPPER: "🔐🔐🔐🔐🔐🔐🔐🔐" }));
    expect(config.tokenPepper.byteLength).toBe(32);
  });

  it("never includes a rejected secret value in a configuration error", () => {
    const secret = "postgresql://runtime:do-not-leak@";
    try {
      parseHostedConfig(validEnvironment({ DATABASE_URL: secret }));
      throw new Error("EXPECTED_CONFIGURATION_FAILURE");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(HostedConfigurationError);
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain("do-not-leak");
    }
  });

  it("accepts only canonical HTTPS or loopback HTTP serialized origins", () => {
    expect(canonicalHttpOrigin("https://example.test")).toBe("https://example.test");
    expect(canonicalHttpOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
    expect(() => canonicalHttpOrigin("https://example.test/")).toThrow("ORIGIN_INVALID");
    expect(() => canonicalHttpOrigin("https://user:password@example.test")).toThrow("ORIGIN_INVALID");
    expect(() => canonicalHttpOrigin("https://example.test.evil")).not.toThrow();
  });
});
