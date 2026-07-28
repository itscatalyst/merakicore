export class ApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable = false
  ) {
    super(code);
    this.name = "ApplicationError";
  }
}

export class IdempotencyConflictError extends ApplicationError {
  public constructor() {
    super("IDEMPOTENCY_CONFLICT");
    this.name = "IdempotencyConflictError";
  }
}

export const applicationErrorCode = (error: unknown, fallback = "APPLICATION_OPERATION_FAILED"): string =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : error instanceof Error
      ? error.message
      : fallback;
