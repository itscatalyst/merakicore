import type { ProfileAtom, Scope, TaskContext } from "@meraki/contracts";
import { normalizeTaskContext, scopeFromUnknown } from "@meraki/core";

export type JsonSchema = Readonly<Record<string, unknown>>;

export type MutationMetadataInput = Readonly<{
  request_id?: string;
  idempotency_key?: string;
}>;

export type ContextInput = Readonly<{ context: TaskContext }>;
export type FeedbackInput = MutationMetadataInput &
  Readonly<{
    tenantId: string;
    subjectId: string;
    actorId: string;
    runId: string;
    taskType: string;
    activityType:
      | "approval"
      | "rejection"
      | "choice"
      | "correction"
      | "edit"
      | "example"
      | "workflow_action"
      | "outcome";
    content: string;
    scope: Scope;
    mode?: string;
    payload?: Record<string, unknown>;
    consent?: Readonly<{
      status: "granted" | "denied" | "revoked";
      purposes: string[];
      recorded_at: string;
    }>;
  }>;
export type OutcomeInput = MutationMetadataInput &
  Readonly<{
    tenantId: string;
    subjectId: string;
    runId: string;
    outcomeType: string;
    outcome: Record<string, unknown>;
    scope: Scope;
    mode?: string;
  }>;
export type ProposeCandidateInput = MutationMetadataInput &
  Readonly<{
    event_id: string;
    claim: string;
    facet?: ProfileAtom["facet"];
    temporal_horizon?: ProfileAtom["temporal_horizon"];
  }>;
export type CandidateIdInput = Readonly<{ candidate_id: string }>;
export type CandidateDecisionInput = MutationMetadataInput &
  Readonly<{
    candidate_id: string;
    expected_version: number;
    reason: string;
  }>;
export type CandidateRescopeInput = CandidateDecisionInput &
  Readonly<{
    scope: Scope;
    mode?: string;
  }>;
export type RevokeAtomInput = MutationMetadataInput &
  Readonly<{
    atom_id: string;
    expected_version: number;
    reason: string;
  }>;
export type LearningTraceInput =
  | Readonly<{ event_id: string; atom_id?: never }>
  | Readonly<{ event_id?: never; atom_id: string }>;

const nonEmptyStringSchema = { type: "string", minLength: 1 } as const;
export const scopeSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        level: { const: "user" },
        ref: nonEmptyStringSchema
      },
      required: ["level"],
      additionalProperties: false
    },
    {
      type: "object",
      properties: {
        level: {
          enum: ["run", "task", "project", "mode", "domain", "workspace", "relationship", "team"]
        },
        ref: nonEmptyStringSchema
      },
      required: ["level", "ref"],
      additionalProperties: false
    }
  ]
} as const;

export const taskContextSchema = {
  type: "object",
  properties: {
    contract: { const: "task_context" },
    tenant_id: nonEmptyStringSchema,
    subject_id: nonEmptyStringSchema,
    task_id: nonEmptyStringSchema,
    task_type: nonEmptyStringSchema,
    scope: scopeSchema,
    mode: nonEmptyStringSchema,
    goal_id: nonEmptyStringSchema,
    constraints: { type: "array", items: { type: "string" } },
    permissions: { type: "array", items: nonEmptyStringSchema, uniqueItems: true },
    token_budget: { type: "integer", minimum: 0 }
  },
  required: [
    "contract",
    "tenant_id",
    "subject_id",
    "task_id",
    "task_type",
    "scope",
    "constraints",
    "permissions",
    "token_budget"
  ],
  additionalProperties: false
} as const;

