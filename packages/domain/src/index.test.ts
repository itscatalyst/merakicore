import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Digest, utf8ByteLength } from "./index.js";

describe("deterministic domain utilities", () => {
  it("matches the RFC 8785 serialization example", () => {
    const value = {
      numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
      string: "€$\u000f\nA'B\"\\\\\"/",
      literals: [null, true, false]
    };
    expect(canonicalJson(value)).toBe(
      "{\"literals\":[null,true,false],\"numbers\":[333333333.3333333,1e+30,4.5,0.002,1e-27],\"string\":\"€$\\u000f\\nA'B\\\"\\\\\\\\\\\"/\"}"
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
});
