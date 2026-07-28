import type { AuthenticatedContext } from "@meraki/auth";
import { requireScopes } from "@meraki/auth";
import type { ProfileAtom } from "@meraki/contracts";
import { ConnectedAgentRuntime, canonicalJson, scopeFromUnknown, sha256Digest } from "@meraki/core";
import type { CommandResult, MerakiCommand, MutationEnvelope } from "./commands.js";
import { ApplicationError, applicationErrorCode, IdempotencyConflictError } from "./errors.js";
import { assertAuthorityIdentity, authorizedTaskContext, canReadSensitive } from "./identity.js";
import type { MerakiQuery, QueryResult } from "./queries.js";

export type RuntimeIdentity = Readonly<{ tenantId: string; subjectId: string }>;

export type MutationReceipt<T> = Readonly<{
  value: T;
  replayed: boolean;
  revision: number;
  snapshotHash: `sha256:${string}`;
}>;

export type RuntimeTransactionMetadata = Readonly<{
  requestId: string;
  idempotencyKey: string;
  requestHash: `sha256:${string}`;
  action: MerakiCommand["name"];
  actorId: string;
  sessionId: string;
  scopes: readonly string[];
  target?: string;
  reason?: string;
}>;

export type ApplicationAuditEvent = Readonly<{
  requestId: string;
  tenantId: string;
  subjectId: string;
  actorId: string;
  sessionId: string;
  action: string;
  target?: string;
  reason?: string;
  outcome: "committed" | "failed" | "replayed";
  requestHash: `sha256:${string}`;
  beforeHash: `sha256:${string}`;
  afterHash: `sha256:${string}`;
  revision: number;
  errorCode?: string;
  recordedAt: string;
}>;

export interface RuntimeUnitOfWork {
  read<T>(identity: RuntimeIdentity, operation: (runtime: ConnectedAgentRuntime) => T): Promise<T>;
  transact<T>(
    identity: RuntimeIdentity,
    metadata: RuntimeTransactionMetadata,
    authorize: (runtime: ConnectedAgentRuntime) => void,
    operation: (runtime: ConnectedAgentRuntime) => T
  ): Promise<MutationReceipt<T>>;
}

export interface MerakiApplication {
  query<Q extends MerakiQuery>(authority: AuthenticatedContext, query: Q): Promise<QueryResult<Q>>;
  mutate<C extends MerakiCommand>(
    authority: AuthenticatedContext,
    request: MutationEnvelope<C>
  ): Promise<MutationReceipt<CommandResult<C>>>;
}

export type RuntimePersist = (
  identity: RuntimeIdentity,
  runtime: ConnectedAgentRuntime,
  metadata: RuntimeTransactionMetadata
) => Promise<void>;

type IdempotencyRecord = Readonly<{
  requestHash: `sha256:${string}`;
  receipt: MutationReceipt<unknown>;
}>;

const cloneRuntime = (runtime: ConnectedAgentRuntime): ConnectedAgentRuntime =>
  ConnectedAgentRuntime.fromSnapshot(structuredClone(runtime.snapshot()));

const runtimeHash = (runtime: ConnectedAgentRuntime): `sha256:${string}` =>
  sha256Digest(canonicalJson(runtime.snapshot()));

const cloneReceipt = <T>(receipt: MutationReceipt<T>): MutationReceipt<T> => structuredClone(receipt);

/**
 * Serialized, atomic unit of work for one local JSON-backed process.
 *
 * The candidate runtime is never published until persistence succeeds. This
 * prevents a failed save from leaving the serving process ahead of disk.
 */
export class InMemoryRuntimeUnitOfWork implements RuntimeUnitOfWork {
  private runtime: ConnectedAgentRuntime;
  private revision = 0;
  private pending: Promise<void> = Promise.resolve();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly audit: ApplicationAuditEvent[] = [];

  public constructor(
    runtime = new ConnectedAgentRuntime(),
    private readonly persist: RuntimePersist = () => Promise.resolve()
  ) {
    this.runtime = cloneRuntime(runtime);
  }

  public async read<T>(_identity: RuntimeIdentity, operation: (runtime: ConnectedAgentRuntime) => T): Promise<T> {
    await this.pending;
    return operation(cloneRuntime(this.runtime));
  }

