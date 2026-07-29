import { describe, expect, it, vi } from "vitest";
import { readBoundedJsonBody, type JsonBodyRequest } from "./body.js";

const requestForBytes = (
  chunks: readonly Uint8Array[],
  headers: Readonly<Record<string, string>> = { "content-type": "application/json" }
): JsonBodyRequest => ({
  headers: new Headers(headers),
  body: new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  })
});

const encoded = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("bounded hosted JSON body reader", () => {
  it("parses chunked JSON with an allowed UTF-8 charset", async () => {
    const value = await readBoundedJsonBody(
      requestForBytes([encoded('{"task":"review"'), encoded(',"count":2}')], {
        "content-type": "application/json; charset=UTF-8"
      }),
      128
    );

    expect(value).toEqual({ task: "review", count: 2 });
  });

  it("enforces the declared size before reading the stream", async () => {
    const getReader = vi.fn();
    const request: JsonBodyRequest = {
      headers: new Headers({
        "content-type": "application/json",
        "content-length": "129"
      }),
      body: { getReader } as unknown as ReadableStream<Uint8Array>
    };

    await expect(readBoundedJsonBody(request, 128)).rejects.toMatchObject({
      status: 413,
      code: "REQUEST_BODY_TOO_LARGE"
    });
    expect(getReader).not.toHaveBeenCalled();
  });

  it("enforces the actual chunked byte size when Content-Length is absent", async () => {
    await expect(
      readBoundedJsonBody(requestForBytes([encoded('{"value":"'), encoded("x".repeat(32)), encoded('"}')]), 32)
    ).rejects.toMatchObject({ status: 413, code: "REQUEST_BODY_TOO_LARGE" });
  });

  it("rejects a body that exceeds its smaller declared length", async () => {
    await expect(
      readBoundedJsonBody(
        requestForBytes([encoded("{}")], {
          "content-type": "application/json",
          "content-length": "1"
        }),
        32
      )
    ).rejects.toMatchObject({ status: 413, code: "REQUEST_BODY_TOO_LARGE" });
  });

  it("rejects a body shorter than its declared length", async () => {
    await expect(
      readBoundedJsonBody(
        requestForBytes([encoded("{}")], {
          "content-type": "application/json",
          "content-length": "3"
        }),
        32
      )
    ).rejects.toMatchObject({ status: 422, code: "CONTENT_LENGTH_MISMATCH" });
  });

  it.each([
    [undefined, "UNSUPPORTED_MEDIA_TYPE", 415],
    ["text/plain", "UNSUPPORTED_MEDIA_TYPE", 415],
    ["application/merge-patch+json", "UNSUPPORTED_MEDIA_TYPE", 415],
    ["application/json; charset=iso-8859-1", "UNSUPPORTED_MEDIA_TYPE", 415],
    ["application/json; profile=example", "UNSUPPORTED_MEDIA_TYPE", 415]
  ])("rejects an unsupported Content-Type: %s", async (contentType, code, status) => {
    const headers = contentType === undefined ? {} : { "content-type": contentType };
    await expect(readBoundedJsonBody(requestForBytes([encoded("{}")], headers), 32)).rejects.toMatchObject({
      status,
      code
    });
  });

  it("rejects encoded bodies because the byte boundary must remain unambiguous", async () => {
    await expect(
      readBoundedJsonBody(
        requestForBytes([encoded("{}")], {
          "content-type": "application/json",
          "content-encoding": "gzip"
        }),
        32
      )
    ).rejects.toMatchObject({ status: 415, code: "UNSUPPORTED_MEDIA_TYPE" });
  });

  it("distinguishes empty, malformed, and invalid UTF-8 bodies", async () => {
    await expect(readBoundedJsonBody(requestForBytes([encoded(" \n ")]), 32)).rejects.toMatchObject({
      status: 422,
      code: "EMPTY_JSON_BODY"
    });
    await expect(readBoundedJsonBody(requestForBytes([encoded("{broken")]), 32)).rejects.toMatchObject({
      status: 422,
      code: "MALFORMED_JSON"
    });
    await expect(readBoundedJsonBody(requestForBytes([new Uint8Array([0xc3, 0x28])]), 32)).rejects.toMatchObject({
      status: 422,
      code: "INVALID_UTF8"
    });
    await expect(
      readBoundedJsonBody(
        {
          headers: new Headers({ "content-type": "application/json" }),
          body: null
        },
        32
      )
    ).rejects.toMatchObject({ status: 422, code: "EMPTY_JSON_BODY" });
  });

  it("rejects malformed Content-Length values", async () => {
    await expect(
      readBoundedJsonBody(
        requestForBytes([encoded("{}")], {
          "content-type": "application/json",
          "content-length": "2, 2"
        }),
        32
      )
    ).rejects.toMatchObject({ status: 422, code: "INVALID_CONTENT_LENGTH" });
  });
});
