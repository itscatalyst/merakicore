export type SafeHttpStatus = 401 | 403 | 404 | 409 | 413 | 415 | 422 | 500;

export type SafeHttpErrorDescriptor = Readonly<{
  status: SafeHttpStatus;
  code: string;
  message: string;
}>;

export type SafeHttpErrorBody = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
    requestId: string;
  }>;
}>;

const STATUS_MESSAGES: Readonly<Record<SafeHttpStatus, string>> = {
  401: "Authentication is required.",
  403: "The request is not permitted.",
  404: "The requested resource was not found.",
  409: "The request conflicts with the current state.",
  413: "The request body is too large.",
  415: "The request media type is not supported.",
  422: "The request is invalid.",
  500: "The server could not complete the request."
};

const AUTHENTICATION_CODES = new Set([
  "expired_token",
  "invalid_token",
  "invalid_token_claims",
  "invalid_token_record",
  "malformed_token",
  "missing_transaction_credential",
  "missing_token",
  "revoked_token",
  "token_authority_changed"
]);

const AUTHORIZATION_CODES = new Set(["identity_mismatch", "insufficient_scope"]);

const NOT_FOUND_CODES = new Set([
  "ATOM_NOT_FOUND",
  "ATOM_TRACE_NOT_FOUND",
  "EVIDENCE_NOT_FOUND",
  "EVENT_NOT_FOUND",
  "HYPOTHESIS_NOT_FOUND",
  "LESSON_NOT_FOUND",
  "LEARNING_TRACE_NOT_FOUND",
  "OBSERVATION_NOT_FOUND",
  "RUN_NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "SIGNAL_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "UPDATE_PROPOSAL_NOT_FOUND"
]);

const CONFLICT_CODES = new Set([
  "ACTIVITY_LESSON_CLAIM_CONFLICT",
  "ATOM_LIFECYCLE_PRECONDITION_FAILED",
  "ATOM_VERSION_CONFLICT",
  "CANDIDATE_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "REVISION_CONFLICT",
  "VERSION_CONFLICT",
  "UPDATE_PROPOSAL_NOT_APPLIED",
  "UPDATE_PROPOSAL_NOT_PENDING"
]);

const VALIDATION_CODES = new Set([
  "ACTIVITY_CONTENT_REQUIRED",
  "ACTIVITY_LESSON_TRUST_REQUIRED",
  "ACTIVITY_PAYLOAD_INVALID",
  "ACTIVITY_TYPE_INVALID",
  "ACTIVE_ATOM_REQUIRED",
  "ACTOR_ID_REQUIRED",
  "ARM_ID_REQUIRED",
  "ATOM_CLAIMS_INVALID",
  "ATOM_CLAIM_INVALID",
  "ATOM_ID_MISMATCH",
  "ATOM_ID_REQUIRED",
  "ATOM_MODE_INVALID",
  "ATOM_OPERATION_INVALID",
  "BASELINE_REQUIRED",
  "CAUSAL_CANDIDATE_ACTIVATED_BEFORE_APPROVAL",
  "CAUSAL_CANDIDATE_REQUIRED",
  "CANDIDATE_FACET_INVALID",
  "CANDIDATE_TEMPORAL_HORIZON_INVALID",
  "CLAIM_REQUIRED",
  "CONTENT_REQUIRED",
  "CONSENT_REQUIRED",
  "CONTENT_LENGTH_MISMATCH",
  "CORRECTION_EVENT_REQUIRED",
  "CORRECTION_REQUIRED",
  "CORRECTION_TEXT_REQUIRED",
  "COUNTEREVIDENCE_REVIEW_REQUIRED",
  "COUNTEREVIDENCE_EVENT_ID_INVALID",
  "COUNTEREVIDENCE_SPAN_REQUIRED",
  "COUNTEREVIDENCE_SUBJECT_MISMATCH",
  "COUNTEREVIDENCE_TRUST_REQUIRED",
  "CURRENT_STATE_MUST_BE_TEMPORAL",
  "DECISION_REASON_INVALID",
  "EMPTY_JSON_BODY",
  "EPISTEMIC_CLASS_INVALID",
  "EVALUATION_CRITERIA_INVALID",
  "EVALUATION_REASON_INVALID",
  "EVALUATION_RESULT_INVALID",
  "EVALUATION_UNCERTAINTY_INVALID",
  "EVALUATOR_CLASS_INVALID",
  "EVALUATOR_IDENTITY_DIGEST_INVALID",
  "EVENT_ID_REQUIRED",
  "EVIDENCE_REQUIRED",
  "EVIDENCE_EVENT_ID_REQUIRED",
  "EXPECTED_REVISION_HEADER_INVALID",
  "EXPECTED_REVISION_INVALID",
  "EXPECTED_VERSION_INVALID",
  "EXPERIMENT_ID_INVALID",
  "EXPERIMENT_ID_REQUIRED",
  "FACET_INVALID",
  "GOAL_ID_INVALID",
  "IDEMPOTENCY_KEY_INVALID",
  "IDEMPOTENCY_KEY_REQUIRED",
  "INVALID_ACTIVITY",
  "INVALID_ACTIVITY_LESSON",
  "INVALID_ATOM_COMMAND",
  "INVALID_CAUSAL_EVALUATION",
  "INVALID_CORRECTION",
  "INVALID_EVALUATION",
  "INVALID_OUTCOME",
  "INVALID_RUN",
  "INVALID_UPDATE_PROPOSAL",
  "INVALID_UPDATE_PROPOSAL_COMMAND",
  "INVALID_CONTENT_LENGTH",
  "INVALID_JSON_CHUNK",
  "INVALID_UTF8",
  "LIST_LIMIT_INVALID",
  "LESSON_ID_REQUIRED",
  "MALFORMED_JSON",
  "MODE_INVALID",
  "MODEL_OUTPUT_REQUIRED",
  "OUTCOME_REQUIRED",
  "OUTCOME_TYPE_REQUIRED",
  "ORIGINAL_REQUIRED",
  "POTENTIAL_PROMPT_INJECTION_REVIEW_REQUIRED",
  "RAW_MEMORY_REQUIRED",
  "REQUEST_BODY_READ_FAILED",
  "REQUEST_BODY_REQUIRED",
  "REQUEST_ID_REQUIRED",
  "REQUEST_OBJECT_REQUIRED",
  "REQUEST_REQUIRED",
  "RESERVED_ACTIVITY_PAYLOAD_FIELD",
  "RESTORE_REVISION_REQUIRED",
  "RESTORE_SUBJECT_MISMATCH",
  "RESTORE_TARGET_MISMATCH",
  "RUN_ID_REQUIRED",
  "SCOPE_INVALID",
  "SCOPE_LEVEL_INVALID",
  "SCOPE_LEVEL_REQUIRED",
  "SCOPE_REF_INVALID",
  "SCOPE_REF_REQUIRED",
  "SCOPE_REQUIRED",
  "SPLIT_CLAIMS_REQUIRED",
  "SUBJECT_ID_REQUIRED",
  "TASK_CONTEXT_INVALID",
  "TASK_CONTEXT_REQUIRED",
  "TASK_CONSTRAINTS_INVALID",
  "TASK_ID_REQUIRED",
  "TASK_MODE_INVALID",
  "TASK_PERMISSIONS_INVALID",
  "TASK_TYPE_REQUIRED",
  "TEMPORAL_HORIZON_INVALID",
  "TENANT_ID_REQUIRED",
  "TOKEN_BUDGET_INVALID",
  "UNTRUSTED_SOURCE",
  "UPDATE_EVIDENCE_REVIEW_REQUIRED",
  "UPDATE_EVIDENCE_SPAN_REQUIRED",
  "UPDATE_EVIDENCE_SUBJECT_MISMATCH",
  "UPDATE_EVIDENCE_TRUST_REQUIRED",
  "UPDATE_PROPOSAL_OPERATION_INVALID",
  "UPDATE_OPERATION_INVALID"
]);

