import type { AuthenticatedContext } from "@meraki/auth";
import { requireScopes } from "@meraki/auth";
import type { MerakiApplication } from "@meraki/application";
import { Ajv, type ValidateFunction } from "ajv";
import {
  approveCandidate,
  explainCandidate,
  explainGuidance,
  getExamples,
  getGuidance,
  getLearningTrace,
  listCandidates,
  proposeCandidate,
  recordFeedback,
  recordOutcome,
  rejectCandidate,
  rescopeCandidate,
  revokeAtom
} from "./handlers.js";
import {
  parseCandidateDecisionInput,
  parseCandidateIdInput,
  parseCandidateRescopeInput,
  parseContextInput,
  parseEmptyInput,
  parseFeedbackInput,
  parseLearningTraceInput,
  parseOutcomeInput,
  parseProposeCandidateInput,
  parseRevokeAtomInput,
  toolSchemas,
  type JsonSchema
} from "./schemas.js";

export const MERAKI_MCP_TOOLS = [
  "meraki_get_guidance",
  "meraki_get_examples",
  "meraki_explain_guidance",
  "meraki_record_feedback",
  "meraki_record_outcome",
  "meraki_propose_candidate",
  "meraki_list_candidates",
  "meraki_explain_candidate",
  "meraki_approve_candidate",
  "meraki_reject_candidate",
  "meraki_rescope_candidate",
  "meraki_revoke_atom",
  "meraki_get_learning_trace"
] as const;

export type MerakiMcpTool = (typeof MERAKI_MCP_TOOLS)[number];
export type McpRequest = Readonly<{ name: MerakiMcpTool; arguments: Record<string, unknown> }>;
export type McpResponse = Readonly<{ content: unknown; isError?: boolean }>;

export type ToolDefinition = Readonly<{
  name: MerakiMcpTool;
  description: string;
  requiredScopes: readonly string[];
  mutates: boolean;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  parse: (value: unknown) => unknown;
  handle: (application: MerakiApplication, authority: AuthenticatedContext, input: never) => unknown;
}>;

const definition = (
  value: Omit<ToolDefinition, "inputSchema" | "outputSchema"> & {
    name: MerakiMcpTool;
  }
): ToolDefinition => ({
  ...value,
  inputSchema: toolSchemas[value.name].input,
  outputSchema: toolSchemas[value.name].output
});

export const MERAKI_MCP_REGISTRY = [
  definition({
    name: "meraki_get_guidance",
    description: "Retrieve scoped, active Meraki guidance for one authenticated task context.",
    requiredScopes: ["profile:read"],
    mutates: false,
    parse: parseContextInput,
    handle: getGuidance
  }),
  definition({
    name: "meraki_get_examples",
    description: "Retrieve scoped guidance as examples with atom provenance.",
    requiredScopes: ["profile:read"],
    mutates: false,
    parse: parseContextInput,
    handle: getExamples
  }),
  definition({
    name: "meraki_explain_guidance",
    description: "Explain which visible profile candidates were included or excluded from a guidance pack.",
    requiredScopes: ["profile:read"],
    mutates: false,
    parse: parseContextInput,
    handle: explainGuidance
  }),
  definition({
    name: "meraki_record_feedback",
    description:
      "Record explicit user feedback as immutable evidence; this does not create or activate a profile rule.",
    requiredScopes: ["evidence:write"],
    mutates: true,
    parse: parseFeedbackInput,
    handle: recordFeedback
  }),
  definition({
    name: "meraki_record_outcome",
    description: "Record an externally observed outcome as immutable evidence.",
    requiredScopes: ["evidence:write"],
    mutates: true,
    parse: parseOutcomeInput,
    handle: recordOutcome
  }),
  definition({
    name: "meraki_propose_candidate",
    description: "Create one cited, inactive candidate from an existing explicit evidence event.",
    requiredScopes: ["profile:write"],
    mutates: true,
    parse: parseProposeCandidateInput,
    handle: proposeCandidate
  }),
  definition({
    name: "meraki_list_candidates",
    description: "List visible inactive candidates awaiting an explicit governance decision.",
    requiredScopes: ["profile:read"],
    mutates: false,
    parse: parseEmptyInput,
    handle: listCandidates
  }),
  definition({
    name: "meraki_explain_candidate",
    description: "Show a candidate claim, evidence lineage, scope, temporal horizon, sensitivity, and expected impact.",
    requiredScopes: ["profile:read"],
    mutates: false,
    parse: parseCandidateIdInput,
    handle: explainCandidate
  }),
  definition({
    name: "meraki_approve_candidate",
    description: "Explicitly activate the reviewed version of one candidate.",
    requiredScopes: ["profile:write"],
    mutates: true,
    parse: parseCandidateDecisionInput,
    handle: approveCandidate
  }),
  definition({
    name: "meraki_reject_candidate",
    description: "Explicitly reject the reviewed version of one inactive candidate without deleting its evidence.",
    requiredScopes: ["profile:write"],
    mutates: true,
    parse: parseCandidateDecisionInput,
    handle: rejectCandidate
  }),
  definition({
    name: "meraki_rescope_candidate",
    description: "Narrow the reviewed version of one inactive candidate while keeping it inactive.",
    requiredScopes: ["profile:write"],
    mutates: true,
    parse: parseCandidateRescopeInput,
    handle: rescopeCandidate
  }),
  definition({
    name: "meraki_revoke_atom",
    description: "Revoke a reviewed active atom version so it cannot affect later guidance.",
    requiredScopes: ["profile:write"],
    mutates: true,
    parse: parseRevokeAtomInput,
    handle: revokeAtom
  }),
  definition({
    name: "meraki_get_learning_trace",
    description: "Inspect source-to-atom learning lineage by exactly one evidence-event or atom identifier.",
    requiredScopes: ["profile:read"],
    mutates: false,
    parse: parseLearningTraceInput,
    handle: getLearningTrace
  })
] as const satisfies readonly ToolDefinition[];

