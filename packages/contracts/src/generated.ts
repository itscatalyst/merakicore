/* GENERATED from schemas/meraki.schema.json. DO NOT EDIT. */
export type Uuid = string;

export type Time = string;

export type Digest = string;

export type IdVersion = {
  "id" : Uuid;
  "version" : number;
};

export type Scope = {
  "level" : "run" | "task" | "project" | "mode" | "domain" | "workspace" | "relationship" | "user" | "team";
  "ref"?: string;
};

export type EvidenceRef = {
  "event_id" : Uuid;
  "span_start" : number;
  "span_end" : number;
  "quote_hash"?: Digest;
};

export type PageInfo = {
  "next_cursor"?: string;
  "has_more" : boolean;
};

export type Consent = {
  "status" : "granted" | "denied" | "revoked";
  "purposes" : Array<string>;
  "recorded_at" : Time;
};

export type PackItem = {
  "atom" : IdVersion;
  "guidance" : string;
  "reason" : string;
};

export type GraphNode = {
  "id" : Uuid;
  "version" : number;
  "kind" : string;
  "label" : string;
  "lifecycle" : string;
};

export type GraphEdge = {
  "id" : Uuid;
  "from" : IdVersion;
  "to" : IdVersion;
  "relation" : string;
};

export type TraceStep = {
  "sequence" : number;
  "kind" : string;
  "resource_id" : Uuid;
  "occurred_at" : Time;
};

export type AuthContext = {
  "contract" : "auth_context";
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "actor_id" : Uuid;
  "session_id" : Uuid;
  "scopes" : Array<string>;
};

export type SourceRecord = {
  "contract" : "source_record";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "source_type" : string;
  "trust_class" : "explicit_user" | "objective_outcome" | "observed_behavior" | "model_generated" | "imported_unverified";
  "consent" : Consent;
  "content_hash" : Digest;
  "retention_until"?: Time;
  "created_at" : Time;
};

export type Artifact = {
  "contract" : "artifact";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "source_id" : Uuid;
  "digest" : Digest;
  "media_type" : string;
  "byte_length" : number;
  "redaction_state" : "raw" | "redacted" | "purged";
  "created_at" : Time;
};

export type Event = {
  "contract" : "event";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "source_id" : Uuid;
  "event_type" : string;
  "occurred_at" : Time;
  "recorded_at" : Time;
  "payload" : Record<string, unknown>;
  "evidence_spans" : Array<EvidenceRef>;
};

export type Observation = {
  "contract" : "observation";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "event_ids" : Array<Uuid>;
  "description" : string;
  "extractor" : string;
  "extractor_version" : string;
  "epistemic_class" : "direct" | "deterministic" | "inferred";
  "alternatives" : Array<string>;
  "created_at" : Time;
};

export type Signal = {
  "contract" : "signal";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "observation_ids" : Array<Uuid>;
  "kind" : string;
  "scope" : Scope;
  "support" : number;
  "counterevidence" : number;
  "confidence" : number;
  "created_at" : Time;
};

export type Hypothesis = {
  "contract" : "hypothesis";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "claim" : string;
  "scope" : Scope;
  "evidence" : Array<EvidenceRef>;
  "alternatives" : Array<string>;
  "falsifier" : string;
  "confidence" : number;
  "created_at" : Time;
};

export type Episode = {
  "contract" : "episode";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "event_ids" : Array<Uuid>;
  "observation_ids" : Array<Uuid>;
  "boundary_reason" : string;
  "started_at" : Time;
  "ended_at" : Time;
};

export type ProfileAtom = {
  "contract" : "profile_atom";
  "id" : Uuid;
  "version" : number;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "facet" : "fact" | "current_state" | "goal" | "identity_declaration" | "behavior" | "cognitive_pattern" | "communication" | "voice" | "taste" | "judgment" | "workflow" | "exemplar" | "anti_pattern" | "mode" | "uncertainty";
  "claim" : string;
  "epistemic_class" : "declared" | "observed" | "inferred" | "objective";
  "scope" : Scope;
  "mode"?: string;
  "temporal_horizon" : "run" | "temporary" | "ongoing" | "durable";
  "lifecycle" : "candidate" | "active" | "stable" | "locked_core" | "dormant" | "superseded" | "revoked" | "unsupported";
  "confidence" : number;
  "utility" : number;
  "sensitivity" : "normal" | "sensitive" | "prohibited_inference";
  "evidence" : Array<EvidenceRef>;
  "counterevidence" : Array<EvidenceRef>;
  "supersedes"?: IdVersion;
  "created_at" : Time;
};

