import {
  ApplicationError,
  parseScope,
  type CommandResult,
  type MerakiApplication,
  type MerakiCommand,
  type MerakiQuery,
  type MutationReceipt
} from "@meraki/application";
import { assertAuthenticatedIdentity, type AuthenticatedContext } from "@meraki/auth";
import type { ProfileAtom, TaskContext } from "@meraki/contracts";

type HttpMethod = "GET" | "POST";
type CommandNamed<Name extends MerakiCommand["name"]> = Extract<MerakiCommand, Readonly<{ name: Name }>>;
type CommandInput<Name extends MerakiCommand["name"]> = CommandNamed<Name>["input"];
type ControlledComparisonInput = Extract<MerakiQuery, Readonly<{ name: "run_controlled_comparison" }>>["input"];

export type HostedRestOperation = Readonly<{ method: HttpMethod; path: string }>;

/**
 * The complete REST surface shared with the local adapter, plus canonical
 * `/studio`. `/dashboard` remains a compatibility alias until the public
 * contract is deliberately versioned.
 */
export const HOSTED_REST_OPERATIONS = Object.freeze([
  { method: "GET", path: "/dashboard" },
  { method: "GET", path: "/studio" },
  { method: "GET", path: "/health" },
  { method: "POST", path: "/v1/corrections" },
  { method: "POST", path: "/v1/activity" },
  { method: "POST", path: "/v1/outcomes" },
  { method: "POST", path: "/v1/learning/candidates" },
  { method: "POST", path: "/v1/agent/run" },
  { method: "GET", path: "/v1/profile/atoms" },
  { method: "GET", path: "/v1/studio/snapshot" },
  { method: "GET", path: "/v1/profile/atoms/{id}/trace" },
  { method: "POST", path: "/v1/profile/atoms/{id}/commands" },
  { method: "GET", path: "/v1/learning/trace/{eventId}" },
  { method: "GET", path: "/v1/update-proposals" },
  { method: "POST", path: "/v1/update-proposals" },
  { method: "POST", path: "/v1/update-proposals/{id}/commands" },
  { method: "GET", path: "/v1/runs" },
  { method: "GET", path: "/v1/runs/{runId}" },
  { method: "GET", path: "/v1/evaluations" },
  { method: "POST", path: "/v1/evaluations" },
  { method: "POST", path: "/v1/evaluations/causal" }
] satisfies readonly HostedRestOperation[]);

export type HostedRestRequest = Readonly<{
  method: HttpMethod;
  path: readonly string[];
  url: URL;
  headers: Headers;
  requestId: string;
  body?: unknown;
}>;

export type HostedRestResult = Readonly<{
  status: number;
  body: unknown;
  headers?: Readonly<Record<string, string>>;
}>;

const activityTypes = new Set<CommandInput<"record_activity">["activityType"]>([
  "approval",
  "rejection",
  "choice",
  "correction",
  "edit",
  "example",
  "workflow_action",
  "outcome"
]);
const atomOperations = new Set<CommandInput<"command_atom">["operation"]>([
  "confirm",
  "edit",
  "rescope",
  "limit",
  "revoke",
  "supersede",
  "weaken",
  "split"
]);
const proposalOperations = new Set<CommandInput<"propose_update">["operation"]>(["reinforce", "weaken"]);
const proposalCommandOperations = new Set<CommandInput<"command_update_proposal">["operation"]>([
  "approve",
  "reject",
  "rollback"
]);
const evaluatorClasses = new Set<CommandInput<"record_evaluation">["evaluatorClass"]>([
  "human_blind",
  "objective",
  "model_weak"
]);
const evaluationResults = new Set<CommandInput<"record_evaluation">["result"]>(["win", "loss", "tie", "abstain"]);
const facets = new Set<ProfileAtom["facet"]>([
  "fact",
  "current_state",
  "goal",
  "identity_declaration",
  "behavior",
  "cognitive_pattern",
  "communication",
  "voice",
  "taste",
  "judgment",
  "judgment.copy",
  "workflow",
  "exemplar",
  "anti_pattern",
  "mode",
  "uncertainty"
]);
const temporalHorizons = new Set<ProfileAtom["temporal_horizon"]>(["run", "temporary", "ongoing", "durable"]);

