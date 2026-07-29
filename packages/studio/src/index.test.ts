import { describe, expect, it } from "vitest";
import { renderStudio } from "./index.js";

describe("Studio renderer", () => {
  it("renders the transport-neutral Studio shell with the hosted inspection surfaces", () => {
    const html = renderStudio();

    expect(html).toContain("Evidence and provenance");
    expect(html).toContain("Update proposals");
    expect(html).toContain("Forget token");
    expect(html).not.toContain('style="width:');
  });

  it("keeps bearer credentials ephemeral to the rendered page", () => {
    const html = renderStudio();

    expect(html).toContain('<input id="token" type="password" autocomplete="off"');
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
    expect(html).not.toContain("document.cookie");
  });

  it("applies a validated CSP nonce to every inline executable and style block", () => {
    const nonce = "Qnl0ZS1zYWZlX25vbmNl";
    const html = renderStudio({ nonce });
    const blocks = [...html.matchAll(/<(style|script)(?=[\s>])[^>]*>/gu)].map((match) => match[0]);

    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.includes(` nonce="${nonce}"`))).toBe(true);
    expect(() => renderStudio({ nonce: 'bad"><script>alert(1)</script>' })).toThrowError("STUDIO_CSP_NONCE_INVALID");
    expect(() => renderStudio({ nonce: "" })).toThrowError("STUDIO_CSP_NONCE_INVALID");
  });
});
