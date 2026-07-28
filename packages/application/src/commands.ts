import type { ProfileAtom, Scope } from "@meraki/contracts";
import type { ConnectedAgentRuntime, UpdateOperation } from "@meraki/core";

export type RecordCorrectionInput = Parameters<ConnectedAgentRuntime["correction"]>[0];
export type RecordActivityInput = Parameters<ConnectedAgentRuntime["activity"]>[0];
export type RecordOutcomeInput = Parameters<ConnectedAgentRuntime["outcome"]>[0];
export type RunAgentInput = Parameters<ConnectedAgentRuntime["run"]>[0];
export type RecordEvaluationInput = Parameters<ConnectedAgentRuntime["recordEvaluation"]>[0];

export type ExtractCandidateInput = Readonly<{
  eventId: string;
  claim: string;
  facet?: ProfileAtom["facet"];
  temporalHorizon?: ProfileAtom["temporal_horizon"];
}>;

export type ProposeUpdateInput = Readonly<{
  lessonId: string;
  evidenceEventId: string;
  operation: UpdateOperation;
}>;

export type UpdateProposalCommandInput = Readonly<{
  proposalId: string;
  operation: "approve" | "reject" | "rollback";
}>;

export type AtomCommandInput = Readonly<{
  atomId: string;
  expectedVersion: number;
  requiredLifecycles?: readonly ProfileAtom["lifecycle"][];
  reason?: string;
  operation: "confirm" | "edit" | "rescope" | "limit" | "revoke" | "supersede" | "weaken" | "split";
  claim?: string;
  claims?: readonly string[];
  counterevidenceEventId?: string;
  scope?: Scope;
  mode?: string;
}>;

export type MerakiCommand =
  | Readonly<{ name: "record_correction"; input: RecordCorrectionInput }>
  | Readonly<{ name: "record_activity"; input: RecordActivityInput }>
  | Readonly<{ name: "record_outcome"; input: RecordOutcomeInput }>
  | Readonly<{ name: "extract_candidate"; input: ExtractCandidateInput }>
  | Readonly<{ name: "run_agent"; input: RunAgentInput }>
  | Readonly<{ name: "record_evaluation"; input: RecordEvaluationInput }>
  | Readonly<{ name: "propose_update"; input: ProposeUpdateInput }>
  | Readonly<{ name: "command_update_proposal"; input: UpdateProposalCommandInput }>
  | Readonly<{ name: "command_atom"; input: AtomCommandInput }>;

export type UpdateProposalCommandResult =
  | ReturnType<ConnectedAgentRuntime["applyUpdateProposal"]>
  | Readonly<{ proposal: ReturnType<ConnectedAgentRuntime["rejectUpdateProposal"]> }>
  | ReturnType<ConnectedAgentRuntime["rollbackUpdateProposal"]>;

export type AtomCommandResult =
  | ReturnType<ConnectedAgentRuntime["approve"]>
  | ReturnType<ConnectedAgentRuntime["split"]>;

export type CommandResult<C extends MerakiCommand> =
  C extends Readonly<{ name: "record_correction" }>
    ? ReturnType<ConnectedAgentRuntime["correction"]>
    : C extends Readonly<{ name: "record_activity" }>
      ? ReturnType<ConnectedAgentRuntime["activity"]>
      : C extends Readonly<{ name: "record_outcome" }>
        ? ReturnType<ConnectedAgentRuntime["outcome"]>
        : C extends Readonly<{ name: "extract_candidate" }>
          ? ReturnType<ConnectedAgentRuntime["extractActivityLesson"]>
          : C extends Readonly<{ name: "run_agent" }>
            ? ReturnType<ConnectedAgentRuntime["run"]>
            : C extends Readonly<{ name: "record_evaluation" }>
              ? ReturnType<ConnectedAgentRuntime["recordEvaluation"]>
              : C extends Readonly<{ name: "propose_update" }>
                ? ReturnType<ConnectedAgentRuntime["proposeUpdate"]>
                : C extends Readonly<{ name: "command_update_proposal" }>
                  ? UpdateProposalCommandResult
                  : C extends Readonly<{ name: "command_atom" }>
                    ? AtomCommandResult
                    : never;

export type MutationEnvelope<C extends MerakiCommand = MerakiCommand> = Readonly<{
  requestId: string;
  idempotencyKey: string;
  command: C;
}>;
