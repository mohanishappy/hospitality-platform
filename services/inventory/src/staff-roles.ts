export const STAFF_INTENDED_ROLES = [
  "manager",
  "front_desk",
  "read_only",
] as const;

export type StaffIntendedRole = (typeof STAFF_INTENDED_ROLES)[number];

export function normalizeIntendedRole(value: unknown): StaffIntendedRole | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (raw === "manager" || raw === "front_desk" || raw === "read_only") {
    return raw;
  }
  return null;
}

export type StaffClaimsCandidate = {
  enterprise_id: string;
  intended_role: string;
  status: string;
  active: boolean;
  updated_at: string;
};

/** Pick JWT claims for Post Login Action (one active staff row per email). */
export function pickStaffClaimsForEmail(
  rows: StaffClaimsCandidate[]
): { enterprise_id: string; roles: string[] } | null {
  const active = rows.filter(
    (r) =>
      r.status === "active" &&
      r.active !== false &&
      normalizeIntendedRole(r.intended_role)
  );
  if (active.length === 0) return null;
  active.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const row = active[0]!;
  const role = normalizeIntendedRole(row.intended_role);
  if (!role) return null;
  return { enterprise_id: row.enterprise_id, roles: [role] };
}