const fail = (code: string): never => {
  throw new ApplicationError(code);
};

const record = (value: unknown, code = "REQUEST_OBJECT_REQUIRED"): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return fail(code);
  return value as Record<string, unknown>;
};

const string = (value: unknown, code: string): string =>
  typeof value === "string" && value.trim() === value && value.length > 0 ? value : fail(code);

const optionalString = (value: unknown, code: string): string | undefined =>
  value === undefined ? undefined : string(value, code);

const safeInteger = (value: unknown, code: string, minimum = 0): number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum ? value : fail(code);

const finiteNumber = (value: unknown, code: string): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fail(code);

const stringArray = (value: unknown, code: string): readonly string[] => {
  if (!Array.isArray(value)) return fail(code);
  return value.map((candidate) => string(candidate, code));
};

const optionalRecord = (value: unknown, code: string): Record<string, unknown> | undefined =>
  value === undefined ? undefined : record(value, code);

const enumValue = <T extends string>(value: unknown, allowed: ReadonlySet<T>, code: string): T =>
  typeof value === "string" && allowed.has(value as T) ? (value as T) : fail(code);

const bodyFor = (request: HostedRestRequest): Record<string, unknown> => record(request.body, "REQUEST_BODY_REQUIRED");

function identity(
  authority: AuthenticatedContext,
  value: Record<string, unknown>,
  actorRequired: true
): Readonly<{ tenantId: string; subjectId: string; actorId: string }>;
function identity(
  authority: AuthenticatedContext,
  value: Record<string, unknown>,
  actorRequired: false
): Readonly<{ tenantId: string; subjectId: string; actorId?: string }>;
function identity(
  authority: AuthenticatedContext,
  value: Record<string, unknown>,
  actorRequired: boolean
): Readonly<{ tenantId: string; subjectId: string; actorId?: string }> {
  const tenantId = string(value.tenantId, "TENANT_ID_REQUIRED");
  const subjectId = string(value.subjectId, "SUBJECT_ID_REQUIRED");
  const actorId = actorRequired ? string(value.actorId, "ACTOR_ID_REQUIRED") : undefined;
  assertAuthenticatedIdentity(authority, {
    tenantId,
    subjectId,
    ...(actorId === undefined ? {} : { actorId })
  });
  return {
    tenantId: authority.tenantId,
    subjectId: authority.subjectId,
    ...(actorId === undefined ? {} : { actorId: authority.actorId })
  };
}

const parseTaskContext = (value: unknown): TaskContext => {
  const input = record(value, "TASK_CONTEXT_REQUIRED");
  if (input.contract !== "task_context") return fail("TASK_CONTEXT_INVALID");
  const mode = optionalString(input.mode, "TASK_MODE_INVALID");
  const goalId = optionalString(input.goal_id, "GOAL_ID_INVALID");
  return {
    contract: "task_context",
    tenant_id: string(input.tenant_id, "TENANT_ID_REQUIRED"),
    subject_id: string(input.subject_id, "SUBJECT_ID_REQUIRED"),
    task_id: string(input.task_id, "TASK_ID_REQUIRED"),
    task_type: string(input.task_type, "TASK_TYPE_REQUIRED"),
    scope: parseScope(input.scope),
    ...(mode === undefined ? {} : { mode }),
    ...(goalId === undefined ? {} : { goal_id: goalId }),
    constraints: [...stringArray(input.constraints, "TASK_CONSTRAINTS_INVALID")],
    permissions: [...stringArray(input.permissions, "TASK_PERMISSIONS_INVALID")],
    token_budget: safeInteger(input.token_budget, "TOKEN_BUDGET_INVALID")
  };
};