const mutationProperties = {
  request_id: nonEmptyStringSchema,
  idempotency_key: nonEmptyStringSchema
} as const;
const candidateDecisionProperties = {
  candidate_id: nonEmptyStringSchema,
  expected_version: { type: "integer", minimum: 1 },
  reason: nonEmptyStringSchema,
  ...mutationProperties
} as const;
const evidenceEnvelopeSchema = {
  type: "object",
  required: ["evidence", "mutation"],
  properties: { evidence: { type: "object" }, mutation: { type: "object" } },
  additionalProperties: false
} as const;
const candidateEnvelopeSchema = {
  type: "object",
  required: ["candidate", "mutation"],
  properties: { candidate: { type: "object" }, mutation: { type: "object" } },
  additionalProperties: false
} as const;

export const toolSchemas = {
  meraki_get_guidance: {
    input: {
      type: "object",
      properties: { context: taskContextSchema },
      required: ["context"],
      additionalProperties: false
    },
    output: {
      type: "object",
      required: ["candidates", "pack"],
      properties: { candidates: { type: "array" }, pack: { type: "object" } },
      additionalProperties: false
    }
  },
  meraki_get_examples: {
    input: {
      type: "object",
      properties: { context: taskContextSchema },
      required: ["context"],
      additionalProperties: false
    },
    output: { type: "array", items: { type: "object" } }
  },
  meraki_explain_guidance: {
    input: {
      type: "object",
      properties: { context: taskContextSchema },
      required: ["context"],
      additionalProperties: false
    },
    output: {
      type: "object",
      required: ["candidates", "pack"],
      properties: { candidates: { type: "array" }, pack: { type: "object" } },
      additionalProperties: false
    }
  },
  meraki_record_feedback: {
    input: {
      type: "object",
      properties: {
        tenantId: nonEmptyStringSchema,
        subjectId: nonEmptyStringSchema,
        actorId: nonEmptyStringSchema,
        runId: nonEmptyStringSchema,
        taskType: nonEmptyStringSchema,
        activityType: {
          enum: ["approval", "rejection", "choice", "correction", "edit", "example", "workflow_action", "outcome"]
        },
        content: nonEmptyStringSchema,
        scope: scopeSchema,
        mode: nonEmptyStringSchema,
        payload: { type: "object", additionalProperties: true },
        consent: {
          type: "object",
          properties: {
            status: { enum: ["granted", "denied", "revoked"] },
            purposes: { type: "array", items: { type: "string" }, uniqueItems: true },
            recorded_at: { type: "string", format: "date-time" }
          },
          required: ["status", "purposes", "recorded_at"],
          additionalProperties: false
        },
        ...mutationProperties
      },
      required: ["tenantId", "subjectId", "actorId", "runId", "taskType", "activityType", "content", "scope"],
      additionalProperties: false
    },
    output: evidenceEnvelopeSchema
  },
  meraki_record_outcome: {
    input: {
      type: "object",
      properties: {
        tenantId: nonEmptyStringSchema,
        subjectId: nonEmptyStringSchema,
        runId: nonEmptyStringSchema,
        outcomeType: nonEmptyStringSchema,
        outcome: { type: "object", additionalProperties: true },
        scope: scopeSchema,
        mode: nonEmptyStringSchema,
        ...mutationProperties
      },
      required: ["tenantId", "subjectId", "runId", "outcomeType", "outcome", "scope"],
      additionalProperties: false
    },
    output: evidenceEnvelopeSchema
  },
  meraki_propose_candidate: {
    input: {
      type: "object",
      properties: {
        event_id: nonEmptyStringSchema,
        claim: nonEmptyStringSchema,
        facet: {
          enum: [
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
          ]
        },
        temporal_horizon: { enum: ["run", "temporary", "ongoing", "durable"] },
        ...mutationProperties
      },
      required: ["event_id", "claim"],
      additionalProperties: false
    },
    output: candidateEnvelopeSchema
  },
  meraki_list_candidates: {
    input: { type: "object", properties: {}, additionalProperties: false },
    output: {
      type: "object",
      required: ["candidates"],
      properties: { candidates: { type: "array" } },
      additionalProperties: false
    }
  },
  meraki_explain_candidate: {
    input: {
      type: "object",
      properties: { candidate_id: nonEmptyStringSchema },
      required: ["candidate_id"],
      additionalProperties: false
    },
    output: {
      type: "object",
      required: ["candidate", "trace", "review"],
      properties: { candidate: { type: "object" }, trace: { type: "object" }, review: { type: "object" } },
      additionalProperties: false
    }
  },
  meraki_approve_candidate: {
    input: {
      type: "object",
      properties: candidateDecisionProperties,
      required: ["candidate_id", "expected_version", "reason"],
      additionalProperties: false
    },
    output: candidateEnvelopeSchema
  },
  meraki_reject_candidate: {
    input: {
      type: "object",
      properties: candidateDecisionProperties,
      required: ["candidate_id", "expected_version", "reason"],
      additionalProperties: false
    },
    output: candidateEnvelopeSchema
  },
  meraki_rescope_candidate: {
    input: {
      type: "object",
      properties: { ...candidateDecisionProperties, scope: scopeSchema, mode: nonEmptyStringSchema },
      required: ["candidate_id", "expected_version", "reason", "scope"],
      additionalProperties: false
    },
    output: candidateEnvelopeSchema
  },
  meraki_revoke_atom: {
    input: {
      type: "object",
      properties: {
        atom_id: nonEmptyStringSchema,
        expected_version: { type: "integer", minimum: 1 },
        reason: nonEmptyStringSchema,
        ...mutationProperties
      },
      required: ["atom_id", "expected_version", "reason"],
      additionalProperties: false
    },
    output: {
      type: "object",
      required: ["atom", "mutation"],
      properties: { atom: { type: "object" }, mutation: { type: "object" } },
      additionalProperties: false
    }
  },
  meraki_get_learning_trace: {
    input: {
      oneOf: [
        {
          type: "object",
          properties: { event_id: nonEmptyStringSchema },
          required: ["event_id"],
          additionalProperties: false
        },
        {
          type: "object",
          properties: { atom_id: nonEmptyStringSchema },
          required: ["atom_id"],
          additionalProperties: false
        }
      ]
    },
    output: {
      type: "object",
      required: ["trace"],
      properties: { trace: { type: "object" } },
      additionalProperties: false
    }
  }
} as const;

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

