import { HostedHttpError } from "./errors";

const MAX_BODY_CHUNKS = 4096;

export type JsonBodyRequest = Readonly<{
  headers: Readonly<{ get(name: string): string | null }>;
  body: ReadableStream<Uint8Array> | null;
}>;

const assertJsonContentType = (contentType: string | null): void => {
  if (contentType === null) throw new HostedHttpError(415, "UNSUPPORTED_MEDIA_TYPE");
  const parts = contentType.split(";").map((part) => part.trim());
  if (parts.shift()?.toLowerCase() !== "application/json") {
    throw new HostedHttpError(415, "UNSUPPORTED_MEDIA_TYPE");
  }
  if (parts.length > 1) throw new HostedHttpError(415, "UNSUPPORTED_MEDIA_TYPE");
  if (parts.length === 1 && !/^charset=(?:"utf-8"|utf-8)$/iu.test(parts[0] ?? "")) {
    throw new HostedHttpError(415, "UNSUPPORTED_MEDIA_TYPE");
  }
};

const declaredContentLength = (value: string | null, maxBytes: number): number | undefined => {
  if (value === null) return undefined;
  if (!/^(0|[1-9]\d*)$/u.test(value)) throw new HostedHttpError(422, "INVALID_CONTENT_LENGTH");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new HostedHttpError(413, "REQUEST_BODY_TOO_LARGE");
  if (parsed > maxBytes) throw new HostedHttpError(413, "REQUEST_BODY_TOO_LARGE");
  return parsed;
};

const readBoundedBytes = async (
  body: ReadableStream<Uint8Array> | null,
  declaredBytes: number | undefined,
  maxBytes: number
): Promise<Uint8Array> => {
  if (body === null) {
    if (declaredBytes !== undefined && declaredBytes !== 0) {
      throw new HostedHttpError(422, "CONTENT_LENGTH_MISMATCH");
    }
    return new Uint8Array();
  }

  const reader = body.getReader();
  let bytes = new Uint8Array(declaredBytes ?? Math.min(maxBytes, 8192));
  let totalBytes = 0;
  let chunkCount = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) throw new HostedHttpError(422, "INVALID_JSON_CHUNK");
      chunkCount += 1;
      if (chunkCount > MAX_BODY_CHUNKS) throw new HostedHttpError(413, "REQUEST_BODY_TOO_LARGE");
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes || (declaredBytes !== undefined && totalBytes > declaredBytes)) {
        throw new HostedHttpError(413, "REQUEST_BODY_TOO_LARGE");
      }
      if (totalBytes > bytes.byteLength) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(totalBytes, Math.max(1, bytes.byteLength * 2))));
        grown.set(bytes);
        bytes = grown;
      }
      bytes.set(result.value, totalBytes - result.value.byteLength);
    }
  } catch (error: unknown) {
    try {
      await reader.cancel();
    } catch {
      // The stable public error below is more useful than a second stream error.
    }
    if (error instanceof HostedHttpError) throw error;
    throw new HostedHttpError(422, "REQUEST_BODY_READ_FAILED");
  } finally {
    reader.releaseLock();
  }

  if (declaredBytes !== undefined && totalBytes !== declaredBytes) {
    throw new HostedHttpError(422, "CONTENT_LENGTH_MISMATCH");
  }
  return bytes.slice(0, totalBytes);
};

const decodeUtf8 = (body: Uint8Array): string => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new HostedHttpError(422, "INVALID_UTF8");
  }
};

/**
 * Reads and parses a Web Request JSON body without using unbounded
 * `request.json()` buffering. Declared and streaming byte counts are enforced,
 * and decoding is strict UTF-8.
 */
export const readBoundedJsonBody = async (request: JsonBodyRequest, maxBytes: number): Promise<unknown> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("MAX_REQUEST_BYTES_INVALID");
  assertJsonContentType(request.headers.get("content-type"));
  const contentEncoding = request.headers.get("content-encoding");
  if (contentEncoding !== null && contentEncoding.toLowerCase() !== "identity") {
    throw new HostedHttpError(415, "UNSUPPORTED_MEDIA_TYPE");
  }
  const expectedBytes = declaredContentLength(request.headers.get("content-length"), maxBytes);
  const bytes = await readBoundedBytes(request.body, expectedBytes, maxBytes);
  const text = decodeUtf8(bytes);
  if (text.trim() === "") throw new HostedHttpError(422, "EMPTY_JSON_BODY");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HostedHttpError(422, "MALFORMED_JSON");
  }
};