const parseCorrection = (authority: AuthenticatedContext, value: unknown): CommandInput<"record_correction"> => {
  const input = record(value, "INVALID_CORRECTION");
  const owner = identity(authority, input, true);
  const mode = optionalString(input.mode, "MODE_INVALID");
  return {
    tenantId: owner.tenantId,
    subjectId: owner.subjectId,
    actorId: owner.actorId,
    runId: string(input.runId, "RUN_ID_REQUIRED"),
    taskType: string(input.taskType, "TASK_TYPE_REQUIRED"),
    scope: parseScope(input.scope),
    ...(mode === undefined ? {} : { mode }),
    original: string(input.original, "ORIGINAL_REQUIRED"),
    correction: string(input.correction, "CORRECTION_REQUIRED")
  };
};

const parseActivity = (authority: AuthenticatedContext, value: unknown): CommandInput<"record_activity"> => {
  const input = record(value, "INVALID_ACTIVITY");
  const owner = identity(authority, input, true);
  const mode = optionalString(input.mode, "MODE_INVALID");
  const payload = optionalRecord(input.payload, "ACTIVITY_PAYLOAD_INVALID");
  return {
    tenantId: owner.tenantId,
    subjectId: owner.subjectId,
    actorId: owner.actorId,
    runId: string(input.runId, "RUN_ID_REQUIRED"),
    taskType: string(input.taskType, "TASK_TYPE_REQUIRED"),
    activityType: enumValue(input.activityType, activityTypes, "ACTIVITY_TYPE_INVALID"),
    content: string(input.content, "CONTENT_REQUIRED"),
    scope: parseScope(input.scope),
    ...(mode === undefined ? {} : { mode }),
    ...(payload === undefined ? {} : { payload })
  };
};

const parseOutcome = (authority: AuthenticatedContext, value: unknown): CommandInput<"record_outcome"> => {
  const input = record(value, "INVALID_OUTCOME");
  const owner = identity(authority, input, false);
  const mode = optionalString(input.mode, "MODE_INVALID");
  return {
    tenantId: owner.tenantId,
    subjectId: owner.subjectId,
    runId: string(input.runId, "RUN_ID_REQUIRED"),
    outcomeType: string(input.outcomeType, "OUTCOME_TYPE_REQUIRED"),
    outcome: record(input.outcome, "OUTCOME_REQUIRED"),
    scope: parseScope(input.scope),
    ...(mode === undefined ? {} : { mode })
  };
};

const parseCandidate = (value: unknown): CommandInput<"extract_candidate"> => {
  const input = record(value, "INVALID_ACTIVITY_LESSON");
  const facet = input.facet === undefined ? undefined : enumValue(input.facet, facets, "CANDIDATE_FACET_INVALID");
  const temporalHorizon =
    input.temporal_horizon === undefined
      ? undefined
      : enumValue(input.temporal_horizon, temporalHorizons, "CANDIDATE_TEMPORAL_HORIZON_INVALID");
  return {
    eventId: string(input.event_id, "EVENT_ID_REQUIRED"),
    claim: string(input.claim, "CLAIM_REQUIRED"),
    ...(facet === undefined ? {} : { facet }),
    ...(temporalHorizon === undefined ? {} : { temporalHorizon })
  };
};

const parseRun = (authority: AuthenticatedContext, value: unknown): CommandInput<"run_agent"> => {
  const input = record(value, "INVALID_RUN");
  const context = parseTaskContext(input.context);
  assertAuthenticatedIdentity(authority, {
    tenantId: context.tenant_id,
    subjectId: context.subject_id
  });
  return {
    context: {
      ...context,
      tenant_id: authority.tenantId,
      subject_id: authority.subjectId
    },
    request: string(input.request, "REQUEST_REQUIRED"),
    baseline: string(input.baseline, "BASELINE_REQUIRED")
  };
};

const parseControlledComparison = (authority: AuthenticatedContext, value: unknown): ControlledComparisonInput => {
  const input = record(value, "INVALID_CAUSAL_EVALUATION");
  const experimentId = optionalString(input.experiment_id, "EXPERIMENT_ID_INVALID");
  return {
    correction: parseCorrection(authority, input.correction),
    related: parseRun(authority, input.related),
    unrelated: parseRun(authority, input.unrelated),
    ...(experimentId === undefined ? {} : { experimentId })
  };
};

