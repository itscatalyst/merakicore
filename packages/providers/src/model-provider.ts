export interface ModelRequest {
  readonly operationId: string;
  readonly input: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxOutputTokens: number;
  readonly signal?: AbortSignal;
}

export interface ModelCompletion {
  readonly provider: string;
  readonly model: string;
  readonly output: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/** Provider calls are made before opening a domain database transaction. */
export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelCompletion>;
}

export class DeterministicModelProvider implements ModelProvider {
  public constructor(private readonly respond: (input: string) => string) {}

  public complete(request: ModelRequest): Promise<ModelCompletion> {
    if (request.signal?.aborted === true) {
      return Promise.reject(
        request.signal.reason instanceof Error
          ? request.signal.reason
          : new Error("Model request aborted")
      );
    }
    const output = this.respond(request.input);
    return Promise.resolve({
      provider: "deterministic-fake",
      model: request.model,
      output,
      inputTokens: request.input.length,
      outputTokens: output.length
    });
  }
}
