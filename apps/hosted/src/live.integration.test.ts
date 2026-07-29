import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseHostedConfig } from "./config.js";
import { handleHostedRest, type HostedRestDependencies } from "./handler.js";
import { createRequestId } from "./security.js";
import { withHostedApplication } from "./services.js";

type LiveHostedConfig = Readonly<{
  databaseUrl: string;
  tokenPepper: string;
  token: string;
  tenantId: string;
  subjectId: string;
  actorId: string;
}>;

const liveConfig = (): LiveHostedConfig | undefined => {
  const values = {
    databaseUrl: process.env.MERAKI_TEST_HOSTED_DATABASE_URL,
    tokenPepper: process.env.MERAKI_TEST_HOSTED_TOKEN_PEPPER,
    token: process.env.MERAKI_TEST_HOSTED_TOKEN,
    tenantId: process.env.MERAKI_TEST_HOSTED_TENANT_ID,
    subjectId: process.env.MERAKI_TEST_HOSTED_SUBJECT_ID,
    actorId: process.env.MERAKI_TEST_HOSTED_ACTOR_ID
  };
  return Object.values(values).every((value) => typeof value === "string" && value.length > 0)
    ? (values as LiveHostedConfig)
    : undefined;
};

const origin = "https://hosted-live-test.example.test";
const config = liveConfig();

