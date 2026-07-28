import type { TaskContext } from "@meraki/contracts";
import type { ConnectedAgentRuntime } from "@meraki/core";

export type MerakiQuery =
  | Readonly<{ name: "retrieve"; input: TaskContext }>
  | Readonly<{ name: "list_atoms" }>
  | Readonly<{ name: "learning_trace"; input: Readonly<{ eventId: string }> }>
  | Readonly<{ name: "atom_trace"; input: Readonly<{ atomId: string }> }>
  | Readonly<{ name: "list_update_proposals" }>
  | Readonly<{ name: "list_runs"; input: Readonly<{ limit?: number }> }>
  | Readonly<{ name: "get_run"; input: Readonly<{ runId: string }> }>
  | Readonly<{ name: "list_evaluations" }>;

export type QueryResult<Q extends MerakiQuery> =
  Q extends Readonly<{ name: "retrieve" }>
    ? ReturnType<ConnectedAgentRuntime["retrieve"]>
    : Q extends Readonly<{ name: "list_atoms" }>
      ? ReturnType<ConnectedAgentRuntime["profileAtoms"]>
      : Q extends Readonly<{ name: "learning_trace" }>
        ? ReturnType<ConnectedAgentRuntime["learningTrace"]>
        : Q extends Readonly<{ name: "atom_trace" }>
          ? ReturnType<ConnectedAgentRuntime["learningTraceForAtom"]>
          : Q extends Readonly<{ name: "list_update_proposals" }>
            ? ReturnType<ConnectedAgentRuntime["updateProposals"]>
            : Q extends Readonly<{ name: "list_runs" }>
              ? ReturnType<ConnectedAgentRuntime["recentRuns"]>
              : Q extends Readonly<{ name: "get_run" }>
                ? ReturnType<ConnectedAgentRuntime["getRun"]>
                : Q extends Readonly<{ name: "list_evaluations" }>
                  ? ReturnType<ConnectedAgentRuntime["evaluations"]>
                  : never;
