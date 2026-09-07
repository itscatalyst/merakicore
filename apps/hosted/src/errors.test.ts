import { describe, expect, it } from "vitest";
import { HostedHttpError, classifyHttpError, safeHttpErrorBody, safeHttpErrorResponse } from "./errors.js";

describe("hosted HTTP error classification", () => {
  it.each([
    [{ code: "missing_token" }, 401, "AUTHENTICATION_REQUIRED"],
    [{ code: "token_authority_changed" }, 401, "AUTHENTICATION_REQUIRED"],
    [{ code: "insufficient_scope" }, 403, "FORBIDDEN"],
    [new Error("ATOM_NOT_FOUND"), 404, "ATOM_NOT_FOUND"],
    [new Error("ROUTE_NOT_FOUND"), 404, "ROUTE_NOT_FOUND"],
    [{ code: "IDEMPOTENCY_CONFLICT" }, 409, "IDEMPOTENCY_CONFLICT"],
    [new Error("VERSION_CONFLICT"), 409, "VERSION_CONFLICT"],
    [new HostedHttpError(413, "REQUEST_BODY_TOO_LARGE"), 413, "REQUEST_BODY_TOO_LARGE"],
    [new HostedHttpError(415, "UNSUPPORTED_MEDIA_TYPE"), 415, "UNSUPPORTED_MEDIA_TYPE"],
    [{ code: "TASK_CONTEXT_INVALID" }, 422, "TASK_CONTEXT_INVALID"],
    [{ code: "CONTENT_REQUIRED" }, 422, "CONTENT_REQUIRED"],
    [{ code: "COUNTEREVIDENCE_EVENT_ID_INVALID" }, 422, "COUNTEREVIDENCE_EVENT_ID_INVALID"],
    [{ code: "EXPECTED_REVISION_HEADER_INVALID" }, 422, "EXPECTED_REVISION_HEADER_INVALID"],
    [{ code: "PERSISTENCE_FAILED" }, 500, "INTERNAL_ERROR"]
  ])("classifies a known error without using its message", (error, status, code) => {
    expect(classifyHttpError(error)).toEqual({
      status,
      code,
      message: expect.any(String)
    });
  });

  it("collapses unexpected exceptions to a safe 500 response", () => {
    const secret = "postgresql://runtime:private-password@db.internal";
    const result = safeHttpErrorBody(new Error(`database connection failed: ${secret}`), "request-safe");
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      status: 500,
      body: {
        error: {
          code: "INTERNAL_ERROR",
          message: "The server could not complete the request.",
          requestId: "request-safe"
        }
      }
    });
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("private-password");
  });

  it("returns structured private JSON with the server request ID", async () => {
    const response = safeHttpErrorResponse({ code: "REVISION_CONFLICT" }, "request-409");

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-request-id")).toBe("request-409");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REVISION_CONFLICT",
        message: "The request conflicts with the current state.",
        requestId: "request-409"
      }
    });
  });

  it("never trusts an arbitrary statusCode or code supplied by an unexpected error", () => {
    const error = {
      statusCode: 401,
      code: "DATABASE_PASSWORD_IS_private-password",
      message: "private-password"
    };

    expect(classifyHttpError(error)).toEqual({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "The server could not complete the request."
    });
  });
});