if (config === undefined) {
  describe.skip("live hosted request lifecycle", () => {
    it("requires the explicit MERAKI_TEST_HOSTED_* environment", () => undefined);
  });
} else {
  const hostedConfig = parseHostedConfig({
    DATABASE_URL: config.databaseUrl,
    MERAKI_TOKEN_PEPPER: config.tokenPepper,
    MERAKI_ALLOWED_ORIGINS: origin,
    MERAKI_PUBLIC_BASE_URL: origin,
    MERAKI_MAX_REQUEST_BYTES: "262144",
    NODE_ENV: "test"
  });

  const dependencies: HostedRestDependencies = {
    loadConfig: () => hostedConfig,
    requestId: () => createRequestId(),
    runWithApplication: withHostedApplication
  };

  const call = (
    method: "GET" | "POST",
    path: readonly string[],
    input: Readonly<{
      auth?: "valid" | "missing" | "wrong";
      body?: unknown;
      idempotencyKey?: string;
      query?: string;
    }> = {}
  ): Promise<Response> => {
    const headers = new Headers({ origin });
    const auth = input.auth ?? "valid";
    if (auth === "valid") headers.set("authorization", `Bearer ${config.token}`);
    if (auth === "wrong") headers.set("authorization", `Bearer wrong-${randomUUID()}`);
    if (input.body !== undefined) headers.set("content-type", "application/json");
    if (input.idempotencyKey !== undefined) headers.set("idempotency-key", input.idempotencyKey);
    return handleHostedRest(
      new Request(`${origin}/v1/${path.join("/")}${input.query ?? ""}`, {
        method,
        headers,
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
      }),
      path,
      dependencies
    );
  };

  const json = async <T>(response: Response): Promise<T> => (await response.json()) as T;

  describe("live hosted request lifecycle", () => {
    it("authenticates opaque tokens and preserves a governed learning loop across fresh clients", async () => {
      const namespace = randomUUID();
      const project = `hosted-live-${namespace}`;
      const unrelatedProject = `hosted-unrelated-${namespace}`;
      const taskType = `hosted live writing ${namespace}`;
      const mode = `hosted-live-${namespace}`;
      const scope = { level: "project" as const, ref: project };
      const context = (taskId: string, projectRef = project) => ({
        contract: "task_context" as const,
        tenant_id: config.tenantId,
        subject_id: config.subjectId,
        task_id: taskId,
        task_type: taskType,
        scope: { level: "project" as const, ref: projectRef },
        mode,
        constraints: [],
        permissions: [],
        token_budget: 500
      });

      const missing = await call("GET", ["profile", "atoms"], { auth: "missing" });
      expect(missing.status).toBe(401);
      expect(missing.headers.get("cache-control")).toContain("no-store");
      expect(await json<{ error: { code: string } }>(missing)).toMatchObject({
        error: { code: "AUTHENTICATION_REQUIRED" }
      });

      const wrong = await call("GET", ["profile", "atoms"], { auth: "wrong" });
      expect(wrong.status).toBe(401);
      expect(wrong.headers.get("cache-control")).toContain("no-store");
      expect(await json<{ error: { code: string } }>(wrong)).toMatchObject({
        error: { code: "AUTHENTICATION_REQUIRED" }
      });

      const correction = await call("POST", ["corrections"], {
        idempotencyKey: `${namespace}:correction`,
        body: {
          tenantId: config.tenantId,
          subjectId: config.subjectId,
          actorId: config.actorId,
          runId: `${namespace}:correction`,
          taskType,
          scope,
          mode,
          original: "Meraki improves writing.",
          correction: "State the concrete problem and mechanism."
        }
      });
      expect(correction.status).toBe(201);
      expect(correction.headers.get("cache-control")).toContain("no-store");
      expect(correction.headers.get("access-control-allow-origin")).toBe(origin);
      expect(correction.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
      const evidenceId = (await json<{ evidence: { eventId: string } }>(correction)).evidence.eventId;

      const candidateResponse = await call("POST", ["learning", "candidates"], {
        idempotencyKey: `${namespace}:candidate`,
        body: {
          event_id: evidenceId,
          claim: "For this hosted test project, state the concrete problem and mechanism.",
          facet: "judgment.copy",
          temporal_horizon: "ongoing"
        }
      });
      expect(candidateResponse.status).toBe(201);
      const candidate = (await json<{ lesson: { id: string; version: number; lifecycle: string } }>(candidateResponse))
        .lesson;
      expect(candidate.lifecycle).toBe("candidate");

      const beforeApproval = await call("POST", ["agent", "run"], {
        idempotencyKey: `${namespace}:before-approval`,
        body: {
          context: context(`${namespace}:before-approval`),
          request: "Draft the opening.",
          baseline: "Hosted baseline opening."
        }
      });
      expect(beforeApproval.status).toBe(200);
      expect(await json<{ output: string; trace: { changed: boolean } }>(beforeApproval)).toMatchObject({
        output: "Hosted baseline opening.",
        trace: { changed: false }
      });

      const approval = await call("POST", ["profile", "atoms", candidate.id, "commands"], {
        idempotencyKey: `${namespace}:approval`,
        body: {
          atom_id: candidate.id,
          expected_version: candidate.version,
          operation: "confirm",
          reason: "Explicit live hosted integration-test approval."
        }
      });
      expect(approval.status).toBe(200);
      expect(await json<{ atom: { id: string; lifecycle: string } }>(approval)).toMatchObject({
        atom: { id: candidate.id, lifecycle: "active" }
      });

      const related = await call("POST", ["agent", "run"], {
        idempotencyKey: `${namespace}:related`,
        body: {
          context: context(`${namespace}:related`),
          request: "Draft the opening.",
          baseline: "Hosted baseline opening."
        }
      });
      const relatedResult = await json<{ output: string; trace: { changed: boolean; appliedAtomIds: string[] } }>(
        related
      );
      expect(related.status).toBe(200);
      expect(related.headers.get("cache-control")).toContain("no-store");
      expect(relatedResult.trace).toMatchObject({ changed: true, appliedAtomIds: [candidate.id] });
      expect(relatedResult.output).toContain("concrete problem and mechanism");

      const unrelated = await call("POST", ["agent", "run"], {
        idempotencyKey: `${namespace}:unrelated`,
        body: {
          context: context(`${namespace}:unrelated`, unrelatedProject),
          request: "Review an unrelated implementation.",
          baseline: "Unrelated baseline preserved."
        }
      });
      expect(unrelated.status).toBe(200);
      expect(await json<{ output: string; trace: { changed: boolean } }>(unrelated)).toMatchObject({
        output: "Unrelated baseline preserved.",
        trace: { changed: false }
      });

      const persisted = await call("GET", ["profile", "atoms"], { query: "?limit=1000" });
      expect(persisted.status).toBe(200);
      expect((await json<{ items: Array<{ id: string; lifecycle: string }> }>(persisted)).items).toContainEqual(
        expect.objectContaining({ id: candidate.id, lifecycle: "active" })
      );
    }, 120_000);
  });
}
