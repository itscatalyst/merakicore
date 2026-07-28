import { MerakiApplicationService, type MerakiCommand } from "@meraki/application";
import { ConnectedAgentRuntime, canonicalJson, sha256Digest, type ConnectedRuntimeSnapshot } from "@meraki/core";
import { describe, expect, it } from "vitest";
import { PostgresAccessTokenAuthenticator } from "./auth.js";
import { createPostgresClient, type SqlRow } from "./client.js";
import { PostgresRuntimeUnitOfWork } from "./unit-of-work.js";

type LiveConfig = Readonly<{
  databaseUrl: string;
  adminDatabaseUrl: string;
  pepper: string;
  token: string;
  revokedToken: string;
  expiredToken: string;
  revalidateToken: string;
  otherToken: string;
  otherTenantToken: string;
  tenantId: string;
  subjectId: string;
  otherSubjectId: string;
  otherTenantId: string;
}>;

const liveConfig = (): LiveConfig | undefined => {
  const values = {
    databaseUrl: process.env.MERAKI_TEST_DATABASE_URL,
    adminDatabaseUrl: process.env.MERAKI_TEST_ADMIN_DATABASE_URL,
    pepper: process.env.MERAKI_TEST_TOKEN_PEPPER,
    token: process.env.MERAKI_TEST_TOKEN,
    revokedToken: process.env.MERAKI_TEST_REVOKED_TOKEN,
    expiredToken: process.env.MERAKI_TEST_EXPIRED_TOKEN,
    revalidateToken: process.env.MERAKI_TEST_REVALIDATE_TOKEN,
    otherToken: process.env.MERAKI_TEST_OTHER_TOKEN,
    otherTenantToken: process.env.MERAKI_TEST_OTHER_TENANT_TOKEN,
    tenantId: process.env.MERAKI_TEST_TENANT_ID,
    subjectId: process.env.MERAKI_TEST_SUBJECT_ID,
    otherSubjectId: process.env.MERAKI_TEST_OTHER_SUBJECT_ID,
    otherTenantId: process.env.MERAKI_TEST_OTHER_TENANT_ID
  };
  return Object.values(values).every((value) => typeof value === "string" && value.length > 0)
    ? (values as LiveConfig)
    : undefined;
};

type RecordActivityCommand = Extract<MerakiCommand, Readonly<{ name: "record_activity" }>>;

const activityRequest = (
  config: LiveConfig,
  index: number,
  input: Readonly<{
    idempotencyKey?: string;
    requestId?: string;
    content?: string;
    expectedRevision?: number;
  }> = {}
) => ({
  requestId: input.requestId ?? `live-request-${index}`,
  idempotencyKey: input.idempotencyKey ?? `live-activity-${index}`,
  ...(input.expectedRevision === undefined ? {} : { expectedRevision: input.expectedRevision }),
  command: {
    name: "record_activity",
    input: {
      tenantId: config.tenantId,
      subjectId: config.subjectId,
      actorId: config.subjectId,
      runId: `live-run-${index}`,
      taskType: "writing",
      activityType: "edit" as const,
      content: input.content ?? `Prefer direct sentence ${index}`,
      scope: { level: "project" as const, ref: "merakicore" },
      mode: "direct",
      payload: { before: `Long ${index}`, after: `Short ${index}` }
    }
  } satisfies RecordActivityCommand
});

const integerFrom = (value: unknown): number => {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/u.test(value)) return Number(value);
  throw new Error("LIVE_INTEGER_INVALID");
};

const countFrom = (rows: readonly SqlRow[]): number => integerFrom(rows[0]?.count);

const config = liveConfig();

