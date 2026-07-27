import { randomUUID } from "node:crypto";
import type { EvidenceRef, ProfileAtom, ProfileEdge, Scope } from "@meraki/contracts";
import { canonicalJson, parseScope } from "../domain/index.js";

export type ProfileAtomInput = Readonly<{
  tenantId: string;
  subjectId: string;
  facet: ProfileAtom["facet"];
  claim: string;
  epistemicClass: ProfileAtom["epistemic_class"];
  scope: Scope;
  mode?: string;
  temporalHorizon: ProfileAtom["temporal_horizon"];
  sensitivity?: ProfileAtom["sensitivity"];
  evidence: EvidenceRef[];
  counterevidence?: EvidenceRef[];
}>;

export type ProfileQuery = Readonly<{
  tenantId: string;
  subjectId: string;
  scope: Scope;
  mode?: string;
}>;

export type ProfileGraphSnapshot = Readonly<{ history: Array<[string, ProfileAtom[]]>; edges: ProfileEdge[] }>;

const now = (): string => new Date().toISOString();
const sameScope = (left: Scope, right: Scope): boolean => left.level === right.level && left.ref === right.ref;
const facets = new Set([
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
const epistemicClasses = new Set(["declared", "observed", "inferred", "objective"]);
const temporalHorizons = new Set(["run", "temporary", "ongoing", "durable"]);
const lifecycles = new Set([
  "candidate",
  "active",
  "stable",
  "locked_core",
  "dormant",
  "superseded",
  "revoked",
  "unsupported"
]);
const sensitivities = new Set(["normal", "sensitive", "prohibited_inference"]);
const freeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested);
  }
  return value;
};

/** Versioned canonical profile state; graph edges are projections over immutable atom revisions. */
export class ProfileGraph {
  private readonly history = new Map<string, ProfileAtom[]>();
  private readonly edges = new Map<string, ProfileEdge>();

  createCandidate(input: ProfileAtomInput): ProfileAtom {
    if (typeof input.tenantId !== "string" || !input.tenantId.trim()) throw new Error("TENANT_ID_REQUIRED");
    if (typeof input.subjectId !== "string" || !input.subjectId.trim()) throw new Error("SUBJECT_ID_REQUIRED");
    if (typeof input.claim !== "string" || !input.claim.trim()) throw new Error("CLAIM_REQUIRED");
    if (!Array.isArray(input.evidence) || input.evidence.length === 0) throw new Error("EVIDENCE_REQUIRED");
    if (!facets.has(input.facet)) throw new Error("FACET_INVALID");
    if (!epistemicClasses.has(input.epistemicClass)) throw new Error("EPISTEMIC_CLASS_INVALID");
    if (!temporalHorizons.has(input.temporalHorizon)) throw new Error("TEMPORAL_HORIZON_INVALID");
    if (input.facet === "current_state" && input.temporalHorizon !== "run" && input.temporalHorizon !== "temporary")
      throw new Error("CURRENT_STATE_MUST_BE_TEMPORAL");
    if (input.mode !== undefined && (typeof input.mode !== "string" || !input.mode.trim()))
      throw new Error("MODE_INVALID");
    const scope = parseScope(input.scope);
    const atom = freeze({
      contract: "profile_atom" as const,
      id: randomUUID(),
      version: 1,
      tenant_id: input.tenantId,
      subject_id: input.subjectId,
      facet: input.facet,
      claim: input.claim,
      epistemic_class: input.epistemicClass,
      scope,
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      temporal_horizon: input.temporalHorizon,
      lifecycle: "candidate" as const,
      confidence: 0.5,
      utility: 0,
      sensitivity: input.sensitivity ?? "normal",
      evidence: [...input.evidence],
      counterevidence: [...(input.counterevidence ?? [])],
      created_at: now()
    });
    this.history.set(atom.id, [atom]);
    return atom;
  }