export type ProfileEdge = {
  "contract" : "profile_edge";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "from" : IdVersion;
  "to" : IdVersion;
  "relation" : "supports" | "contradicts" | "scoped_to" | "derived_from" | "compiled_into" | "evaluated_by" | "updated_by" | "supersedes";
  "evidence"?: Array<EvidenceRef>;
  "created_at" : Time;
};

export type ProfileSnapshot = {
  "contract" : "profile_snapshot";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "atoms" : Array<IdVersion>;
  "policy_version" : string;
  "created_at" : Time;
};

export type TaskContext = {
  "contract" : "task_context";
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "task_id" : Uuid;
  "task_type" : string;
  "scope" : Scope;
  "mode"?: string;
  "goal_id"?: Uuid;
  "constraints" : Array<string>;
  "permissions" : Array<string>;
  "token_budget" : number;
};

export type RetrievalCandidate = {
  "contract" : "retrieval_candidate";
  "atom" : IdVersion;
  "scores" : Record<string, unknown>;
  "decision" : "included" | "excluded";
  "reasons" : Array<string>;
};

export type MerakiPack = {
  "contract" : "meraki_pack";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "task_context_digest" : Digest;
  "items" : Array<PackItem>;
  "atom_manifest" : Array<IdVersion>;
  "policy_version" : string;
  "renderer_version" : string;
  "canonicalization" : "RFC8785";
  "hash" : Digest;
  "created_at" : Time;
};

export type Agent = {
  "contract" : "agent";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "name" : string;
  "runtime" : string;
  "model"?: string;
  "connection_type" : "sdk" | "mcp" | "rest" | "cli";
  "permissions" : Array<string>;
  "state" : "connected" | "paused" | "disconnected" | "stale";
  "version" : number;
  "last_heartbeat" : Time;
};

export type AgentControlCommand = {
  "contract" : "agent_control_command";
  "agent_id" : Uuid;
  "expected_version" : number;
  "operation" : "pause" | "resume" | "restrict" | "disconnect";
  "allowed_scopes"?: Array<Scope>;
  "reason" : string;
};

export type Run = {
  "contract" : "run";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "agent_id" : Uuid;
  "task_context" : TaskContext;
  "arm" : "baseline" | "raw_memory" | "meraki" | "ablation";
  "model" : string;
  "parameters" : Record<string, unknown>;
  "prompt_digest"?: Digest;
  "pack_hash"?: Digest;
  "atom_manifest"?: Array<IdVersion>;
  "tools" : Array<string>;
  "output_artifact_id"?: Uuid;
  "cost"?: number;
  "latency_ms"?: number;
  "status" : "running" | "succeeded" | "failed" | "cancelled";
  "started_at" : Time;
  "finished_at"?: Time;
};

export type Feedback = {
  "contract" : "feedback";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "run_id" : Uuid;
  "actor_id" : Uuid;
  "feedback_type" : "correction" | "approval" | "rejection" | "choice" | "rating";
  "content"?: string;
  "artifact_id"?: Uuid;
  "created_at" : Time;
};

export type Outcome = {
  "contract" : "outcome";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "run_id" : Uuid;
  "metric" : string;
  "value" : unknown;
  "provenance" : string;
  "recorded_at" : Time;
};

export type Evaluation = {
  "contract" : "evaluation";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "experiment_id" : Uuid;
  "arm_id" : Uuid;
  "evaluator_class" : "human_blind" | "objective" | "model_weak";
  "evaluator_identity_digest"?: Digest;
  "criteria" : Record<string, unknown>;
  "result" : "win" | "loss" | "tie" | "abstain";
  "reason"?: string;
  "uncertainty" : number;
  "created_at" : Time;
};

export type Attribution = {
  "contract" : "attribution";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "evaluation_ids" : Array<Uuid>;
  "target" : IdVersion;
  "effect" : number;
  "uncertainty" : number;
  "created_at" : Time;
};

export type UpdateProposal = {
  "contract" : "update_proposal";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "operation" : "reinforce" | "weaken" | "rescope" | "split" | "merge" | "supersede" | "expire" | "revoke";
  "target" : IdVersion;
  "evidence" : Array<EvidenceRef>;
  "expected_impact" : string;
  "proposed_scope"?: Scope;
  "proposed_mode"?: string;
  "status" : "pending" | "approved" | "rejected" | "applied" | "rolled_back";
  "expected_version" : number;
  "created_at" : Time;
};

