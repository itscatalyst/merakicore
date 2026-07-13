import { createHash, randomUUID } from "node:crypto";
import type { EvidenceRef, Feedback, IdVersion, MerakiPack, ProfileAtom, Scope, TaskContext } from "@meraki/contracts";

export type CorrectionInput = {
  tenantId: string;
  subjectId: string;
  actorId: string;
  runId: string;
  taskType: string;
  scope: Scope;
  mode?: string;
  original: string;
  correction: string;
  source?: string;
};

export type ImmutableCorrection = Readonly<{
  feedback: Feedback;
  eventId: string;
  original: string;
  correction: string;
  taskType: string;
  scope: Scope;
  mode?: string;
  contentHash: string;
}>;

export type Lesson = ProfileAtom & Readonly<{ guidance: string; sourceEventId: string }>;

export type LearningReceipt = Readonly<{
  evidence: ImmutableCorrection;
  lesson: Lesson;
  pack: MerakiPack;
}>;

const digest = (value: string): `sha256:${string}` => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const now = (): string => new Date().toISOString();
const ref = (eventId: string, text: string): EvidenceRef => ({ event_id: eventId, span_start: 0, span_end: text.length, quote_hash: digest(text) });
const sameScope = (a: Scope, b: Scope): boolean => a.level === b.level && a.ref === b.ref;

/** Deterministic in-memory vertical slice used by adapters and tests. Persistence adapters can implement the same contract. */
export class LearningEngine {
  private readonly evidence = new Map<string, ImmutableCorrection>();
  private readonly lessons = new Map<string, Lesson>();

  recordCorrection(input: CorrectionInput): ImmutableCorrection {
    if (!input.original.trim() || !input.correction.trim()) throw new Error("CORRECTION_TEXT_REQUIRED");
    const eventId = randomUUID();
    const contentHash = digest(JSON.stringify({ original: input.original, correction: input.correction, runId: input.runId }));
    const feedback: Feedback = { contract: "feedback", id: randomUUID(), tenant_id: input.tenantId, subject_id: input.subjectId, run_id: input.runId, actor_id: input.actorId, feedback_type: "correction", content: input.correction, created_at: now() };
    const evidence: ImmutableCorrection = Object.freeze({ feedback, eventId, original: input.original, correction: input.correction, taskType: input.taskType, scope: input.scope, ...(input.mode === undefined ? {} : { mode: input.mode }), contentHash });
    this.evidence.set(eventId, evidence);
    return evidence;
  }

  extractLesson(eventId: string): Lesson {
    const evidence = this.evidence.get(eventId);
    if (!evidence) throw new Error("EVIDENCE_NOT_FOUND");
    const id = randomUUID();
    const created = now();
    const claim = `For ${evidence.taskType}, prefer: ${evidence.correction}`;
    const lesson: Lesson = Object.freeze({ contract: "profile_atom", id, version: 1, tenant_id: evidence.feedback.tenant_id, subject_id: evidence.feedback.subject_id, facet: "workflow", claim, epistemic_class: "declared", scope: evidence.scope, ...(evidence.mode === undefined ? {} : { mode: evidence.mode }), temporal_horizon: "ongoing", lifecycle: "candidate", confidence: 0.9, utility: 1, sensitivity: "normal", evidence: [ref(evidence.eventId, evidence.correction)], counterevidence: [], created_at: created, guidance: claim, sourceEventId: evidence.eventId });
    this.lessons.set(id, lesson);
    return lesson;
  }

  approve(lessonId: string, expectedVersion = 1): Lesson {
    const lesson = this.requireLesson(lessonId);
    if (lesson.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const next = Object.freeze({ ...lesson, version: lesson.version + 1, lifecycle: "active" as const });
    this.lessons.set(lessonId, next);
    return next;
  }

  edit(lessonId: string, claim: string, expectedVersion: number): Lesson {
    if (!claim.trim()) throw new Error("CLAIM_REQUIRED");
    const lesson = this.requireLesson(lessonId);
    if (lesson.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const next = Object.freeze({ ...lesson, version: lesson.version + 1, claim, guidance: claim });
    this.lessons.set(lessonId, next);
    return next;
  }

  revoke(lessonId: string, expectedVersion: number): Lesson {
    const lesson = this.requireLesson(lessonId);
    if (lesson.version !== expectedVersion) throw new Error("VERSION_CONFLICT");
    const next = Object.freeze({ ...lesson, version: lesson.version + 1, lifecycle: "revoked" as const });
    this.lessons.set(lessonId, next);
    return next;
  }

  retrieve(context: TaskContext): { candidates: Array<{ atom: IdVersion; decision: "included" | "excluded"; reasons: Array<string> }>; pack: MerakiPack } {
    const candidates = [...this.lessons.values()].map((lesson) => {
      const relevant = lesson.tenant_id === context.tenant_id && lesson.subject_id === context.subject_id && lesson.lifecycle === "active" && sameScope(lesson.scope, context.scope) && (lesson.mode === undefined || lesson.mode === context.mode) && lesson.claim.toLowerCase().includes(context.task_type.toLowerCase());
      return { atom: { id: lesson.id, version: lesson.version }, decision: relevant ? "included" as const : "excluded" as const, reasons: [relevant ? "active lesson matches tenant, subject, task, scope, and mode" : "scope, mode, lifecycle, or task mismatch"] };
    });
    const included = candidates.filter((candidate) => candidate.decision === "included");
    const items = included.map((candidate) => { const lesson = this.requireLesson(candidate.atom.id); return { atom: candidate.atom, guidance: lesson.guidance, reason: candidate.reasons[0] ?? "matched" }; });
    const taskDigest = digest(JSON.stringify(context));
    const pack: MerakiPack = { contract: "meraki_pack", id: randomUUID(), tenant_id: context.tenant_id, subject_id: context.subject_id, task_context_digest: taskDigest, items, atom_manifest: included.map((candidate) => candidate.atom), policy_version: "learning-engine/0.1", renderer_version: "deterministic/0.1", canonicalization: "RFC8785", hash: digest(JSON.stringify(items)), created_at: now() };
    return { candidates, pack };
  }

  learn(input: CorrectionInput): LearningReceipt { const evidence = this.recordCorrection(input); const lesson = this.approve(this.extractLesson(evidence.eventId).id); const retrieved = this.retrieve({ contract: "task_context", tenant_id: input.tenantId, subject_id: input.subjectId, task_id: input.runId, task_type: input.taskType, scope: input.scope, ...(input.mode === undefined ? {} : { mode: input.mode }), constraints: [], permissions: [], token_budget: 1000 }); return { evidence, lesson, pack: retrieved.pack }; }
  getEvidence(eventId: string): ImmutableCorrection { const evidence = this.evidence.get(eventId); if (!evidence) throw new Error("EVIDENCE_NOT_FOUND"); return evidence; }
  private requireLesson(id: string): Lesson { const lesson = this.lessons.get(id); if (!lesson) throw new Error("LESSON_NOT_FOUND"); return lesson; }
}