if (config === undefined) {
  describe.skip("live Supabase transactional storage", () => {
    it("requires explicit live-test environment", () => undefined);
  });
} else {
  describe("live Supabase transactional storage", () => {
    it("proves role isolation, real concurrency, idempotency, rollback, revision checks, and token denial", async () => {
      const client = createPostgresClient(config.databaseUrl, {
        maxConnections: 20,
        idleTimeoutSeconds: 5,
        connectTimeoutSeconds: 15
      });
      const adminClient = createPostgresClient(config.adminDatabaseUrl, {
        maxConnections: 2,
        idleTimeoutSeconds: 5,
        connectTimeoutSeconds: 15
      });
      try {
        const role = await client.query<{ current_user: unknown; session_user: unknown } & SqlRow>(
          "select current_user, session_user"
        );
        expect(role[0]).toEqual({
          current_user: "meraki_gate3",
          session_user: "meraki_gate3"
        });
        const privileges = await client.query<
          {
            audit_update: unknown;
            audit_delete: unknown;
            audit_truncate: unknown;
            snapshot_delete: unknown;
            token_update: unknown;
          } & SqlRow
        >(
          `select
             has_table_privilege(current_user, 'meraki_private.audit_events', 'UPDATE') as audit_update,
             has_table_privilege(current_user, 'meraki_private.audit_events', 'DELETE') as audit_delete,
             has_table_privilege(current_user, 'meraki_private.audit_events', 'TRUNCATE') as audit_truncate,
             has_table_privilege(current_user, 'meraki_private.runtime_snapshots', 'DELETE') as snapshot_delete,
             has_table_privilege(current_user, 'meraki_private.access_tokens', 'UPDATE') as token_update`
        );
        expect(privileges[0]).toEqual({
          audit_update: false,
          audit_delete: false,
          audit_truncate: false,
          snapshot_delete: false,
          token_update: false
        });

        const authenticator = new PostgresAccessTokenAuthenticator(client, new TextEncoder().encode(config.pepper));
        await expect(authenticator.authenticate(`Bearer ${config.revokedToken}`)).rejects.toMatchObject({
          code: "revoked_token"
        });
        await expect(authenticator.authenticate(`Bearer ${config.expiredToken}`)).rejects.toMatchObject({
          code: "expired_token"
        });

        const authority = await authenticator.authenticate(`Bearer ${config.token}`);
        const application = new MerakiApplicationService(new PostgresRuntimeUnitOfWork(client));
        const revalidationAuthority = await authenticator.authenticate(`Bearer ${config.revalidateToken}`);
        await adminClient.query(
          `update meraki_private.access_tokens
           set revoked_at = now()
           where id = $1`,
          [revalidationAuthority.credentialId]
        );
        await expect(application.mutate(revalidationAuthority, activityRequest(config, -1))).rejects.toMatchObject({
          code: "revoked_token"
        });

        const receipts = await Promise.all(
          Array.from({ length: 20 }, (_, index) => application.mutate(authority, activityRequest(config, index)))
        );
        expect(receipts.map(({ revision }) => revision).sort((left, right) => left - right)).toEqual(
          Array.from({ length: 20 }, (_, index) => index + 1)
        );

        const repeated = activityRequest(config, 100, {
          idempotencyKey: "live-identical-key",
          requestId: "live-identical-request"
        });
        const replays = await Promise.all(Array.from({ length: 20 }, () => application.mutate(authority, repeated)));
        expect(replays.filter(({ replayed }) => !replayed)).toHaveLength(1);
        expect(replays.filter(({ replayed }) => replayed)).toHaveLength(19);
        expect(new Set(replays.map(({ revision }) => revision))).toEqual(new Set([21]));

        await expect(
          application.mutate(
            authority,
            activityRequest(config, 101, {
              idempotencyKey: "live-identical-key",
              content: "A conflicting request"
            })
          )
        ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        await expect(
          application.mutate(
            authority,
            activityRequest(config, 102, {
              expectedRevision: 0
            })
          )
        ).rejects.toMatchObject({ code: "REVISION_CONFLICT", retryable: true });

        await expect(
          application.mutate(
            authority,
            activityRequest(config, 103, {
              idempotencyKey: "live-rollback",
              requestId: " invalid-live-request "
            })
          )
        ).rejects.toThrow();

        const sourceEventId = receipts[0]?.value.event.id;
        if (sourceEventId === undefined) throw new Error("LIVE_SOURCE_EVENT_REQUIRED");
        const candidateReceipt = await application.mutate(authority, {
          requestId: "live-candidate-request",
          idempotencyKey: "live-candidate",
          command: {
            name: "extract_candidate",
            input: {
              eventId: sourceEventId,
              claim: "For MerakiCore writing, prefer direct sentences.",
              facet: "communication",
              temporalHorizon: "ongoing"
            }
          }
        });
        expect(candidateReceipt).toMatchObject({ replayed: false, revision: 22 });
        expect(candidateReceipt.value.lifecycle).toBe("candidate");
        const approvalReceipt = await application.mutate(authority, {
          requestId: "live-approval-request",
          idempotencyKey: "live-approval",
          command: {
            name: "command_atom",
            input: {
              atomId: candidateReceipt.value.id,
              expectedVersion: candidateReceipt.value.version,
              requiredLifecycles: ["candidate"],
              reason: "Explicit Gate 3 live proof approval",
              operation: "confirm"
            }
          }
        });
        expect(approvalReceipt).toMatchObject({ replayed: false, revision: 23 });
        const primaryAtoms = await application.query(authority, { name: "list_atoms" });
        expect(primaryAtoms).toHaveLength(1);

        const beforeIsolation = await client.query<{ revision: unknown; snapshot_hash: unknown } & SqlRow>(
          `select revision, snapshot_hash
           from meraki_private.runtime_snapshots
           where tenant_id = $1 and subject_id = $2`,
          [config.tenantId, config.subjectId]
        );
        const otherAuthority = await authenticator.authenticate(`Bearer ${config.otherToken}`);
        expect(otherAuthority).toMatchObject({
          tenantId: config.tenantId,
          subjectId: config.otherSubjectId
        });
        await expect(application.mutate(otherAuthority, activityRequest(config, 104))).rejects.toMatchObject({
          code: "identity_mismatch"
        });
        expect(await application.query(otherAuthority, { name: "list_atoms" })).toEqual([]);

        const otherTenantAuthority = await authenticator.authenticate(`Bearer ${config.otherTenantToken}`);
        expect(otherTenantAuthority).toMatchObject({
          tenantId: config.otherTenantId,
          subjectId: config.subjectId
        });
        await expect(application.mutate(otherTenantAuthority, activityRequest(config, 105))).rejects.toMatchObject({
          code: "identity_mismatch"
        });
        expect(await application.query(otherTenantAuthority, { name: "list_atoms" })).toEqual([]);
        const afterIsolation = await client.query<{ revision: unknown; snapshot_hash: unknown } & SqlRow>(
          `select revision, snapshot_hash
           from meraki_private.runtime_snapshots
           where tenant_id = $1 and subject_id = $2`,
          [config.tenantId, config.subjectId]
        );
        expect(afterIsolation).toEqual(beforeIsolation);

        const snapshotRows = await client.query<
          { revision: unknown; snapshot: unknown; snapshot_hash: unknown } & SqlRow
        >(
          `select revision, snapshot, snapshot_hash
             from meraki_private.runtime_snapshots
             where tenant_id = $1 and subject_id = $2`,
          [config.tenantId, config.subjectId]
        );
        const snapshotRow = snapshotRows[0];
        expect(integerFrom(snapshotRow?.revision)).toBe(23);
        const restored = ConnectedAgentRuntime.fromSnapshot(snapshotRow?.snapshot as ConnectedRuntimeSnapshot);
        expect(restored.snapshot().engine.evidenceLedger.events).toHaveLength(21);
        expect(snapshotRow?.snapshot_hash).toBe(sha256Digest(canonicalJson(restored.snapshot())));

        expect(
          countFrom(
            await client.query(
              `select count(*) as count
                 from meraki_private.idempotency_records
                 where tenant_id = $1 and subject_id = $2`,
              [config.tenantId, config.subjectId]
            )
          )
        ).toBe(23);
        expect(
          countFrom(
            await client.query(
              `select count(*) as count
                 from meraki_private.audit_events
                 where tenant_id = $1 and subject_id = $2`,
              [config.tenantId, config.subjectId]
            )
          )
        ).toBe(42);

        await expect(
          client.query(
            `update meraki_private.audit_events
               set outcome = 'tampered'
               where tenant_id = $1 and subject_id = $2`,
            [config.tenantId, config.subjectId]
          )
        ).rejects.toThrow();
        await expect(
          client.query(
            `delete from meraki_private.audit_events
               where tenant_id = $1 and subject_id = $2`,
            [config.tenantId, config.subjectId]
          )
        ).rejects.toThrow();
        await expect(client.query("truncate table meraki_private.audit_events")).rejects.toThrow();
        await expect(
          client.query("alter table meraki_private.runtime_snapshots disable trigger all")
        ).rejects.toThrow();
        await expect(
          client.query(
            `delete from meraki_private.runtime_snapshots
               where tenant_id = $1 and subject_id = $2`,
            [config.tenantId, config.subjectId]
          )
        ).rejects.toThrow();
        await expect(
          client.query(
            `update meraki_private.access_tokens
               set revoked_at = now()
               where id = $1`,
            [authority.credentialId]
          )
        ).rejects.toThrow();
      } finally {
        await adminClient.close();
        await client.close();
      }
    }, 120_000);
  });
}