  public transact<T>(
    identity: RuntimeIdentity,
    metadata: RuntimeTransactionMetadata,
    authorize: (runtime: ConnectedAgentRuntime) => void,
    operation: (runtime: ConnectedAgentRuntime) => T
  ): Promise<MutationReceipt<T>> {
    const transaction = this.pending.then(async () => {
      const beforeHash = runtimeHash(this.runtime);
      try {
        authorize(cloneRuntime(this.runtime));
      } catch (error) {
        this.audit.push(
          this.auditEvent(
            identity,
            metadata,
            "failed",
            beforeHash,
            beforeHash,
            this.revision,
            applicationErrorCode(error)
          )
        );
        throw error;
      }
      const idempotencyKey = `${identity.tenantId}\u0000${identity.subjectId}\u0000${metadata.idempotencyKey}`;
      const prior = this.idempotency.get(idempotencyKey);
      if (prior !== undefined) {
        if (prior.requestHash !== metadata.requestHash) {
          this.audit.push(
            this.auditEvent(identity, metadata, "failed", beforeHash, beforeHash, this.revision, "IDEMPOTENCY_CONFLICT")
          );
          throw new IdempotencyConflictError();
        }
        const replayed = { ...cloneReceipt(prior.receipt), replayed: true } as MutationReceipt<T>;
        this.audit.push(this.auditEvent(identity, metadata, "replayed", beforeHash, beforeHash, this.revision));
        return replayed;
      }

      const candidate = cloneRuntime(this.runtime);
      let value: T;
      let validatedCandidate: ConnectedAgentRuntime;
      try {
        value = operation(candidate);
        // A command is not commit-ready merely because it returned. Force a
        // snapshot round trip so every Core lineage invariant is checked before
        // persistence or publication.
        validatedCandidate = cloneRuntime(candidate);
      } catch (error) {
        this.audit.push(
          this.auditEvent(
            identity,
            metadata,
            "failed",
            beforeHash,
            beforeHash,
            this.revision,
            applicationErrorCode(error)
          )
        );
        throw error;
      }
      const afterHash = runtimeHash(validatedCandidate);
      try {
        await this.persist(identity, validatedCandidate, metadata);
      } catch {
        this.audit.push(
          this.auditEvent(identity, metadata, "failed", beforeHash, beforeHash, this.revision, "PERSISTENCE_FAILED")
        );
        throw new ApplicationError("PERSISTENCE_FAILED", true);
      }
      this.runtime = validatedCandidate;
      this.revision += 1;
      const receipt: MutationReceipt<T> = Object.freeze({
        value,
        replayed: false,
        revision: this.revision,
        snapshotHash: afterHash
      });
      this.idempotency.set(idempotencyKey, {
        requestHash: metadata.requestHash,
        receipt: cloneReceipt(receipt)
      });
      this.audit.push(this.auditEvent(identity, metadata, "committed", beforeHash, afterHash, this.revision));
      return receipt;
    });
    this.pending = transaction.then(
      () => undefined,
      () => undefined
    );
    return transaction;
  }

  public auditEvents(): readonly ApplicationAuditEvent[] {
    return structuredClone(this.audit);
  }

  public async currentRuntime(): Promise<ConnectedAgentRuntime> {
    await this.pending;
    return cloneRuntime(this.runtime);
  }

  private auditEvent(
    identity: RuntimeIdentity,
    metadata: RuntimeTransactionMetadata,
    outcome: ApplicationAuditEvent["outcome"],
    beforeHash: `sha256:${string}`,
    afterHash: `sha256:${string}`,
    revision: number,
    errorCode?: string
  ): ApplicationAuditEvent {
    return Object.freeze({
      requestId: metadata.requestId,
      tenantId: identity.tenantId,
      subjectId: identity.subjectId,
      actorId: metadata.actorId,
      sessionId: metadata.sessionId,
      action: metadata.action,
      ...(metadata.target === undefined ? {} : { target: metadata.target }),
      ...(metadata.reason === undefined ? {} : { reason: metadata.reason }),
      outcome,
      requestHash: metadata.requestHash,
      beforeHash,
      afterHash,
      revision,
      ...(errorCode === undefined ? {} : { errorCode }),
      recordedAt: new Date().toISOString()
    });
  }
}

const subjectIdentity = (authority: AuthenticatedContext): RuntimeIdentity => ({
  tenantId: authority.tenantId,
  subjectId: authority.subjectId
});

const visibleAtom = (authority: AuthenticatedContext, atom: ProfileAtom): boolean =>
  atom.tenant_id === authority.tenantId &&
  atom.subject_id === authority.subjectId &&
  (atom.sensitivity === "prohibited_inference"
    ? authority.scopes.has("profile:write:sensitive")
    : atom.sensitivity !== "sensitive" || canReadSensitive(authority));

