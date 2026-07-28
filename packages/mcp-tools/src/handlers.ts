import { randomUUID } from "node:crypto";
import type { AuthenticatedContext } from "@meraki/auth";
import type { MerakiApplication, MutationReceipt } from "@meraki/application";
import type { ProfileAtom } from "@meraki/contracts";
import type {
  CandidateDecisionInput,
  CandidateIdInput,
  CandidateRescopeInput,
  ContextInput,
  FeedbackInput,
  LearningTraceInput,
  MutationMetadataInput,
  OutcomeInput,
  ProposeCandidateInput,
  RevokeAtomInput
} from "./schemas.js";

type MutationDetails = Readonly<{
  replayed: boolean;
  revision: number;
  snapshot_hash: string;
}>;

const mutationDetails = (receipt: MutationReceipt<unknown>): MutationDetails => ({
  replayed: receipt.replayed,
  revision: receipt.revision,
  snapshot_hash: receipt.snapshotHash
});

const mutationIdentity = (input: MutationMetadataInput): Readonly<{ requestId: string; idempotencyKey: string }> => {
  const requestId = input.request_id ?? randomUUID();
  return {
    requestId,
    idempotencyKey: input.idempotency_key ?? requestId
  };
};

const candidateReview = (candidate: ProfileAtom) => ({
  claim: candidate.claim,
  source_evidence: candidate.evidence,
  scope: candidate.scope,
  ...(candidate.mode === undefined ? {} : { mode: candidate.mode }),
  temporal_horizon: candidate.temporal_horizon,
  sensitivity: candidate.sensitivity,
  confidence: candidate.confidence,
  known_contradictions: [],
  contradiction_assessment: "not_available_in_current_core",
  expected_impact: "If explicitly approved, this rule may influence only matching future task contexts.",
  current_version: candidate.version
});

export const getGuidance = (application: MerakiApplication, authority: AuthenticatedContext, input: ContextInput) =>
  application.query(authority, { name: "retrieve", input: input.context });

export const getExamples = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: ContextInput
) => {
  const retrieved = await application.query(authority, { name: "retrieve", input: input.context });
  return retrieved.pack.items.map((item) => ({
    atom: item.atom,
    example: item.guidance,
    provenance: item.reason
  }));
};

export const explainGuidance = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: ContextInput
) => {
  const retrieved = await application.query(authority, { name: "retrieve", input: input.context });
  return {
    candidates: retrieved.candidates,
    pack: {
      id: retrieved.pack.id,
      hash: retrieved.pack.hash,
      atomManifest: retrieved.pack.atom_manifest
    }
  };
};

export const recordFeedback = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: FeedbackInput
) => {
  const mutation = mutationIdentity(input);
  const receipt = await application.mutate(authority, {
    ...mutation,
    command: {
      name: "record_activity",
      input: {
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        actorId: input.actorId,
        runId: input.runId,
        taskType: input.taskType,
        activityType: input.activityType,
        content: input.content,
        scope: input.scope,
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        ...(input.payload === undefined ? {} : { payload: input.payload }),
        ...(input.consent === undefined ? {} : { consent: input.consent })
      }
    }
  });
  return { evidence: receipt.value, mutation: mutationDetails(receipt) };
};

export const recordOutcome = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: OutcomeInput
) => {
  const mutation = mutationIdentity(input);
  const receipt = await application.mutate(authority, {
    ...mutation,
    command: {
      name: "record_outcome",
      input: {
        tenantId: input.tenantId,
        subjectId: input.subjectId,
        runId: input.runId,
        outcomeType: input.outcomeType,
        outcome: input.outcome,
        scope: input.scope,
        ...(input.mode === undefined ? {} : { mode: input.mode })
      }
    }
  });
  return { evidence: receipt.value, mutation: mutationDetails(receipt) };
};

export const proposeCandidate = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: ProposeCandidateInput
) => {
  const mutation = mutationIdentity(input);
  const receipt = await application.mutate(authority, {
    ...mutation,
    command: {
      name: "extract_candidate",
      input: {
        eventId: input.event_id,
        claim: input.claim,
        ...(input.facet === undefined ? {} : { facet: input.facet }),
        ...(input.temporal_horizon === undefined ? {} : { temporalHorizon: input.temporal_horizon })
      }
    }
  });
  return { candidate: receipt.value, mutation: mutationDetails(receipt) };
};

export const listCandidates = async (application: MerakiApplication, authority: AuthenticatedContext) => {
  const atoms = await application.query(authority, { name: "list_atoms" });
  return { candidates: atoms.filter((atom) => atom.lifecycle === "candidate") };
};

export const explainCandidate = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: CandidateIdInput
) => {
  const atoms = await application.query(authority, { name: "list_atoms" });
  const candidate = atoms.find((atom) => atom.id === input.candidate_id && atom.lifecycle === "candidate");
  if (candidate === undefined) throw new Error("CANDIDATE_NOT_FOUND");
  const trace = await application.query(authority, { name: "atom_trace", input: { atomId: candidate.id } });
  return { candidate, trace, review: candidateReview(candidate) };
};

const candidateCommand = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: CandidateDecisionInput,
  operation: "confirm" | "revoke"
) => {
  const mutation = mutationIdentity(input);
  const receipt = await application.mutate(authority, {
    ...mutation,
    command: {
      name: "command_atom",
      input: {
        atomId: input.candidate_id,
        expectedVersion: input.expected_version,
        operation,
        reason: input.reason,
        requiredLifecycles: ["candidate"]
      }
    }
  });
  return { candidate: receipt.value, mutation: mutationDetails(receipt) };
};

export const approveCandidate = (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: CandidateDecisionInput
) => candidateCommand(application, authority, input, "confirm");

export const rejectCandidate = (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: CandidateDecisionInput
) => candidateCommand(application, authority, input, "revoke");

export const rescopeCandidate = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: CandidateRescopeInput
) => {
  const mutation = mutationIdentity(input);
  const receipt = await application.mutate(authority, {
    ...mutation,
    command: {
      name: "command_atom",
      input: {
        atomId: input.candidate_id,
        expectedVersion: input.expected_version,
        operation: "rescope",
        scope: input.scope,
        ...(input.mode === undefined ? {} : { mode: input.mode }),
        reason: input.reason,
        requiredLifecycles: ["candidate"]
      }
    }
  });
  return { candidate: receipt.value, mutation: mutationDetails(receipt) };
};

export const revokeAtom = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: RevokeAtomInput
) => {
  const mutation = mutationIdentity(input);
  const receipt = await application.mutate(authority, {
    ...mutation,
    command: {
      name: "command_atom",
      input: {
        atomId: input.atom_id,
        expectedVersion: input.expected_version,
        operation: "revoke",
        reason: input.reason,
        requiredLifecycles: ["active", "stable", "dormant"]
      }
    }
  });
  return { atom: receipt.value, mutation: mutationDetails(receipt) };
};

export const getLearningTrace = async (
  application: MerakiApplication,
  authority: AuthenticatedContext,
  input: LearningTraceInput
) => ({
  trace:
    input.event_id === undefined
      ? await application.query(authority, { name: "atom_trace", input: { atomId: input.atom_id } })
      : await application.query(authority, { name: "learning_trace", input: { eventId: input.event_id } })
});