const parseEvaluation = (value: unknown): CommandInput<"record_evaluation"> => {
  const input = record(value, "INVALID_EVALUATION");
  const uncertainty = finiteNumber(input.uncertainty, "EVALUATION_UNCERTAINTY_INVALID");
  if (uncertainty < 0 || uncertainty > 1) return fail("EVALUATION_UNCERTAINTY_INVALID");
  const reason = optionalString(input.reason, "EVALUATION_REASON_INVALID");
  const evaluatorIdentityDigest = optionalString(input.evaluator_identity_digest, "EVALUATOR_IDENTITY_DIGEST_INVALID");
  if (evaluatorIdentityDigest !== undefined && !/^sha256:[0-9a-f]{64}$/u.test(evaluatorIdentityDigest))
    return fail("EVALUATOR_IDENTITY_DIGEST_INVALID");
  const criteria = record(input.criteria, "EVALUATION_CRITERIA_INVALID");
  for (const criterion of Object.values(criteria))
    if (typeof criterion !== "number" || !Number.isFinite(criterion)) return fail("EVALUATION_CRITERIA_INVALID");
  return {
    runId: string(input.run_id, "RUN_ID_REQUIRED"),
    experimentId: string(input.experiment_id, "EXPERIMENT_ID_REQUIRED"),
    armId: string(input.arm_id, "ARM_ID_REQUIRED"),
    evaluatorClass: enumValue(input.evaluator_class, evaluatorClasses, "EVALUATOR_CLASS_INVALID"),
    criteria,
    result: enumValue(input.result, evaluationResults, "EVALUATION_RESULT_INVALID"),
    uncertainty,
    ...(reason === undefined ? {} : { reason }),
    ...(evaluatorIdentityDigest === undefined ? {} : { evaluatorIdentityDigest })
  };
};

const parseUpdateProposal = (value: unknown): CommandInput<"propose_update"> => {
  const input = record(value, "INVALID_UPDATE_PROPOSAL");
  return {
    lessonId: string(input.lesson_id, "LESSON_ID_REQUIRED"),
    evidenceEventId: string(input.evidence_event_id, "EVIDENCE_EVENT_ID_REQUIRED"),
    operation: enumValue(input.operation, proposalOperations, "UPDATE_PROPOSAL_OPERATION_INVALID")
  };
};

const parseUpdateProposalCommand = (proposalId: string, value: unknown): CommandInput<"command_update_proposal"> => {
  const input = record(value, "INVALID_UPDATE_PROPOSAL_COMMAND");
  const reason = input.reason === undefined ? undefined : optionalString(input.reason, "DECISION_REASON_INVALID");
  return {
    proposalId,
    operation: enumValue(input.operation, proposalCommandOperations, "UPDATE_PROPOSAL_OPERATION_INVALID"),
    ...(reason === undefined ? {} : { reason })
  };
};

const parseAtomCommand = (atomId: string, value: unknown): CommandInput<"command_atom"> => {
  const input = record(value, "INVALID_ATOM_COMMAND");
  if (string(input.atom_id, "ATOM_ID_REQUIRED") !== atomId) return fail("ATOM_ID_MISMATCH");
  const operation = enumValue(input.operation, atomOperations, "ATOM_OPERATION_INVALID");
  const claim = optionalString(input.claim, "ATOM_CLAIM_INVALID");
  const claims = input.claims === undefined ? undefined : stringArray(input.claims, "ATOM_CLAIMS_INVALID");
  const counterevidenceEventId = optionalString(input.counterevidence_event_id, "COUNTEREVIDENCE_EVENT_ID_INVALID");
  const mode = optionalString(input.mode, "ATOM_MODE_INVALID");
  const reason = optionalString(input.reason, "DECISION_REASON_INVALID");
  return {
    atomId,
    expectedVersion: safeInteger(input.expected_version, "EXPECTED_VERSION_INVALID", 1),
    operation,
    ...(claim === undefined ? {} : { claim }),
    ...(claims === undefined ? {} : { claims }),
    ...(counterevidenceEventId === undefined ? {} : { counterevidenceEventId }),
    ...(input.scope === undefined ? {} : { scope: parseScope(input.scope) }),
    ...(mode === undefined ? {} : { mode }),
    ...(reason === undefined ? {} : { reason })
  };
};

