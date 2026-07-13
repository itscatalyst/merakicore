import { describe, expect, it } from "vitest";
import { LearningEngine } from "./index.js";

const base = { tenantId: "tenant-a", subjectId: "user-a", actorId: "user-a", runId: "run-a", taskType: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", original: "Draft the email", correction: "Use a concise subject line" };
const context = (overrides: Record<string, unknown> = {}) => ({ contract: "task_context" as const, tenant_id: "tenant-a", subject_id: "user-a", task_id: "task-1", task_type: "email", scope: { level: "project" as const, ref: "acme" }, mode: "concise", constraints: [], permissions: [], token_budget: 1000, ...overrides });

describe("Meraki learning vertical slice", () => {
  it("turns a correction into immutable evidence, an approved lesson, and scoped behavior guidance", () => {
    const engine = new LearningEngine();
    const receipt = engine.learn(base);
    expect(Object.isFrozen(receipt.evidence)).toBe(true);
    expect(receipt.evidence.feedback.feedback_type).toBe("correction");
    expect(receipt.lesson.lifecycle).toBe("active");
    expect(receipt.pack.items[0]?.guidance).toContain("Use a concise subject line");
    expect(receipt.pack.atom_manifest).toEqual([{ id: receipt.lesson.id, version: receipt.lesson.version }]);
    expect(receipt.evidence.feedback.id).not.toBe(receipt.evidence.eventId);
  });

  it("does not leak learning across mode, project, or subject boundaries and supports revoke", () => {
    const engine = new LearningEngine();
    const receipt = engine.learn(base);
    expect(engine.retrieve(context({ mode: "creative" })).pack.items).toHaveLength(0);
    expect(engine.retrieve(context({ scope: { level: "project", ref: "other" } })).pack.items).toHaveLength(0);
    expect(engine.retrieve(context({ subject_id: "user-b" })).pack.items).toHaveLength(0);
    engine.revoke(receipt.lesson.id, receipt.lesson.version);
    expect(engine.retrieve(context()).pack.items).toHaveLength(0);
  });

  it("preserves source traceability and optimistic concurrency for Studio edits", () => {
    const engine = new LearningEngine();
    const evidence = engine.recordCorrection(base);
    const lesson = engine.extractLesson(evidence.eventId);
    expect(lesson.evidence[0]?.event_id).toBe(evidence.eventId);
    expect(() => engine.approve(lesson.id, 2)).toThrow("VERSION_CONFLICT");
    const approved = engine.approve(lesson.id);
    const edited = engine.edit(approved.id, "Always use a short subject", approved.version);
    expect(edited.claim).toBe("Always use a short subject");
  });
});