const safeDescriptor = (status: SafeHttpStatus, code: string): SafeHttpErrorDescriptor =>
  Object.freeze({ status, code, message: STATUS_MESSAGES[status] });

/**
 * An intentionally message-free transport error.
 *
 * Callers choose only a status and a stable public code. Runtime values,
 * credentials, database details, and caught exception messages never become
 * part of the response.
 */
export class HostedHttpError extends Error {
  public constructor(
    public readonly status: SafeHttpStatus,
    public readonly code: string
  ) {
    super(code);
    this.name = "HostedHttpError";
  }
}

const knownCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return error instanceof Error ? error.message : undefined;
};

export const classifyHttpError = (error: unknown): SafeHttpErrorDescriptor => {
  if (error instanceof HostedHttpError) return safeDescriptor(error.status, error.code);

  const code = knownCode(error);
  if (code !== undefined && AUTHENTICATION_CODES.has(code)) return safeDescriptor(401, "AUTHENTICATION_REQUIRED");
  if (code !== undefined && AUTHORIZATION_CODES.has(code)) return safeDescriptor(403, "FORBIDDEN");
  if (code !== undefined && NOT_FOUND_CODES.has(code)) return safeDescriptor(404, code);
  if (code !== undefined && CONFLICT_CODES.has(code)) return safeDescriptor(409, code);
  if (code !== undefined && VALIDATION_CODES.has(code)) return safeDescriptor(422, code);
  if (code === "PERSISTENCE_FAILED") return safeDescriptor(500, "INTERNAL_ERROR");
  return safeDescriptor(500, "INTERNAL_ERROR");
};

export const safeHttpErrorBody = (
  error: unknown,
  requestId: string
): Readonly<{ status: SafeHttpStatus; body: SafeHttpErrorBody }> => {
  const descriptor = classifyHttpError(error);
  return Object.freeze({
    status: descriptor.status,
    body: Object.freeze({
      error: Object.freeze({
        code: descriptor.code,
        message: descriptor.message,
        requestId
      })
    })
  });
};

export const safeHttpErrorResponse = (error: unknown, requestId: string, headers?: HeadersInit): Response => {
  const classified = safeHttpErrorBody(error, requestId);
  const responseHeaders = new Headers(headers);
  responseHeaders.set("cache-control", "private, no-store, max-age=0, must-revalidate");
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("x-request-id", requestId);
  return new Response(JSON.stringify(classified.body), {
    status: classified.status,
    headers: responseHeaders
  });
};
