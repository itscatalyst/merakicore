import { describe, expect, it } from "vitest";
import { handleHostedStudio } from "./studio.js";

describe("hosted Studio handler", () => {
  it("binds every inline block to the response CSP nonce without persisting credentials", async () => {
    const response = handleHostedStudio();
    const html = await response.text();
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /script-src 'nonce-([^']+)'/u.exec(csp)?.[1];
    const inlineBlocks = [...html.matchAll(/<(style|script)(?=[\s>])[^>]*>/gu)].map((match) => match[0]);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain("style-src-attr 'unsafe-inline'");
    expect(nonce).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(inlineBlocks).toHaveLength(2);
    expect(inlineBlocks.every((block) => block.includes(`nonce="${nonce}"`))).toBe(true);
    expect(html).toContain('<input id="token" type="password" autocomplete="off"');
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
    expect(html).not.toContain("document.cookie");
  });
});