const assertEventIdentity = (
  authority: AuthenticatedContext,
  trace: ReturnType<ConnectedAgentRuntime["learningTrace"]>
): void => {
  assertAuthorityIdentity(authority, {
    tenantId: trace.event.tenant_id,
    subjectId: trace.event.subject_id
  });
  if (trace.atom !== undefined && !visibleAtom(authority, trace.atom)) throw new Error("LEARNING_TRACE_NOT_FOUND");
};

const atomOwnedBy = (runtime: ConnectedAgentRuntime, authority: AuthenticatedContext, atomId: string): ProfileAtom => {
  const atom = runtime.profileAtoms().find((candidate) => candidate.id === atomId);
  if (atom === undefined) throw new Error("ATOM_NOT_FOUND");
  assertAuthorityIdentity(authority, { tenantId: atom.tenant_id, subjectId: atom.subject_id });
  return atom;
};

const requireAtomWriteAuthority = (authority: AuthenticatedContext, atom: ProfileAtom): void => {
  if (atom.sensitivity !== "normal") requireScopes(authority, ["profile:write:sensitive"]);
};

const runVisible = (
  runtime: ConnectedAgentRuntime,
  authority: AuthenticatedContext,
  record: NonNullable<ReturnType<ConnectedAgentRuntime["getRun"]>>
): boolean => {
  if (record.context.tenant_id !== authority.tenantId || record.context.subject_id !== authority.subjectId)
    return false;
  const atoms = runtime.profileAtoms();
  const referencedAtomIds = new Set([
    ...record.run.pack.atom_manifest.map((manifest) => manifest.id),
    ...record.run.trace.appliedAtomIds,
    ...record.run.trace.candidates.map((candidate) => candidate.atomId),
    ...record.run.trace.provenance.map((entry) => entry.atomId)
  ]);
  return [...referencedAtomIds].every((atomId) => {
    const atom = atoms.find((candidate) => candidate.id === atomId);
    return atom !== undefined && visibleAtom(authority, atom);
  });
};

const proposalOwnedBy = (
  runtime: ConnectedAgentRuntime,
  authority: AuthenticatedContext,
  proposalId: string
): ReturnType<ConnectedAgentRuntime["updateProposals"]>[number] => {
  const proposal = runtime.updateProposals().find((candidate) => candidate.id === proposalId);
  if (proposal === undefined) throw new Error("UPDATE_PROPOSAL_NOT_FOUND");
  assertAuthorityIdentity(authority, { tenantId: proposal.tenant_id, subjectId: proposal.subject_id });
  requireAtomWriteAuthority(authority, atomOwnedBy(runtime, authority, proposal.target.id));
  return proposal;
};

const executeQuery = (
  runtime: ConnectedAgentRuntime,
  authority: AuthenticatedContext,
  query: MerakiQuery
): QueryResult<MerakiQuery> => {
  requireScopes(authority, ["profile:read"]);
  switch (query.name) {
    case "retrieve": {
      const context = authorizedTaskContext(authority, query.input);
      return runtime.retrieve(context);
    }
    case "list_atoms":
      return runtime.profileAtoms().filter((atom) => visibleAtom(authority, atom));
    case "learning_trace": {
      const trace = runtime.learningTrace(query.input.eventId);
      assertEventIdentity(authority, trace);
      if (trace.atom !== undefined && !visibleAtom(authority, trace.atom)) throw new Error("LEARNING_TRACE_NOT_FOUND");
      return trace;
    }
    case "atom_trace": {
      const atom = atomOwnedBy(runtime, authority, query.input.atomId);
      if (!visibleAtom(authority, atom)) throw new Error("ATOM_TRACE_NOT_FOUND");
      const trace = runtime.learningTraceForAtom(query.input.atomId);
      assertEventIdentity(authority, trace);
      return trace;
    }
    case "list_update_proposals":
      return runtime.updateProposals().filter((proposal) => {
        if (proposal.tenant_id !== authority.tenantId || proposal.subject_id !== authority.subjectId) return false;
        const atom = runtime.profileAtoms().find((candidate) => candidate.id === proposal.target.id);
        return atom !== undefined && visibleAtom(authority, atom);
      });
    case "list_runs": {
      const visible = runtime.recentRuns().filter((record) => runVisible(runtime, authority, record));
      return query.input.limit === undefined ? visible : visible.slice(0, query.input.limit);
    }
    case "get_run": {
      const run = runtime.getRun(query.input.runId);
      if (run === undefined) return undefined;
      if (!runVisible(runtime, authority, run)) return undefined;
      return run;
    }
    case "list_evaluations":
      return runtime.evaluations().filter((record) => {
        const run = runtime.getRun(record.runId);
        return run !== undefined && runVisible(runtime, authority, run);
      });
  }
};