type Rfc3339Match = RegExpMatchArray & {
  groups: {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    second: string;
    offsetHour?: string;
    offsetMinute?: string;
  };
};

const rfc3339DateTime = (value: string): Rfc3339Match | null =>
  value.match(
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})[Tt](?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})(?:\.\d+)?(?:[Zz]|[+-](?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u
  ) as Rfc3339Match | null;

const validRfc3339DateTime = (value: string): boolean => {
  const match = rfc3339DateTime(value);
  if (match === null) return false;
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second);
  const offsetHour = match.groups.offsetHour === undefined ? 0 : Number(match.groups.offsetHour);
  const offsetMinute = match.groups.offsetMinute === undefined ? 0 : Number(match.groups.offsetMinute);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const monthLength = monthLengths[month - 1];
  return (
    monthLength !== undefined &&
    day >= 1 &&
    day <= monthLength &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
};

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addFormat("date-time", {
  type: "string",
  validate: validRfc3339DateTime
});
const inputValidators = new Map<MerakiMcpTool, ValidateFunction>(
  MERAKI_MCP_REGISTRY.map((tool) => [tool.name, ajv.compile(tool.inputSchema)])
);
const outputValidators = new Map<MerakiMcpTool, ValidateFunction>(
  MERAKI_MCP_REGISTRY.map((tool) => [tool.name, ajv.compile(tool.outputSchema)])
);

export const MERAKI_MCP_TOOL_DESCRIPTORS = MERAKI_MCP_REGISTRY.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema
}));

export const isMerakiMcpTool = (value: string): value is MerakiMcpTool =>
  (MERAKI_MCP_TOOLS as readonly string[]).includes(value);

const errorCode = (error: unknown): string =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : error instanceof Error
      ? error.message
      : "MCP_REQUEST_FAILED";

export class MerakiMcpRegistry {
  public constructor(
    private readonly application: MerakiApplication,
    private readonly authority: AuthenticatedContext
  ) {}

  public async handle(request: McpRequest): Promise<McpResponse> {
    try {
      const tool = MERAKI_MCP_REGISTRY.find((candidate) => candidate.name === request.name);
      if (tool === undefined) throw new Error("UNKNOWN_MCP_TOOL");
      requireScopes(this.authority, tool.requiredScopes);
      const input = tool.parse(request.arguments);
      if (inputValidators.get(tool.name)?.(request.arguments) !== true) throw new Error("MCP_INPUT_SCHEMA_INVALID");
      const content = await tool.handle(this.application, this.authority, input as never);
      if (outputValidators.get(tool.name)?.(content) !== true) throw new Error("MCP_OUTPUT_SCHEMA_INVALID");
      return { content };
    } catch (error) {
      return { isError: true, content: { code: errorCode(error) } };
    }
  }
}
