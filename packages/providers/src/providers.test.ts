import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DeterministicEmbeddingProvider,
  DeterministicModelProvider,
  LocalArtifactStore,
  StaticIdentityProvider
} from "./index.js";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("foundation providers", () => {
  it("stores content by digest and verifies it on read", async () => {
    const root = await mkdtemp(join(tmpdir(), "meraki-artifacts-"));
    temporaryDirectories.push(root);
    const store = new LocalArtifactStore(root);
    const bytes = new TextEncoder().encode("immutable fixture");
    const first = await store.put(bytes);
    const second = await store.put(bytes);
    expect(second).toEqual(first);
    expect(await store.get(first.digest)).toEqual({ ...first, bytes });
    expect(await store.delete(first.digest)).toBe(true);
    expect(await store.get(first.digest)).toBeNull();
  });

  it("rejects invalid artifact digest paths", async () => {
    const store = new LocalArtifactStore(tmpdir());
    await expect(store.get("../escape")).rejects.toThrow("Invalid SHA-256 digest");
  });

  it("makes fake model and embedding results repeatable", async () => {
    const model = new DeterministicModelProvider((input) => input.toUpperCase());
    const completion = await model.complete({
      operationId: "fixture",
      input: "repeat",
      model: "fake",
      temperature: 0,
      maxOutputTokens: 20
    });
    expect(completion.output).toBe("REPEAT");

    const embeddings = new DeterministicEmbeddingProvider(8);
    const left = await embeddings.embed({ model: "fake", inputs: ["same"] });
    const right = await embeddings.embed({ model: "fake", inputs: ["same"] });
    expect(left).toEqual(right);
  });

  it("resolves identity from credentials rather than caller fields", async () => {
    const identity = {
      tenantId: "tenant",
      subjectId: "subject",
      actorId: "actor",
      sessionId: "session",
      scopes: ["profile:read"]
    } as const;
    const provider = new StaticIdentityProvider(new Map([["bearer:secret", identity]]));
    await expect(provider.resolve({ scheme: "bearer", credential: "secret" })).resolves.toEqual(identity);
    await expect(provider.resolve({ scheme: "bearer", credential: "wrong" })).resolves.toBeNull();
  });
});