const authorizeCommand = (authority: AuthenticatedContext, command: MerakiCommand): void => {
  switch (command.name) {
    case "record_correction":
    case "record_activity":
    case "record_outcome":
      requireScopes(authority, ["evidence:write"]);
      assertAuthorityIdentity(authority, command.input);
      return;
    case "extract_candidate":
    case "propose_update":
    case "command_update_proposal":
    case "command_atom":
      requireScopes(authority, ["profile:write"]);
      return;
    case "run_agent":
      requireScopes(authority, ["profile:read", "evidence:write"]);
      authorizedTaskContext(authority, command.input.context);
      return;
    case "record_evaluation":
      requireScopes(authority, ["evaluation:write"]);
      return;
  }
};

const commandAuditMetadata = (command: MerakiCommand): Readonly<{ target?: string; reason?: string }> => {
  switch (command.name) {
    case "record_correction":
    case "record_activity":
    case "record_outcome":
      return { target: command.input.runId };
    case "extract_candidate":
      return { target: command.input.eventId };
    case "run_agent":
      return { target: command.input.context.task_id };
    case "record_evaluation":
      return { target: command.input.runId };
    case "propose_update":
      return { target: command.input.lessonId };
    case "command_update_proposal":
      return { target: command.input.proposalId };
    case "command_atom":
      return {
        target: command.input.atomId,
        ...(command.input.reason === undefined ? {} : { reason: command.input.reason })
      };
  }
};

const authorizeCommandResource = (
  runtime: ConnectedAgentRuntime,
  authority: AuthenticatedContext,
  command: MerakiCommand
): void => {
  switch (command.name) {
    case "record_correction":
    case "record_activity":
    case "record_outcome":
      return;
    case "extract_candidate": {
      const trace = runtime.learningTrace(command.input.eventId);
      assertEventIdentity(authority, trace);
      if (trace.atom !== undefined) requireAtomWriteAuthority(authority, trace.atom);
      return;
    }
    case "run_agent":
      authorizedTaskContext(authority, command.input.context);
      return;
    case "record_evaluation": {
      const run = runtime.getRun(command.input.runId);
      if (run === undefined || !runVisible(runtime, authority, run)) throw new Error("RUN_NOT_FOUND");
      return;
    }
    case "propose_update":
      requireAtomWriteAuthority(authority, atomOwnedBy(runtime, authority, command.input.lessonId));
      return;
    case "command_update_proposal":
      proposalOwnedBy(runtime, authority, command.input.proposalId);
      return;
    case "command_atom":
      requireAtomWriteAuthority(authority, atomOwnedBy(runtime, authority, command.input.atomId));
      return;
  }
};

