import { getRoles, isStaffUser } from "./claims";
import type { ChainSummary } from "./inventory-client";
import type { StaffAccessRecord } from "./staff-access";

/**
 * Resolve allowed chain UUIDs within an enterprise.
 * Guests: all enterprise chains (reservation worker filters by email).
 * Staff: DB-provisioned grants via inventory.staff_member / integration_client.
 */
export function resolveChainScope(
  enterpriseChains: ChainSummary[],
  roles: string[] | null,
  staffAccess: StaffAccessRecord | null
): string[] {
  const enterpriseIds = enterpriseChains.map((c) => c.id);

  if (!isStaffUser(roles)) {
    return enterpriseIds;
  }

  if (!staffAccess?.provisioned) {
    return [];
  }
  if (staffAccess.active === false) {
    return [];
  }
  if (staffAccess.all_chains) {
    return enterpriseIds;
  }

  const allowed = new Set(staffAccess.chain_ids ?? []);
  return enterpriseChains
    .filter((c) => allowed.has(c.id))
    .map((c) => c.id);
}

export function pickActiveChainId(
  chainIds: string[],
  preferredChainId: string | null,
  resolvedFromCode: ChainSummary | null
): string {
  if (resolvedFromCode && chainIds.includes(resolvedFromCode.id)) {
    return resolvedFromCode.id;
  }
  if (preferredChainId && chainIds.includes(preferredChainId)) {
    return preferredChainId;
  }
  return chainIds[0];
}

/** Human-readable 403 detail for staff scope failures. */
export function staffScopeForbiddenDetail(
  roles: string[] | null,
  staffAccess: StaffAccessRecord | null
): string {
  if (!isStaffUser(roles)) {
    return "No brand access for this account";
  }
  if (!staffAccess?.provisioned) {
    return "Staff account not provisioned — contact your administrator";
  }
  if (staffAccess.active === false) {
    return "Staff account is disabled";
  }
  return "No brand access assigned to this account";
}
