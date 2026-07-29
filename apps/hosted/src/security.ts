import { randomUUID } from "node:crypto";
import { canonicalHttpOrigin } from "./config";
import { HostedHttpError } from "./errors";

export type RequestIdFactory = () => string;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

/**
 * Creates a server-owned request ID. No client header is accepted as input.
 * The factory seam keeps route tests deterministic without weakening runtime
 * ownership.
 */
export const createRequestId = (factory: RequestIdFactory = randomUUID): string => {
  const requestId = factory();
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("REQUEST_ID_GENERATION_FAILED");
  return requestId;
};

const safeCanonicalOrigin = (origin: string): string | undefined => {
  try {
    return canonicalHttpOrigin(origin);
  } catch {
    return undefined;
  }
};

/**
 * CLI clients generally omit Origin and are allowed through. Once an Origin is
 * supplied it must be a canonical serialized HTTP origin and an exact member
 * of the configured allow-list. `null`, credentials, paths, look-alike hosts,
 * whitespace, and multi-origin values all fail closed.
 */
export const assertAllowedRequestOrigin = (
  origin: string | null | undefined,
  allowedOrigins: readonly string[]
): string | undefined => {
  if (origin === null || origin === undefined) return undefined;
  const canonical = safeCanonicalOrigin(origin);
  if (canonical === undefined || canonical !== origin || !allowedOrigins.includes(origin)) {
    throw new HostedHttpError(403, "ORIGIN_NOT_ALLOWED");
  }
  return origin;
};

export type PrivateResponseHeaderOptions = Readonly<{
  contentType?: string;
  contentSecurityPolicy?: string;
  origin?: string | null;
  allowedOrigins?: readonly string[];
}>;

const DEFAULT_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";

/**
 * Security and cache headers for authenticated private responses.
 *
 * Supplying an Origin requires the same exact validation used at request
 * ingress before any Access-Control-Allow-Origin header is emitted.
 */
export const privateResponseHeaders = (requestId: string, options: PrivateResponseHeaderOptions = {}): Headers => {
  if (!REQUEST_ID_PATTERN.test(requestId)) throw new Error("REQUEST_ID_INVALID");
  const headers = new Headers({
    "cache-control": "private, no-store, max-age=0, must-revalidate",
    "cdn-cache-control": "no-store",
    "content-security-policy": options.contentSecurityPolicy ?? DEFAULT_CONTENT_SECURITY_POLICY,
    "content-type": options.contentType ?? "application/json; charset=utf-8",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    expires: "0",
    "permissions-policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()",
    pragma: "no-cache",
    "referrer-policy": "no-referrer",
    "surrogate-control": "no-store",
    "vercel-cdn-cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-request-id": requestId,
    "x-robots-tag": "noindex, nofollow, noarchive"
  });

  if (options.origin !== undefined && options.origin !== null) {
    const allowed = assertAllowedRequestOrigin(options.origin, options.allowedOrigins ?? []);
    if (allowed !== undefined) {
      headers.set("access-control-allow-origin", allowed);
      headers.set("vary", "Origin");
    }
  }
  return headers;
};