const listLimit = (url: URL): number => {
  const raw = url.searchParams.get("limit");
  if (raw === null) return 100;
  if (!/^\d+$/u.test(raw)) return fail("LIST_LIMIT_INVALID");
  return safeInteger(Number(raw), "LIST_LIMIT_INVALID", 1) <= 1000 ? Number(raw) : fail("LIST_LIMIT_INVALID");
};

const idempotencyKey = (headers: Headers, requestId: string): string => {
  const value = headers.get("idempotency-key");
  if (value === null) return `request:${requestId}`;
  if (!value || value.trim() !== value || value.length > 255) return fail("IDEMPOTENCY_KEY_INVALID");
  return value;
};

const expectedRevision = (headers: Headers): number | undefined => {
  const value = headers.get("if-match");
  if (value === null) return undefined;
  const match = /^"?(0|[1-9]\d*)"?$/u.exec(value);
  if (match?.[1] === undefined) return fail("EXPECTED_REVISION_HEADER_INVALID");
  return safeInteger(Number(match[1]), "EXPECTED_REVISION_HEADER_INVALID");
};

const receiptHeaders = <T>(receipt: MutationReceipt<T>): Readonly<Record<string, string>> => ({
  etag: `"${receipt.revision}"`,
  "x-meraki-revision": String(receipt.revision),
  "x-meraki-snapshot-hash": receipt.snapshotHash,
  "x-meraki-idempotent-replay": String(receipt.replayed)
});

const mutation = async <C extends MerakiCommand>(
  application: MerakiApplication,
  authority: AuthenticatedContext,
  request: HostedRestRequest,
  command: C,
  body: (value: CommandResult<C>) => unknown,
  status = 200
): Promise<HostedRestResult> => {
  const revision = expectedRevision(request.headers);
  const receipt = await application.mutate(authority, {
    requestId: request.requestId,
    idempotencyKey: idempotencyKey(request.headers, request.requestId),
    ...(revision === undefined ? {} : { expectedRevision: revision }),
    command
  });
  return {
    status,
    body: body(receipt.value),
    headers: receiptHeaders(receipt)
  };
};

const isPath = (actual: readonly string[], ...expected: readonly string[]): boolean =>
  actual.length === expected.length && actual.every((segment, index) => segment === expected[index]);

const dynamicPath = (
  actual: readonly string[],
  prefix: readonly string[],
  suffix: readonly string[] = []
): string | undefined => {
  if (actual.length !== prefix.length + 1 + suffix.length) return undefined;
  if (!prefix.every((segment, index) => actual[index] === segment)) return undefined;
  if (!suffix.every((segment, index) => actual[prefix.length + 1 + index] === segment)) return undefined;
  const identifier = actual[prefix.length];
  return identifier && identifier.trim() ? identifier : undefined;
};