const record = (value: unknown, code: string): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
};
const onlyKeys = (input: Record<string, unknown>, allowed: readonly string[]): void => {
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error("MCP_INPUT_ADDITIONAL_PROPERTY");
};
const string = (value: unknown, code: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
  return value;
};
const optionalString = (value: unknown, code: string): string | undefined =>
  value === undefined ? undefined : string(value, code);
const positiveInteger = (value: unknown, code: string): number => {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(code);
  return value as number;
};
const mutationMetadata = (input: Record<string, unknown>): MutationMetadataInput => ({
  ...(input.request_id === undefined ? {} : { request_id: string(input.request_id, "REQUEST_ID_REQUIRED") }),
  ...(input.idempotency_key === undefined
    ? {}
    : { idempotency_key: string(input.idempotency_key, "IDEMPOTENCY_KEY_REQUIRED") })
});
const candidateDecision = (input: Record<string, unknown>): CandidateDecisionInput => ({
  candidate_id: string(input.candidate_id, "CANDIDATE_ID_REQUIRED"),
  expected_version: positiveInteger(input.expected_version, "EXPECTED_VERSION_INVALID"),
  reason: string(input.reason, "DECISION_REASON_REQUIRED"),
  ...mutationMetadata(input)
});

export const parseContextInput = (value: unknown): ContextInput => {
  const input = record(value, "TASK_CONTEXT_REQUIRED");
  onlyKeys(input, ["context"]);
  const rawContext = record(input.context, "TASK_CONTEXT_REQUIRED");
  onlyKeys(rawContext, [
    "contract",
    "tenant_id",
    "subject_id",
    "task_id",
    "task_type",
    "scope",
    "mode",
    "goal_id",
    "constraints",
    "permissions",
    "token_budget"
  ]);
  if (
    typeof rawContext.tenant_id !== "string" ||
    typeof rawContext.subject_id !== "string" ||
    typeof rawContext.task_id !== "string" ||
    typeof rawContext.task_type !== "string" ||
    rawContext.scope === undefined
  )
    throw new Error("TASK_CONTEXT_INCOMPLETE");
  const context = normalizeTaskContext({
    ...rawContext,
    scope: scopeFromUnknown(rawContext.scope)
  } as TaskContext);
  return { context };
};

