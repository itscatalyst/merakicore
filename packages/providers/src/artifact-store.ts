import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface ArtifactDescriptor {
  readonly digest: string;
  readonly byteLength: number;
}

export interface StoredArtifact extends ArtifactDescriptor {
  readonly bytes: Uint8Array;
}

export interface ArtifactStore {
  put(bytes: Uint8Array): Promise<ArtifactDescriptor>;
  get(digest: string): Promise<StoredArtifact | null>;
  delete(digest: string): Promise<boolean>;
}

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

export class LocalArtifactStore implements ArtifactStore {
  private readonly root: string;

  public constructor(root: string) {
    this.root = resolve(root);
  }

  public async put(bytes: Uint8Array): Promise<ArtifactDescriptor> {
    const digest = createHash("sha256").update(bytes).digest("hex");
    const target = this.pathFor(digest);
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { flag: "wx" });
    try {
      await rename(temporary, target);
    } catch (error: unknown) {
      await rm(temporary, { force: true });
      try {
        await stat(target);
      } catch {
        throw error;
      }
    }
    return { digest, byteLength: bytes.byteLength };
  }

  public async get(digest: string): Promise<StoredArtifact | null> {
    const target = this.pathFor(digest);
    try {
      const bytes = new Uint8Array(await readFile(target));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== digest) throw new Error(`Artifact digest mismatch: ${digest}`);
      return { digest, byteLength: bytes.byteLength, bytes };
    } catch (error: unknown) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  public async delete(digest: string): Promise<boolean> {
    const target = this.pathFor(digest);
    try {
      await rm(target);
      return true;
    } catch (error: unknown) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  private pathFor(digest: string): string {
    if (!DIGEST_PATTERN.test(digest)) throw new TypeError("Invalid SHA-256 digest");
    return resolve(this.root, digest.slice(0, 2), digest.slice(2, 4), digest);
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