const executeCommand = (
  runtime: ConnectedAgentRuntime,
  authority: AuthenticatedContext,
  command: MerakiCommand
): CommandResult<MerakiCommand> => {
  authorizeCommand(authority, command);
  authorizeCommandResource(runtime, authority, command);
  switch (command.name) {
    case "record_correction":
      requireScopes(authority, ["evidence:write"]);
      assertAuthorityIdentity(authority, command.input);
      return runtime.correction({
        ...command.input,
        tenantId: authority.tenantId,
        subjectId: authority.subjectId,
        actorId: authority.actorId
      });
    case "record_activity":
      requireScopes(authority, ["evidence:write"]);
      assertAuthorityIdentity(authority, command.input);
      return runtime.activity({
        ...command.input,
        tenantId: authority.tenantId,
        subjectId: authority.subjectId,
        actorId: authority.actorId
      });
    case "record_outcome":
      requireScopes(authority, ["evidence:write"]);
      assertAuthorityIdentity(authority, command.input);
      return runtime.outcome({
        ...command.input,
        tenantId: authority.tenantId,
        subjectId: authority.subjectId
      });
    case "extract_candidate": {
      requireScopes(authority, ["profile:write"]);
      const trace = runtime.learningTrace(command.input.eventId);
      assertEventIdentity(authority, trace);
      return runtime.extractActivityLesson(command.input);
    }
    case "run_agent":
      return runtime.run({
        ...command.input,
        context: authorizedTaskContext(authority, command.input.context)
      });
    case "record_evaluation": {
      requireScopes(authority, ["evaluation:write"]);
      const run = runtime.getRun(command.input.runId);
      if (run === undefined) throw new Error("RUN_NOT_FOUND");
      assertAuthorityIdentity(authority, {
        tenantId: run.context.tenant_id,
        subjectId: run.context.subject_id
      });
      return runtime.recordEvaluation(command.input);
    }
    case "propose_update":
      requireScopes(authority, ["profile:write"]);
      requireAtomWriteAuthority(authority, atomOwnedBy(runtime, authority, command.input.lessonId));
      return runtime.proposeUpdate(command.input.lessonId, command.input.evidenceEventId, command.input.operation);
    case "command_update_proposal": {
      requireScopes(authority, ["profile:write"]);
      proposalOwnedBy(runtime, authority, command.input.proposalId);
      return command.input.operation === "approve"
        ? runtime.applyUpdateProposal(command.input.proposalId)
        : command.input.operation === "reject"
          ? { proposal: runtime.rejectUpdateProposal(command.input.proposalId) }
          : runtime.rollbackUpdateProposal(command.input.proposalId);
    }
    case "command_atom": {
      requireScopes(authority, ["profile:write"]);
      const input = command.input;
      const atom = atomOwnedBy(runtime, authority, input.atomId);
      requireAtomWriteAuthority(authority, atom);
      if (input.reason !== undefined && (typeof input.reason !== "string" || !input.reason.trim()))
        throw new ApplicationError("DECISION_REASON_INVALID");
      if (input.requiredLifecycles !== undefined && !input.requiredLifecycles.includes(atom.lifecycle))
        throw new ApplicationError("ATOM_LIFECYCLE_PRECONDITION_FAILED");
      if (input.operation === "split") return runtime.split(input.atomId, input.claims ?? [], input.expectedVersion);
      if (input.operation === "confirm") return runtime.approve(input.atomId, input.expectedVersion);
      if (input.operation === "edit") return runtime.edit(input.atomId, input.claim ?? "", input.expectedVersion);
      if (input.operation === "revoke") return runtime.revoke(input.atomId, input.expectedVersion);
      if (input.operation === "supersede") return runtime.supersede(input.atomId, input.expectedVersion);
      if (input.operation === "weaken")
        return runtime.weaken(input.atomId, input.counterevidenceEventId ?? "", input.expectedVersion);
      return runtime.rescope(
        input.atomId,
        input.operation === "limit" ? { level: "task", ref: "current-task" } : scopeFromUnknown(input.scope),
        input.mode,
        input.expectedVersion
      );
    }
  }
};

export class MerakiApplicationService implements MerakiApplication {
  public constructor(private readonly unitOfWork: RuntimeUnitOfWork) {}

  public async query<Q extends MerakiQuery>(authority: AuthenticatedContext, query: Q): Promise<QueryResult<Q>> {
    const result = await this.unitOfWork.read(subjectIdentity(authority), (runtime) =>
      executeQuery(runtime, authority, query)
    );
    return result as QueryResult<Q>;
  }

  public async mutate<C extends MerakiCommand>(
    authority: AuthenticatedContext,
    request: MutationEnvelope<C>
  ): Promise<MutationReceipt<CommandResult<C>>> {
    if (!request.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
    if (!request.idempotencyKey.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
    authorizeCommand(authority, request.command);
    const requestHash = sha256Digest(
      canonicalJson({
        tenant_id: authority.tenantId,
        subject_id: authority.subjectId,
        actor_id: authority.actorId,
        scopes: [...authority.scopes].sort(),
        command: request.command
      })
    );
    const receipt = await this.unitOfWork.transact(
      subjectIdentity(authority),
      {
        requestId: request.requestId,
        idempotencyKey: request.idempotencyKey,
        requestHash,
        action: request.command.name,
        actorId: authority.actorId,
        sessionId: authority.sessionId,
        scopes: [...authority.scopes].sort(),
        ...commandAuditMetadata(request.command)
      },
      (runtime) => authorizeCommandResource(runtime, authority, request.command),
      (runtime) => executeCommand(runtime, authority, request.command)
    );
    return receipt as MutationReceipt<CommandResult<C>>;
  }
}

export const createInMemoryApplication = (
  runtime = new ConnectedAgentRuntime(),
  persist?: RuntimePersist
): Readonly<{ application: MerakiApplicationService; unitOfWork: InMemoryRuntimeUnitOfWork }> => {
  const unitOfWork = new InMemoryRuntimeUnitOfWork(runtime, persist);
  return {
    application: new MerakiApplicationService(unitOfWork),
    unitOfWork
  };
};