export const parseFeedbackInput = (value: unknown): FeedbackInput => {
  const input = record(value, "INVALID_FEEDBACK");
  onlyKeys(input, [
    "tenantId",
    "subjectId",
    "actorId",
    "runId",
    "taskType",
    "activityType",
    "content",
    "scope",
    "mode",
    "payload",
    "consent",
    "request_id",
    "idempotency_key"
  ]);
  const activityType = string(input.activityType, "ACTIVITYTYPE_REQUIRED");
  if (
    !["approval", "rejection", "choice", "correction", "edit", "example", "workflow_action", "outcome"].includes(
      activityType
    )
  )
    throw new Error("ACTIVITY_TYPE_INVALID");
  const payload = input.payload === undefined ? undefined : record(input.payload, "ACTIVITY_PAYLOAD_INVALID");
  const consent = input.consent === undefined ? undefined : record(input.consent, "CONSENT_INVALID");
  if (consent !== undefined) {
    onlyKeys(consent, ["status", "purposes", "recorded_at"]);
    if (!["granted", "denied", "revoked"].includes(string(consent.status, "CONSENT_STATUS_REQUIRED")))
      throw new Error("CONSENT_STATUS_INVALID");
    if (!Array.isArray(consent.purposes) || consent.purposes.some((purpose) => typeof purpose !== "string"))
      throw new Error("CONSENT_PURPOSES_INVALID");
  }
  return {
    tenantId: string(input.tenantId, "TENANTID_REQUIRED"),
    subjectId: string(input.subjectId, "SUBJECTID_REQUIRED"),
    actorId: string(input.actorId, "ACTORID_REQUIRED"),
    runId: string(input.runId, "RUNID_REQUIRED"),
    taskType: string(input.taskType, "TASKTYPE_REQUIRED"),
    activityType: activityType as FeedbackInput["activityType"],
    content: string(input.content, "ACTIVITY_CONTENT_REQUIRED"),
    scope: scopeFromUnknown(input.scope),
    ...(optionalString(input.mode, "MODE_INVALID") === undefined ? {} : { mode: input.mode as string }),
    ...(payload === undefined ? {} : { payload }),
    ...(consent === undefined
      ? {}
      : {
          consent: {
            status: consent.status as "granted" | "denied" | "revoked",
            purposes: [...(consent.purposes as string[])],
            recorded_at: string(consent.recorded_at, "CONSENT_RECORDED_AT_REQUIRED")
          }
        }),
    ...mutationMetadata(input)
  };
};

export const parseOutcomeInput = (value: unknown): OutcomeInput => {
  const input = record(value, "INVALID_OUTCOME");
  onlyKeys(input, [
    "tenantId",
    "subjectId",
    "runId",
    "outcomeType",
    "outcome",
    "scope",
    "mode",
    "request_id",
    "idempotency_key"
  ]);
  const mode = optionalString(input.mode, "MODE_INVALID");
  return {
    tenantId: string(input.tenantId, "TENANTID_REQUIRED"),
    subjectId: string(input.subjectId, "SUBJECTID_REQUIRED"),
    runId: string(input.runId, "RUNID_REQUIRED"),
    outcomeType: string(input.outcomeType, "OUTCOMETYPE_REQUIRED"),
    outcome: record(input.outcome, "OUTCOME_REQUIRED"),
    scope: scopeFromUnknown(input.scope),
    ...(mode === undefined ? {} : { mode }),
    ...mutationMetadata(input)
  };
};

