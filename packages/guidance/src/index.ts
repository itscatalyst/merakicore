import { createHash } from "node:crypto";
import type { MerakiPack, ProfileAtom, RetrievalCandidate, Scope, TaskContext } from "@meraki/contracts";

export type SemanticRetrievalPort = Readonly<{
  score(context: TaskContext, atom: ProfileAtom): number;
}>;

export type GuidanceCompilation = Readonly<{
  candidates: RetrievalCandidate[];
  pack: MerakiPack;
}>;

const digest = (value: string): `sha256:${string}` => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
};
const deterministicUuid = (value: string): string => {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const sameScope = (left: Scope, right: Scope): boolean => left.level === right.level && left.ref === right.ref;
const tokenCost = (value: string): number => Math.max(1, Math.ceil(value.length / 4));
const taskTerms = (context: TaskContext): Set<string> =>
  new Set(
    `${context.task_type} ${context.constraints.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 1)
  );

/** Deterministic local semantic port for tests and offline operation; production adapters may implement the same port with pgvector. */
export const deterministicSemanticPort: SemanticRetrievalPort = {
  score(context, atom) {
    const terms = taskTerms(context);
    const claimTerms = new Set(
      atom.claim
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length > 1)
    );
    const overlap = [...terms].filter((term) => claimTerms.has(term)).length;
    return terms.size === 0 ? 0 : overlap / terms.size;
  }
};

/** Provider-independent, deterministic retrieval and pack compilation with explicit exclusion provenance. */
export const compileGuidance = (
  atoms: readonly ProfileAtom[],
  context: TaskContext,
  semantic: SemanticRetrievalPort = deterministicSemanticPort
): GuidanceCompilation => {
  const eligible = atoms
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((atom) => {
      const reasons: string[] = [];
      if (atom.tenant_id !== context.tenant_id || atom.subject_id !== context.subject_id)
        reasons.push("tenant_or_subject_mismatch");
      if (atom.lifecycle !== "active") reasons.push("inactive_or_revoked");
      if (!sameScope(atom.scope, context.scope)) reasons.push("scope_mismatch");
      if (atom.mode !== undefined && atom.mode !== context.mode) reasons.push("mode_mismatch");
      if (atom.sensitivity === "sensitive" && !context.permissions.includes("read:sensitive"))
        reasons.push("sensitive_permission_denied");
      const lexical = deterministicSemanticPort.score(context, atom);
      const semanticScore = semantic.score(context, atom);
      if (lexical === 0 && semanticScore <= 0) reasons.push("negative_control_no_task_relevance");
      const included = reasons.length === 0;
      const candidate: RetrievalCandidate = {
        contract: "retrieval_candidate",
        atom: { id: atom.id, version: atom.version },
        scores: { lexical, semantic: semanticScore, utility: atom.utility, confidence: atom.confidence },
        decision: included ? "included" : "excluded",
        reasons: included ? ["active_scoped_mode_matched"] : reasons
      };
      return { atom, candidate, score: lexical + semanticScore + atom.utility + atom.confidence };
    });

  const selected: typeof eligible = [];
  let used = 0;
  for (const entry of eligible
    .filter((entry) => entry.candidate.decision === "included")
    .sort((left, right) => right.score - left.score || left.atom.id.localeCompare(right.atom.id))) {
    const cost = tokenCost(entry.atom.claim);
    if (used + cost > context.token_budget) {
      entry.candidate.decision = "excluded";
      entry.candidate.reasons = ["token_budget_exceeded"];
      continue;
    }
    used += cost;
    selected.push(entry);
  }
  const items = selected.map((entry) => ({
    atom: entry.candidate.atom,
    guidance: entry.atom.claim,
    reason: entry.candidate.reasons[0] ?? "matched"
  }));
  const task_context_digest = digest(canonicalJson(context));
  const payload = {
    tenant_id: context.tenant_id,
    subject_id: context.subject_id,
    task_context_digest,
    items,
    atom_manifest: items.map((item) => item.atom),
    policy_version: "guidance/0.1",
    renderer_version: "deterministic/0.1",
    canonicalization: "RFC8785" as const,
    created_at:
      items.length === 0
        ? "1970-01-01T00:00:00.000Z"
        : (selected
            .map((entry) => entry.atom.created_at)
            .sort()
            .at(-1) ?? "1970-01-01T00:00:00.000Z")
  };
  const hash = digest(canonicalJson(payload));
  return {
    candidates: eligible.map((entry) => entry.candidate),
    pack: { contract: "meraki_pack", id: deterministicUuid(hash), ...payload, hash }
  };
};
