import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConnectedAgentRuntime } from "@meraki/core";
import { JsonConnectedRuntimeStore } from "@meraki/storage-local";

const context = (mode = "concise") => ({
  contract: "task_context" as const,
  tenant_id: "local",
  subject_id: "builder",
  task_id: `task-${mode}`,
  task_type: "email",
  scope: { level: "project" as const, ref: "quickstart" },
  mode,
  constraints: [],
  permissions: [],
  token_budget: 1000
});

const directory = await mkdtemp(join(tmpdir(), "meraki-quickstart-"));
try {
  const store = new JsonConnectedRuntimeStore(join(directory, "runtime.json"));
  const runtime = new ConnectedAgentRuntime();
  const evidence = runtime.correction({
    tenantId: "local",
    subjectId: "builder",
    actorId: "builder",
    runId: "correction-1",
    taskType: "email",
    scope: { level: "project", ref: "quickstart" },
    mode: "concise",
    original: "A long and vague subject",
    correction: "Use a concise, concrete subject line"
  });
  const candidate = runtime.extractActivityLesson({
    eventId: evidence.eventId,
    claim: "For email, use a concise, concrete subject line.",
    facet: "communication"
  });
  const beforeApproval = runtime.retrieve(context()).pack.items.length;
  runtime.approve(candidate.id, candidate.version);
  const related = runtime.run({ context: context(), request: "Draft an update", baseline: "BASELINE" });
  const unrelated = runtime.run({
    context: context("creative"),
    request: "Write a poem",
    baseline: "BASELINE"
  });
  await store.save(runtime);
  const restored = await store.load();

  if (
    beforeApproval !== 0 ||
    !related.trace.changed ||
    unrelated.trace.changed ||
    restored.profileAtoms().length !== 1
  ) {
    throw new Error("QUICKSTART_ASSERTION_FAILED");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        evidence: evidence.eventId,
        candidate: { id: candidate.id, lifecycle: candidate.lifecycle },
        beforeApproval,
        relatedChanged: related.trace.changed,
        unrelatedChanged: unrelated.trace.changed,
        restartPreserved: restored.profileAtoms().length === 1
      },
      null,
      2
    )}\n`
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