export const dispatchHostedRest = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  request: HostedRestRequest
): Promise<HostedRestResult> => {
  if (request.method === "POST" && isPath(request.path, "corrections"))
    return mutation(
      application,
      authority,
      request,
      { name: "record_correction", input: parseCorrection(authority, bodyFor(request)) },
      (value) => ({ evidence: value }),
      201
    );

  if (request.method === "POST" && isPath(request.path, "activity"))
    return mutation(
      application,
      authority,
      request,
      { name: "record_activity", input: parseActivity(authority, bodyFor(request)) },
      (value) => ({ evidence: value }),
      201
    );

  if (request.method === "POST" && isPath(request.path, "outcomes"))
    return mutation(
      application,
      authority,
      request,
      { name: "record_outcome", input: parseOutcome(authority, bodyFor(request)) },
      (value) => ({ evidence: value }),
      201
    );

  if (request.method === "POST" && isPath(request.path, "learning", "candidates"))
    return mutation(
      application,
      authority,
      request,
      { name: "extract_candidate", input: parseCandidate(bodyFor(request)) },
      (value) => ({ lesson: value }),
      201
    );

  if (request.method === "POST" && isPath(request.path, "agent", "run"))
    return mutation(
      application,
      authority,
      request,
      { name: "run_agent", input: parseRun(authority, bodyFor(request)) },
      (value) => value
    );

  if (request.method === "GET" && isPath(request.path, "profile", "atoms"))
    return {
      status: 200,
      body: {
        items: await application.query(authority, {
          name: "list_atoms",
          input: { limit: listLimit(request.url) }
        })
      }
    };

  if (request.method === "GET" && isPath(request.path, "studio", "snapshot"))
    return {
      status: 200,
      body: {
        snapshot: await application.query(authority, {
          name: "studio_snapshot",
          input: { limit: listLimit(request.url) }
        })
      }
    };

  const atomTraceId = dynamicPath(request.path, ["profile", "atoms"], ["trace"]);
  if (request.method === "GET" && atomTraceId !== undefined)
    return {
      status: 200,
      body: {
        trace: await application.query(authority, {
          name: "atom_trace",
          input: { atomId: atomTraceId }
        })
      }
    };

  const atomCommandId = dynamicPath(request.path, ["profile", "atoms"], ["commands"]);
  if (request.method === "POST" && atomCommandId !== undefined) {
    const command = parseAtomCommand(atomCommandId, bodyFor(request));
    return mutation(application, authority, request, { name: "command_atom", input: command }, (value) =>
      command.operation === "split" ? { atoms: value } : { atom: value }
    );
  }

  const eventId = dynamicPath(request.path, ["learning", "trace"]);
  if (request.method === "GET" && eventId !== undefined)
    return {
      status: 200,
      body: {
        trace: await application.query(authority, {
          name: "learning_trace",
          input: { eventId }
        })
      }
    };

  if (request.method === "GET" && isPath(request.path, "update-proposals"))
    return {
      status: 200,
      body: {
        items: await application.query(authority, {
          name: "list_update_proposals",
          input: { limit: listLimit(request.url) }
        })
      }
    };

  if (request.method === "POST" && isPath(request.path, "update-proposals"))
    return mutation(
      application,
      authority,
      request,
      { name: "propose_update", input: parseUpdateProposal(bodyFor(request)) },
      (value) => ({ proposal: value }),
      201
    );

  const proposalId = dynamicPath(request.path, ["update-proposals"], ["commands"]);
  if (request.method === "POST" && proposalId !== undefined)
    return mutation(
      application,
      authority,
      request,
      {
        name: "command_update_proposal",
        input: parseUpdateProposalCommand(proposalId, bodyFor(request))
      },
      (value) => value
    );

  if (request.method === "GET" && isPath(request.path, "runs")) {
    const page = await application.query(authority, {
      name: "list_run_page",
      input: { limit: listLimit(request.url) }
    });
    return {
      status: 200,
      body: {
        items: page.items,
        total: page.total,
        summary: {
          guidance_applied: page.summary.guidanceApplied,
          baseline_preserved: page.summary.baselinePreserved
        }
      }
    };
  }

  const runId = dynamicPath(request.path, ["runs"]);
  if (request.method === "GET" && runId !== undefined) {
    const run = await application.query(authority, { name: "get_run", input: { runId } });
    if (run === undefined) return fail("RUN_NOT_FOUND");
    return { status: 200, body: run };
  }

  if (request.method === "GET" && isPath(request.path, "evaluations"))
    return {
      status: 200,
      body: {
        items: await application.query(authority, {
          name: "list_evaluations",
          input: { limit: listLimit(request.url) }
        })
      }
    };

  if (request.method === "POST" && isPath(request.path, "evaluations"))
    return mutation(
      application,
      authority,
      request,
      { name: "record_evaluation", input: parseEvaluation(bodyFor(request)) },
      (value) => ({ record: value }),
      201
    );

  if (request.method === "POST" && isPath(request.path, "evaluations", "causal"))
    return {
      status: 201,
      body: {
        report: await application.query(authority, {
          name: "run_controlled_comparison",
          input: parseControlledComparison(authority, bodyFor(request))
        })
      }
    };

  return fail("ROUTE_NOT_FOUND");
};
