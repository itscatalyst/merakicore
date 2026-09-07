import type { Event, ProfileAtom, TaskContext, UpdateProposal } from "@meraki/contracts";
import type { ConnectedAgentRuntime, ConnectedCausalComparison, ConnectedCausalInput } from "@meraki/core";

export type BoundedListInput = Readonly<{ limit?: number }>;

export type RuntimeReadMetadata = Readonly<{
  revision: number;
  snapshotHash: `sha256:${string}`;
}>;

export type BoundedCollection<T> = Readonly<{
  items: readonly T[];
  total: number;
  truncated: boolean;
}>;

export type StudioEvidenceSummary = Readonly<{
  eventId: string;
  sourceId: string;
  eventType: string;
  occurredAt: string;
  recordedAt: string;
  sourceType: string;
  trustClass: string;
  evidenceSpans: Event["evidence_spans"];
}>;

export type StudioSnapshot = Readonly<{
  revision: number;
  snapshotHash: `sha256:${string}`;
  atoms: Readonly<{
    candidate: BoundedCollection<ProfileAtom>;
    active: BoundedCollection<ProfileAtom>;
    other: BoundedCollection<ProfileAtom>;
  }>;
  evidence: BoundedCollection<StudioEvidenceSummary>;
  runs: BoundedCollection<ReturnType<ConnectedAgentRuntime["recentRuns"]>[number]>;
  evaluations: BoundedCollection<ReturnType<ConnectedAgentRuntime["evaluations"]>[number]>;
  updateProposals: BoundedCollection<UpdateProposal>;
}>;

export type RunPage = Readonly<{
  items: ReturnType<ConnectedAgentRuntime["recentRuns"]>;
  total: number;
  summary: Readonly<{
    guidanceApplied: number;
    baselinePreserved: number;
  }>;
}>;

export type MerakiQuery =
  | Readonly<{ name: "retrieve"; input: TaskContext }>
  | Readonly<{ name: "list_atoms"; input?: BoundedListInput }>
  | Readonly<{ name: "learning_trace"; input: Readonly<{ eventId: string }> }>
  | Readonly<{ name: "atom_trace"; input: Readonly<{ atomId: string }> }>
  | Readonly<{ name: "list_update_proposals"; input?: BoundedListInput }>
  | Readonly<{ name: "list_runs"; input: BoundedListInput }>
  | Readonly<{ name: "list_run_page"; input: BoundedListInput }>
  | Readonly<{ name: "get_run"; input: Readonly<{ runId: string }> }>
  | Readonly<{ name: "list_evaluations"; input?: BoundedListInput }>
  | Readonly<{ name: "studio_snapshot"; input: BoundedListInput }>
  | Readonly<{ name: "run_controlled_comparison"; input: ConnectedCausalInput }>;

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
                  : Q extends Readonly<{ name: "list_run_page" }>
                    ? RunPage
                    : Q extends Readonly<{ name: "studio_snapshot" }>
                      ? StudioSnapshot
                      : Q extends Readonly<{ name: "run_controlled_comparison" }>
                        ? ConnectedCausalComparison
                        : never;