export type Goal = {
  "contract" : "goal";
  "id" : Uuid;
  "version" : number;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "title" : string;
  "criteria" : Array<string>;
  "constraints" : Array<string>;
  "status" : "active" | "achieved" | "blocked" | "abandoned";
  "evidence" : Array<EvidenceRef>;
  "created_at" : Time;
};

export type Experiment = {
  "contract" : "experiment";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "snapshot_id" : Uuid;
  "task_suite_digest" : Digest;
  "model" : string;
  "parameters_digest" : Digest;
  "token_budget" : number;
  "arms" : Array<ExperimentArm>;
  "frozen_at" : Time;
};

export type ExperimentArm = {
  "contract" : "experiment_arm";
  "id" : Uuid;
  "kind" : "baseline" | "raw_memory" | "meraki" | "ablation";
  "blinded_label" : string;
  "ablation_target"?: IdVersion;
};

export type Job = {
  "contract" : "job";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "job_type" : string;
  "status" : "queued" | "running" | "succeeded" | "failed" | "cancelled";
  "progress"?: number;
  "error"?: ApiError;
  "created_at" : Time;
};

export type DeletionPreview = {
  "contract" : "deletion_preview";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "target_type" : "source" | "subject";
  "target_id" : Uuid;
  "affected_atoms" : Array<IdVersion>;
  "affected_packs" : Array<Digest>;
  "affected_evaluations" : Array<Uuid>;
  "preview_version" : number;
  "created_at" : Time;
};

export type DeletionRequest = {
  "contract" : "deletion_request";
  "preview_id" : Uuid;
  "expected_preview_version" : number;
  "confirmation" : "DELETE";
};

export type ExportRequest = {
  "contract" : "export_request";
  "id" : Uuid;
  "tenant_id" : Uuid;
  "subject_id" : Uuid;
  "selection" : Array<string>;
  "redaction_policy" : string;
  "created_at" : Time;
};

export type ExportManifest = {
  "contract" : "export_manifest";
  "id" : Uuid;
  "request_id" : Uuid;
  "artifacts" : Array<Digest>;
  "created_at" : Time;
};

export type StudioEventEnvelope = {
  "contract" : "studio_event_envelope";
  "event_id" : number;
  "event_type" : string;
  "resource_type" : string;
  "resource_id" : Uuid;
  "occurred_at" : Time;
};

export type GraphPage = {
  "contract" : "graph_page";
  "nodes" : Array<GraphNode>;
  "edges" : Array<GraphEdge>;
  "page" : PageInfo;
  "conflicts_omitted" : boolean;
};

export type ApiError = {
  "contract" : "api_error";
  "code" : string;
  "message" : string;
  "request_id" : Uuid;
  "details"?: Record<string, unknown>;
  "retryable" : boolean;
};

export type IdempotencyReceipt = {
  "contract" : "idempotency_receipt";
  "key" : string;
  "request_hash" : Digest;
  "status" : "created" | "replayed";
  "resource_id" : Uuid;
};

export type AtomCommand = {
  "contract" : "atom_command";
  "atom_id" : Uuid;
  "expected_version" : number;
  "operation" : "confirm" | "edit" | "rescope" | "limit" | "revoke" | "rollback";
  "claim"?: string;
  "scope"?: Scope;
  "mode"?: string;
  "reason" : string;
};

export type ProposalCommand = {
  "contract" : "proposal_command";
  "proposal_id" : Uuid;
  "expected_version" : number;
  "operation" : "approve" | "reject" | "rollback";
  "reason" : string;
};

export type StudioOverview = {
  "contract" : "studio_overview";
  "goal_id" : string;
  "health" : "healthy" | "degraded" | "offline";
  "contract_version" : string;
  "counts" : Record<string, unknown>;
  "generated_at" : Time;
};

export type RunTrace = {
  "contract" : "run_trace";
  "run_id" : Uuid;
  "steps" : Array<TraceStep>;
  "page" : PageInfo;
};

export type MerakiContract = AuthContext | SourceRecord | Artifact | Event | Observation | Signal | Hypothesis | Episode | ProfileAtom | ProfileEdge | ProfileSnapshot | TaskContext | RetrievalCandidate | MerakiPack | Agent | AgentControlCommand | Run | Feedback | Outcome | Evaluation | Attribution | UpdateProposal | Goal | Experiment | ExperimentArm | Job | DeletionPreview | DeletionRequest | ExportRequest | ExportManifest | StudioEventEnvelope | GraphPage | ApiError | IdempotencyReceipt | AtomCommand | ProposalCommand | StudioOverview | RunTrace;