  activate(id: string, expectedVersion: number): ProfileAtom {
    if (this.current(id).lifecycle !== "candidate") throw new Error("CANDIDATE_REQUIRED");
    return this.revise(id, expectedVersion, { lifecycle: "active" });
  }
  revoke(id: string, expectedVersion: number): ProfileAtom {
    return this.revise(id, expectedVersion, { lifecycle: "revoked" });
  }
  supersede(id: string, expectedVersion: number): ProfileAtom {
    return this.revise(id, expectedVersion, { lifecycle: "superseded" });
  }
  rescope(id: string, scope: Scope, mode: string | undefined, expectedVersion: number): ProfileAtom {
    const parsedScope = parseScope(scope);
    if (mode !== undefined) {
      if (typeof mode !== "string" || !mode.trim()) throw new Error("MODE_INVALID");
      return this.revise(id, expectedVersion, { scope: parsedScope, mode });
    }
    const current = this.current(id);
    if (current.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const { mode: removedMode, ...withoutMode } = current;
    void removedMode;
    const next = freeze({ ...withoutMode, scope: parsedScope, version: current.version + 1 });
    this.history.get(id)?.push(next);
    return next;
  }
  amendClaim(id: string, claim: string, expectedVersion: number): ProfileAtom {
    if (!claim.trim()) throw new Error("CLAIM_REQUIRED");
    return this.revise(id, expectedVersion, { claim });
  }
  weaken(id: string, counterevidence: EvidenceRef, expectedVersion: number): ProfileAtom {
    const current = this.current(id);
    return this.revise(id, expectedVersion, {
      counterevidence: [...current.counterevidence, counterevidence],
      confidence: Math.max(0, current.confidence - 0.1)
    });
  }
  reinforce(id: string, expectedVersion: number): ProfileAtom {
    const current = this.current(id);
    return this.revise(id, expectedVersion, {
      confidence: Math.min(1, current.confidence + 0.1),
      utility: Math.min(1, current.utility + 0.1)
    });
  }
  restore(id: string, expectedVersion: number, prior: ProfileAtom): ProfileAtom {
    const current = this.current(id);
    if (current.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    if (prior.id !== current.id) throw new Error("RESTORE_TARGET_MISMATCH");
    if (current.tenant_id !== prior.tenant_id || current.subject_id !== prior.subject_id)
      throw new Error("RESTORE_SUBJECT_MISMATCH");
    parseScope(prior.scope);
    const recordedPrior = this.history.get(id)?.find((atom) => atom.version === prior.version);
    if (prior.version >= current.version || !recordedPrior || canonicalJson(recordedPrior) !== canonicalJson(prior))
      throw new Error("RESTORE_REVISION_REQUIRED");
    const next = freeze({ ...prior, id: current.id, version: current.version + 1 });
    this.history.get(id)?.push(next);
    return next;
  }
  split(id: string, claims: readonly string[], expectedVersion: number): ProfileAtom[] {
    if (claims.length < 2 || claims.some((claim) => !claim.trim())) throw new Error("SPLIT_CLAIMS_REQUIRED");
    const current = this.current(id);
    this.supersede(id, expectedVersion);
    return claims.map((claim) =>
      this.createCandidate({
        tenantId: current.tenant_id,
        subjectId: current.subject_id,
        facet: current.facet,
        claim,
        epistemicClass: current.epistemic_class,
        scope: current.scope,
        ...(current.mode === undefined ? {} : { mode: current.mode }),
        temporalHorizon: current.temporal_horizon,
        sensitivity: current.sensitivity,
        evidence: [...current.evidence],
        counterevidence: [...current.counterevidence]
      })
    );
  }

  linkContradiction(leftId: string, rightId: string): ProfileEdge {
    const left = this.current(leftId),
      right = this.current(rightId);
    if (left.tenant_id !== right.tenant_id || left.subject_id !== right.subject_id)
      throw new Error("CROSS_SUBJECT_EDGE_DENIED");
    const edge = freeze({
      contract: "profile_edge" as const,
      id: randomUUID(),
      tenant_id: left.tenant_id,
      subject_id: left.subject_id,
      from: { id: left.id, version: left.version },
      to: { id: right.id, version: right.version },
      relation: "contradicts" as const,
      created_at: now()
    });
    this.edges.set(edge.id, edge);
    return edge;
  }

  resolve(query: ProfileQuery): ProfileAtom[] {
    if (typeof query.tenantId !== "string" || !query.tenantId.trim()) throw new Error("TENANT_ID_REQUIRED");
    if (typeof query.subjectId !== "string" || !query.subjectId.trim()) throw new Error("SUBJECT_ID_REQUIRED");
    const scope = parseScope(query.scope);
    return [...this.history.keys()]
      .map((id) => this.current(id))
      .filter(
        (atom) =>
          atom.tenant_id === query.tenantId &&
          atom.subject_id === query.subjectId &&
          atom.lifecycle === "active" &&
          sameScope(atom.scope, scope) &&
          (atom.mode === undefined || atom.mode === query.mode)
      )
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  current(id: string): ProfileAtom {
    const revisions = this.history.get(id);
    const atom = revisions?.at(-1);
    if (!atom) throw new Error("ATOM_NOT_FOUND");
    return atom;
  }
  all(): ProfileAtom[] {
    return [...this.history.keys()]
      .map((id) => this.current(id))
      .sort((left, right) => left.id.localeCompare(right.id));
  }
  revisions(id: string): readonly ProfileAtom[] {
    const revisions = this.history.get(id);
    if (!revisions) throw new Error("ATOM_NOT_FOUND");
    return [...revisions];
  }
  contradictionEdges(): readonly ProfileEdge[] {
    return [...this.edges.values()];
  }
  snapshot(): ProfileGraphSnapshot {
    return {
      history: [...this.history.entries()].map(([id, revisions]) => [id, [...revisions]]),
      edges: [...this.edges.values()]
    };
  }
  static fromSnapshot(snapshot: ProfileGraphSnapshot): ProfileGraph {
    const graph = new ProfileGraph();
    for (const [id, revisions] of snapshot.history) {
      if (graph.history.has(id) || revisions.length === 0) throw new Error("SNAPSHOT_PROFILE_HISTORY_INVALID");
      const first = revisions[0];
      if (!first) throw new Error("SNAPSHOT_PROFILE_HISTORY_INVALID");
      if (
        typeof first.tenant_id !== "string" ||
        !first.tenant_id.trim() ||
        typeof first.subject_id !== "string" ||
        !first.subject_id.trim()
      )
        throw new Error("SNAPSHOT_PROFILE_HISTORY_INVALID");
      for (const [index, atom] of revisions.entries()) {
        if (
          atom.id !== id ||
          atom.version !== index + 1 ||
          atom.tenant_id !== first.tenant_id ||
          atom.subject_id !== first.subject_id ||
          typeof atom.claim !== "string" ||
          !atom.claim.trim() ||
          !facets.has(atom.facet) ||
          !epistemicClasses.has(atom.epistemic_class) ||
          !temporalHorizons.has(atom.temporal_horizon) ||
          !lifecycles.has(atom.lifecycle) ||
          !sensitivities.has(atom.sensitivity) ||
          !Number.isFinite(atom.confidence) ||
          atom.confidence < 0 ||
          atom.confidence > 1 ||
          !Number.isFinite(atom.utility) ||
          !Array.isArray(atom.evidence) ||
          !Array.isArray(atom.counterevidence)
        )
          throw new Error("SNAPSHOT_PROFILE_HISTORY_INVALID");
        parseScope(atom.scope);
      }
      graph.history.set(
        id,
        revisions.map((atom) => freeze(atom))
      );
    }
    for (const edge of snapshot.edges) {
      if (graph.edges.has(edge.id)) throw new Error("SNAPSHOT_PROFILE_EDGE_INVALID");
      const left = graph.history.get(edge.from.id)?.find((atom) => atom.version === edge.from.version);
      const right = graph.history.get(edge.to.id)?.find((atom) => atom.version === edge.to.version);
      if (
        !left ||
        !right ||
        left.tenant_id !== edge.tenant_id ||
        right.tenant_id !== edge.tenant_id ||
        left.subject_id !== edge.subject_id ||
        right.subject_id !== edge.subject_id
      )
        throw new Error("SNAPSHOT_PROFILE_EDGE_INVALID");
      graph.edges.set(edge.id, freeze(edge));
    }
    return graph;
  }

  private revise(
    id: string,
    expectedVersion: number,
    patch: Partial<
      Pick<ProfileAtom, "claim" | "scope" | "mode" | "lifecycle" | "confidence" | "utility" | "counterevidence">
    >
  ): ProfileAtom {
    const current = this.current(id);
    if (current.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const next = freeze({ ...current, ...patch, version: current.version + 1 });
    this.history.get(id)?.push(next);
    return next;
  }
}
