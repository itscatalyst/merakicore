import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export type Sha256Digest = `sha256:${string}`;

export function canonicalJson(value: unknown): string {
  assertJsonValue(value, "$", new Set<object>());
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new TypeError("RFC 8785 canonicalization requires a JSON value");
  return serialized;
}

export function sha256Digest(value: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function utcNow(): string {
  return new Date().toISOString();
}

function assertJsonValue(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError(`${path} contains a circular reference`);
    seen.add(value);
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  if (typeof value === "object") {
    if (seen.has(value)) throw new TypeError(`${path} contains a circular reference`);
    seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) throw new TypeError(`${path}.${key} is undefined`);
      assertJsonValue(item, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }
  throw new TypeError(`${path} is not valid JSON`);
}
