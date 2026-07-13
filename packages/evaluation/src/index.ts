import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";

export type Variant = "baseline" | "full" | "no-evidence" | "no-retrieval" | "no-learning";
export type Lifecycle = "proposed" | "approved" | "limited" | "revoked";

export interface CorrectionEvidence {
  readonly id: string;
  readonly task: string;
  readonly mode: string;
  readonly statement: string;
  readonly createdAt: string;
  readonly digest: string;
}

export interface Lesson {
  readonly id: string;
  readonly evidenceId: string;
  readonly task: string;
  readonly mode: string;
  readonly guidance: string;
  readonly scope: "task" | "mode" | "project" | "workspace";
  readonly confidence: number;
  readonly lifecycle: Lifecycle;
}

export interface RunInput { readonly task: string; readonly mode: string; readonly prompt: string; }
export interface RunOutput {
  readonly variant: Variant;
  readonly guidanceApplied: string | null;
  readonly answer: string;
  readonly correct: boolean;
  readonly trace: readonly string[];
}

export interface EvaluationReport {
  readonly scenario: string;
  readonly related: { readonly baseline: RunOutput; readonly conditioned: RunOutput; };
  readonly unrelated: { readonly baseline: RunOutput; readonly conditioned: RunOutput; };
  readonly ablation: Readonly<Record<Variant, RunOutput>>;
  readonly improvement: boolean;
  readonly unrelatedUnaffected: boolean;
  readonly attribution: "retrieved-approved-lesson" | "not-attributed";
}

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

/** Append-only evidence and governed lessons. Existing records are never mutated. */
export class LearningLedger {
  private readonly evidence = new Map<string, CorrectionEvidence>();
  private readonly lessons = new Map<string, Lesson>();

  appendCorrection(input: Omit<CorrectionEvidence, "digest">): CorrectionEvidence {
    const record = Object.freeze({ ...input, digest: digest(JSON.stringify(input)) });
    const prior = this.evidence.get(record.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(record)) throw new Error("immutable evidence conflict");
    this.evidence.set(record.id, record);
    return record;
  }

  proposeLesson(input: Omit<Lesson, "lifecycle">): Lesson {
    if (!this.evidence.has(input.evidenceId)) throw new Error("lesson must reference immutable evidence");
    const lesson = Object.freeze({ ...input, lifecycle: "proposed" as const });
    if (this.lessons.has(lesson.id)) throw new Error("lesson id already exists");
    this.lessons.set(lesson.id, lesson);
    return lesson;
  }

  governLesson(id: string, lifecycle: Exclude<Lifecycle, "proposed">): Lesson {
    const old = this.lessons.get(id); if (!old) throw new Error("unknown lesson");
    const next = Object.freeze({ ...old, lifecycle });
    this.lessons.set(id, next);
    return next;
  }

  relevant(task: string, mode: string): Lesson | null {
    return [...this.lessons.values()].find((x) => x.lifecycle === "approved" && x.task === task && x.mode === mode) ?? null;
  }

  snapshot() { return { evidence: [...this.evidence.values()], lessons: [...this.lessons.values()] }; }
  static fromSnapshot(snapshot: ReturnType<LearningLedger["snapshot"]>): LearningLedger {
    const ledger = new LearningLedger();
    for (const e of snapshot.evidence) ledger.evidence.set(e.id, Object.freeze(e));
    for (const l of snapshot.lessons) ledger.lessons.set(l.id, Object.freeze(l));
    return ledger;
  }
}

export class JsonLearningLedger {
  constructor(private readonly path: string) {}
  async save(ledger: LearningLedger) { const tmp = `${this.path}.tmp`; await writeFile(tmp, JSON.stringify(ledger.snapshot(), null, 2), "utf8"); await rename(tmp, this.path); }
  async load() { try { return LearningLedger.fromSnapshot(JSON.parse(await readFile(this.path, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return new LearningLedger(); throw error; } }
}

function run(input: RunInput, variant: Variant, lesson: Lesson | null): RunOutput {
  const applicable = variant === "full" && lesson && lesson.lifecycle === "approved" ? lesson : null;
  const answer = applicable ? `${applicable.guidance} :: ${input.prompt}` : input.prompt;
  const correct = input.task === "formatting" ? answer.includes("bullets") : input.task === "unrelated";
  return { variant, guidanceApplied: applicable?.guidance ?? null, answer, correct, trace: applicable ? ["lesson", applicable.evidenceId] : ["baseline"] };
}

export function evaluateControlled(scenario = "formatting-correction"): EvaluationReport {
  const ledger = new LearningLedger();
  const evidence = ledger.appendCorrection({ id: "e-correction-1", task: "formatting", mode: "editorial", statement: "Use concise bullets for this task.", createdAt: "2026-01-01T00:00:00.000Z" });
  const proposed = ledger.proposeLesson({ id: "l-bullets-1", evidenceId: evidence.id, task: "formatting", mode: "editorial", guidance: "Use bullets", scope: "task", confidence: 0.98 });
  ledger.governLesson(proposed.id, "approved");
  const related: RunInput = { task: "formatting", mode: "editorial", prompt: "Answer with bullets" };
  const unrelated: RunInput = { task: "unrelated", mode: "research", prompt: "Answer directly" };
  const lesson = ledger.relevant(related.task, related.mode);
  const ablation = Object.fromEntries(((["baseline", "full", "no-evidence", "no-retrieval", "no-learning"] as Variant[]).map((v) => [v, run(related, v, v === "no-evidence" || v === "no-retrieval" || v === "no-learning" ? null : lesson)]))) as Record<Variant, RunOutput>;
  const rb = run(related, "baseline", null), rc = run(related, "full", lesson), ub = run(unrelated, "baseline", null), uc = run(unrelated, "full", lesson);
  return { scenario, related: { baseline: rb, conditioned: rc }, unrelated: { baseline: ub, conditioned: uc }, ablation, improvement: !rb.correct && rc.correct, unrelatedUnaffected: ub.answer === uc.answer, attribution: !rb.correct && rc.correct && rc.trace.includes(evidence.id) ? "retrieved-approved-lesson" : "not-attributed" };
}

export async function verifyRestart(path: string): Promise<boolean> {
  const store = new JsonLearningLedger(path), ledger = new LearningLedger();
  const evidence = ledger.appendCorrection({ id: "restart-evidence", task: "formatting", mode: "editorial", statement: "Use bullets", createdAt: "2026-01-01T00:00:00.000Z" });
  const lesson = ledger.proposeLesson({ id: "restart-lesson", evidenceId: evidence.id, task: "formatting", mode: "editorial", guidance: "Use bullets", scope: "task", confidence: 1 });
  ledger.governLesson(lesson.id, "approved"); await store.save(ledger);
  const restored = await store.load(); return restored.relevant("formatting", "editorial")?.evidenceId === evidence.id;
}
