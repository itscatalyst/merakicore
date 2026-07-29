import { randomBytes } from "node:crypto";
import { renderStudio } from "@meraki/studio";
import { createRequestId, privateResponseHeaders } from "./security";

const studioContentSecurityPolicy = (nonce: string): string =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src-elem 'nonce-${nonce}'`,
    "connect-src 'self'",
    "img-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'"
  ].join("; ");

export const handleHostedStudio = (): Response => {
  const requestId = createRequestId();
  const nonce = randomBytes(18).toString("base64url");
  const headers = privateResponseHeaders(requestId, {
    contentType: "text/html; charset=utf-8",
    contentSecurityPolicy: studioContentSecurityPolicy(nonce)
  });
  return new Response(renderStudio({ nonce }), { status: 200, headers });
};