export const parseProposeCandidateInput = (value: unknown): ProposeCandidateInput => {
  const input = record(value, "INVALID_CANDIDATE_PROPOSAL");
  onlyKeys(input, ["event_id", "claim", "facet", "temporal_horizon", "request_id", "idempotency_key"]);
  if (input.facet !== undefined && !facets.has(input.facet as ProfileAtom["facet"])) throw new Error("FACET_INVALID");
  if (
    input.temporal_horizon !== undefined &&
    !temporalHorizons.has(input.temporal_horizon as ProfileAtom["temporal_horizon"])
  )
    throw new Error("TEMPORAL_HORIZON_INVALID");
  return {
    event_id: string(input.event_id, "EVENT_ID_REQUIRED"),
    claim: string(input.claim, "CLAIM_REQUIRED"),
    ...(input.facet === undefined ? {} : { facet: input.facet as ProfileAtom["facet"] }),
    ...(input.temporal_horizon === undefined
      ? {}
      : { temporal_horizon: input.temporal_horizon as ProfileAtom["temporal_horizon"] }),
    ...mutationMetadata(input)
  };
};

export const parseEmptyInput = (value: unknown): Record<string, never> => {
  const input = record(value, "INVALID_INPUT");
  onlyKeys(input, []);
  return {};
};

export const parseCandidateIdInput = (value: unknown): CandidateIdInput => {
  const input = record(value, "INVALID_CANDIDATE_REFERENCE");
  onlyKeys(input, ["candidate_id"]);
  return { candidate_id: string(input.candidate_id, "CANDIDATE_ID_REQUIRED") };
};

export const parseCandidateDecisionInput = (value: unknown): CandidateDecisionInput => {
  const input = record(value, "INVALID_CANDIDATE_DECISION");
  onlyKeys(input, ["candidate_id", "expected_version", "reason", "request_id", "idempotency_key"]);
  return candidateDecision(input);
};

export const parseCandidateRescopeInput = (value: unknown): CandidateRescopeInput => {
  const input = record(value, "INVALID_CANDIDATE_RESCOPE");
  onlyKeys(input, ["candidate_id", "expected_version", "reason", "scope", "mode", "request_id", "idempotency_key"]);
  const mode = optionalString(input.mode, "MODE_INVALID");
  return {
    ...candidateDecision(input),
    scope: scopeFromUnknown(input.scope),
    ...(mode === undefined ? {} : { mode })
  };
};

export const parseRevokeAtomInput = (value: unknown): RevokeAtomInput => {
  const input = record(value, "INVALID_ATOM_REVOCATION");
  onlyKeys(input, ["atom_id", "expected_version", "reason", "request_id", "idempotency_key"]);
  return {
    atom_id: string(input.atom_id, "ATOM_ID_REQUIRED"),
    expected_version: positiveInteger(input.expected_version, "EXPECTED_VERSION_INVALID"),
    reason: string(input.reason, "DECISION_REASON_REQUIRED"),
    ...mutationMetadata(input)
  };
};

export const parseLearningTraceInput = (value: unknown): LearningTraceInput => {
  const input = record(value, "INVALID_LEARNING_TRACE");
  onlyKeys(input, ["event_id", "atom_id"]);
  const eventId = optionalString(input.event_id, "EVENT_ID_REQUIRED");
  const atomId = optionalString(input.atom_id, "ATOM_ID_REQUIRED");
  if ((eventId === undefined) === (atomId === undefined)) throw new Error("EXACTLY_ONE_TRACE_ID_REQUIRED");
  return eventId === undefined ? { atom_id: atomId as string } : { event_id: eventId };
};
