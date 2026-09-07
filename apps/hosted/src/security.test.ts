import { describe, expect, it } from "vitest";
import { assertAllowedRequestOrigin, createRequestId, privateResponseHeaders } from "./security.js";

const origins = ["https://meraki.example.test", "http://localhost:3000"];

describe("hosted request security", () => {
  it("allows CLI requests without Origin and exact allow-listed browser origins", () => {
    expect(assertAllowedRequestOrigin(undefined, origins)).toBeUndefined();
    expect(assertAllowedRequestOrigin(null, origins)).toBeUndefined();
    expect(assertAllowedRequestOrigin("https://meraki.example.test", origins)).toBe("https://meraki.example.test");
  });

  it.each([
    "null",
    "",
    " https://meraki.example.test",
    "https://meraki.example.test/",
    "https://meraki.example.test.evil",
    "https://user:password@meraki.example.test",
    "file:///private",
    "https://meraki.example.test,https://evil.example.test"
  ])("rejects a supplied hostile or non-canonical Origin: %s", (origin) => {
    expect(() => assertAllowedRequestOrigin(origin, origins)).toThrow(
      expect.objectContaining({ status: 403, code: "ORIGIN_NOT_ALLOWED" })
    );
  });

  it("creates request IDs only from the server-owned factory seam", () => {
    const clientSupplied = "client-controls-this";
    const generated = createRequestId(() => "server-generated-id");

    expect(generated).toBe("server-generated-id");
    expect(generated).not.toBe(clientSupplied);
    expect(() => createRequestId(() => "hostile\r\nheader: injected")).toThrow("REQUEST_ID_GENERATION_FAILED");
  });

  it("applies private no-store and defense-in-depth headers", () => {
    const headers = privateResponseHeaders("request-123");

    expect(headers.get("cache-control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(headers.get("cdn-cache-control")).toBe("no-store");
    expect(headers.get("surrogate-control")).toBe("no-store");
    expect(headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(headers.get("permissions-policy")).toContain("camera=()");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("x-request-id")).toBe("request-123");
    expect(headers.has("access-control-allow-origin")).toBe(false);
  });

  it("emits an exact CORS origin only after allow-list validation", () => {
    const headers = privateResponseHeaders("request-123", {
      origin: "https://meraki.example.test",
      allowedOrigins: origins
    });

    expect(headers.get("access-control-allow-origin")).toBe("https://meraki.example.test");
    expect(headers.get("vary")).toBe("Origin");
    expect(() =>
      privateResponseHeaders("request-123", {
        origin: "https://meraki.example.test.evil",
        allowedOrigins: origins
      })
    ).toThrow(expect.objectContaining({ code: "ORIGIN_NOT_ALLOWED" }));
  });
});
