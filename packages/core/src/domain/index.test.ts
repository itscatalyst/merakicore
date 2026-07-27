import { describe, expect, it } from "vitest";
import { canonicalJson, parseScope, sha256Digest, utf8ByteLength } from "./index.js";

describe("deterministic domain utilities", () => {
  it("matches the RFC 8785 serialization example", () => {
    const value = {
      numbers: [Number("333333333.33333329"), 1e30, 4.5, 2e-3, 1e-27],
      string: '€$\u000f\nA\'B"\\\\"/',
      literals: [null, true, false]
    };
    expect(canonicalJson(value)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}'
    );
  });

  it("rejects values outside the JSON data model", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow("undefined");
    expect(() => canonicalJson({ invalid: Number.NaN })).toThrow("non-finite");
  });

  it("reports prefixed SHA-256 digests and UTF-8 byte budgets", () => {
    expect(sha256Digest("Meraki")).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(utf8ByteLength("Meraki ✦")).toBe(10);
  });

  it("parses only schema-valid scopes", () => {
    expect(parseScope({ level: "user" })).toEqual({ level: "user" });
    expect(parseScope({ level: "user", ref: "user-a" })).toEqual({ level: "user", ref: "user-a" });
    expect(parseScope({ level: "project", ref: "acme" })).toEqual({ level: "project", ref: "acme" });

    expect(() => parseScope({ level: "project" })).toThrow("SCOPE_REF_REQUIRED");
    expect(() => parseScope({ level: "unknown", ref: "acme" })).toThrow("SCOPE_LEVEL_INVALID");
    expect(() => parseScope({ level: "project", ref: " " })).toThrow("SCOPE_REF_INVALID");
    expect(() => parseScope({ level: "user", ref: 42 })).toThrow("SCOPE_REF_INVALID");
    expect(() => parseScope({ level: "user", extra: true })).toThrow("SCOPE_INVALID");
    expect(() => parseScope([])).toThrow("SCOPE_REQUIRED");
  });
});
