import { createHash } from "node:crypto";

export interface EmbeddingRequest {
  readonly model: string;
  readonly inputs: readonly string[];
  readonly signal?: AbortSignal;
}

export interface EmbeddingResult {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  readonly vectors: readonly (readonly number[])[];
}

export interface EmbeddingProvider {
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

/** Stable test-only embeddings; never presented as semantically meaningful. */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  public constructor(private readonly dimensions = 16) {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new RangeError("dimensions must be a positive integer");
    }
  }

  public embed(request: EmbeddingRequest): Promise<EmbeddingResult> {
    if (request.signal?.aborted === true) {
      return Promise.reject(
        request.signal.reason instanceof Error
          ? request.signal.reason
          : new Error("Embedding request aborted")
      );
    }
    const vectors = request.inputs.map((input) => {
      const bytes = createHash("sha256").update(input, "utf8").digest();
      return Array.from({ length: this.dimensions }, (_, index) =>
        (bytes[index % bytes.length]! / 127.5) - 1
      );
    });
    return Promise.resolve({
      provider: "deterministic-fake",
      model: request.model,
      dimensions: this.dimensions,
      vectors
    });
  }
}
