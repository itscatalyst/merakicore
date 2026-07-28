import type { TaskContext } from "@meraki/contracts";
import { assertAuthenticatedIdentity, type AuthenticatedContext } from "@meraki/auth";
import { normalizeTaskContext } from "@meraki/core";

const sensitivePermission = (authority: AuthenticatedContext): boolean =>
  authority.scopes.has("read:sensitive") ||
  authority.scopes.has("profile:read:sensitive") ||
  authority.scopes.has("profile:write:sensitive");

export const identityKey = (authority: AuthenticatedContext): string =>
  `${authority.tenantId}\u0000${authority.subjectId}`;

export const assertAuthorityIdentity = (
  authority: AuthenticatedContext,
  identity: { tenantId?: unknown; subjectId?: unknown; actorId?: unknown }
): void => assertAuthenticatedIdentity(authority, identity);

export const authorizedTaskContext = (authority: AuthenticatedContext, context: TaskContext): TaskContext => {
  const normalized = normalizeTaskContext(context);
  assertAuthenticatedIdentity(authority, {
    tenantId: normalized.tenant_id,
    subjectId: normalized.subject_id
  });
  const permissions = normalized.permissions.filter(
    (permission) => permission !== "read:sensitive" || sensitivePermission(authority)
  );
  return {
    ...normalized,
    tenant_id: authority.tenantId,
    subject_id: authority.subjectId,
    permissions
  };
};

export const canReadSensitive = sensitivePermission;
