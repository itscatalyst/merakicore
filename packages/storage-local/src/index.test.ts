import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectedAgentRuntime } from "@meraki/core";
import { JsonConnectedRuntimeStore } from "./index.js";

describe("local runtime storage", () => {
  it("restores evidence, approved guidance, and run history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meraki-storage-"));
    try {
      const path = join(directory, "runtime.json");
      const store = new JsonConnectedRuntimeStore(path);
      const runtime = new ConnectedAgentRuntime();
      const evidence = runtime.correction({
        tenantId: "tenant-a",
        subjectId: "user-a",
        actorId: "user-a",
        runId: "correction-1",
        taskType: "email",
        scope: { level: "project", ref: "acme" },
        mode: "concise",
        original: "Draft an email",
        correction: "Use a concise subject line"
      });
      const candidate = runtime.extractCorrectionLesson(evidence.eventId);
      expect(candidate.lifecycle).toBe("candidate");
      const taskContext = {
        contract: "task_context" as const,
        tenant_id: "tenant-a",
        subject_id: "user-a",
        task_id: "task-1",
        task_type: "email",
        scope: { level: "project" as const, ref: "acme" },
        mode: "concise",
        constraints: [],
        permissions: [],
        token_budget: 1000
      };
      expect(runtime.retrieve(taskContext).pack.items).toHaveLength(0);
      runtime.approve(candidate.id, candidate.version);
      runtime.run({
        context: taskContext,
        request: "Draft",
        baseline: "BASELINE"
      });
      await store.save(runtime);
      const restored = await store.load();
      expect(restored.profileAtoms()).toHaveLength(1);
      expect(restored.recentRuns()).toHaveLength(1);
      expect(restored.recentRuns()[0]?.run.trace.changed).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
