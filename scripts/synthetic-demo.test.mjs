import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatorPath = join(repositoryRoot, "scripts", "synthetic-demo.mjs");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "meraki-synthetic-test-"));
const SUBPROCESS_TEST_TIMEOUT = 20_000;
let outputNumber = 0;

afterAll(() => {
  if (!temporaryDirectory.startsWith(resolve(tmpdir()))) {
    throw new Error("Refusing to remove a synthetic-test directory outside the OS temp directory");
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

const execute = (count, overrides = {}) => {
  outputNumber += 1;
  const output = join(temporaryDirectory, `snapshot-${outputNumber}.json`);
  const result = spawnSync(process.execPath, [generatorPath, count], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      MERAKI_SYNTHETIC_OUTPUT: output,
      MERAKI_SYNTHETIC_SEED: "generator-test-seed",
      MERAKI_TENANT_ID: "local",
      MERAKI_SUBJECT_ID: "builder",
      MERAKI_ACTOR_ID: "builder",
      ...overrides
    }
  });
  return { ...result, output };
};

describe("synthetic Studio workload", () => {
  it(
    "is logically reproducible and survives persistence without learning flagged content",
    () => {
      const first = execute("20");
      const second = execute("20");
      expect(first.status, first.stderr).toBe(0);
      expect(second.status, second.stderr).toBe(0);

      const firstSummary = JSON.parse(first.stdout);
      const secondSummary = JSON.parse(second.stdout);
      expect(firstSummary.logical_workload_sha256).toBe(secondSummary.logical_workload_sha256);
      expect(firstSummary.mix).toEqual(secondSummary.mix);
      expect(firstSummary.totals).toEqual(secondSummary.totals);
      expect(firstSummary.dashboard_identity).toEqual({
        tenant_id: "local",
        subject_id: "builder",
        actor_id: "builder"
      });
      expect(firstSummary.dashboard_visible.runs).toBeGreaterThan(0);
      expect(firstSummary.totals).toMatchObject({
        evidence_events: 55,
        runs: 20,
        synthetic_evaluations: 22
      });
      expect(firstSummary.security).toEqual({
        injection_flagged_events: 1,
        flagged_events_retained_after_restart: 1,
        flagged_events_observed_or_learned: 0
      });
      expect(firstSummary.validation).toMatchObject({
        numeric_evaluation_criteria: true,
        synthetic_evaluation_reasons: true,
        omitted_scope_ref_accepted: true,
        run_lineage: {
          linked_events: 40,
          explicit_seed_events: 15,
          unresolved_events: 0,
          context_mismatches: 0,
          negative_control_learning: 0,
          linked_evaluations: 22,
          unresolved_evaluations: 0,
          restart_unresolved_events: 0,
          restart_context_mismatches: 0,
          restart_negative_control_learning: 0,
          restart_unresolved_evaluations: 0
        },
        restart_roundtrip: true
      });
      const firstSnapshot = JSON.parse(readFileSync(first.output, "utf8"));
      expect(
        firstSnapshot.evaluations.every((record) =>
          Object.values(record.evaluation.criteria).every(
            (value) => typeof value === "number" && Number.isFinite(value)
          )
        )
      ).toBe(true);
      const recordedRunIds = new Set(firstSnapshot.runs.map((record) => record.run.trace.runId));
      const runsById = new Map(firstSnapshot.runs.map((record) => [record.run.trace.runId, record]));
      expect(
        firstSnapshot.engine.evidenceLedger.events.every((event) => {
          const runId = event.payload.run_id;
          return recordedRunIds.has(runId) || (typeof runId === "string" && runId.startsWith("seed-"));
        })
      ).toBe(true);
      const linkedEvents = firstSnapshot.engine.evidenceLedger.events.filter((event) =>
        recordedRunIds.has(event.payload.run_id)
      );
      expect(
        linkedEvents.every((event) => {
          const run = runsById.get(event.payload.run_id);
          return (
            run !== undefined &&
            event.payload.mode === run.context.mode &&
            JSON.stringify(event.payload.scope) === JSON.stringify(run.context.scope)
          );
        })
      ).toBe(true);
      const negativeControlEventIds = new Set(
        linkedEvents
          .filter((event) => runsById.get(event.payload.run_id).context.mode.endsWith("-negative-control"))
          .map((event) => event.id)
      );
      expect(firstSnapshot.engine.lessons.every((lesson) => !negativeControlEventIds.has(lesson.sourceEventId))).toBe(
        true
      );
      expect(
        firstSnapshot.engine.updateProposals.every((proposal) => !negativeControlEventIds.has(proposal.evidenceEventId))
      ).toBe(true);
      const outcomeByRunId = new Map(
        firstSnapshot.engine.evidenceLedger.events
          .filter((event) => event.event_type === "outcome")
          .map((event) => [event.payload.run_id, event.payload])
      );
      for (const record of firstSnapshot.evaluations) {
        expect(recordedRunIds.has(record.runId)).toBe(true);
        expect(record.evaluation.reason).toMatch(/^synthetic:/u);
        const outcome = outcomeByRunId.get(record.runId);
        const score = outcome.outcome.score;
        const attempts = outcome.outcome.attempts;
        const expectedResult =
          outcome.outcome_type === "abandoned"
            ? "abstain"
            : outcome.outcome_type !== "completion" || score < 0.4
              ? "loss"
              : score >= 0.75 && attempts <= 3
                ? "win"
                : "tie";
        expect(record.evaluation.result).toBe(expectedResult);
      }
    },
    SUBPROCESS_TEST_TIMEOUT
  );

  it(
    "uses the same configurable identity as local token generation",
    () => {
      const result = execute("1", {
        MERAKI_TENANT_ID: "custom-tenant",
        MERAKI_SUBJECT_ID: "custom-subject",
        MERAKI_ACTOR_ID: "custom-actor"
      });
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).dashboard_identity).toEqual({
        tenant_id: "custom-tenant",
        subject_id: "custom-subject",
        actor_id: "custom-actor"
      });
    },
    SUBPROCESS_TEST_TIMEOUT
  );

  it(
    "is visible through the authenticated API and remains subject filtered",
    async () => {
      const generated = execute("12");
      expect(generated.status, generated.stderr).toBe(0);
      const summary = JSON.parse(generated.stdout);
      const [{ buildPersistentServer }, { JwtRequestAuthenticator, signTestJwt }] = await Promise.all([
        import(pathToFileURL(join(repositoryRoot, "apps", "api", "dist", "index.js")).href),
        import(pathToFileURL(join(repositoryRoot, "packages", "auth", "dist", "index.js")).href)
      ]);
      const options = {
        secret: new TextEncoder().encode("synthetic-test-secret-is-at-least-32-bytes"),
        issuer: "https://synthetic.test",
        audience: "meraki-test"
      };
      const tokenFor = (subjectId) =>
        signTestJwt(
          {
            tenant_id: "local",
            subject_id: subjectId,
            actor_id: subjectId,
            session_id: "synthetic-test",
            scope: ["profile:read"]
          },
          options
        );
      const server = await buildPersistentServer(generated.output, new JwtRequestAuthenticator(options));
      try {
        const authorization = `Bearer ${await tokenFor("builder")}`;
        for (const [route, expected] of [
          ["/v1/profile/atoms", summary.dashboard_visible.profile_atoms],
          ["/v1/runs", summary.dashboard_visible.runs],
          ["/v1/evaluations", summary.dashboard_visible.synthetic_evaluations],
          ["/v1/update-proposals", summary.dashboard_visible.update_proposals]
        ]) {
          const response = await server.inject({ method: "GET", url: route, headers: { authorization } });
          expect(response.statusCode, response.body).toBe(200);
          expect(response.json().items).toHaveLength(expected);
        }

        const isolated = await server.inject({
          method: "GET",
          url: "/v1/runs",
          headers: { authorization: `Bearer ${await tokenFor("absent-subject")}` }
        });
        expect(isolated.statusCode, isolated.body).toBe(200);
        expect(isolated.json().items).toHaveLength(0);
      } finally {
        await server.close();
      }
    },
    SUBPROCESS_TEST_TIMEOUT
  );

  it(
    "rejects partially numeric and out-of-range workload counts",
    () => {
      for (const invalid of ["10oops", "0", "10001"]) {
        const result = execute(invalid);
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain("COUNT must be an integer between 1 and 10000");
      }
    },
    SUBPROCESS_TEST_TIMEOUT
  );
});
