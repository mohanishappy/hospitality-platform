import type { Context } from "hono";
import {
  requireEnterpriseId,
  requireManager,
  uuidLike,
} from "../admin-auth";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";
import type { Env } from "../types";

type StaffRow = {
  id: string;
  enterprise_id: string;
  auth0_sub: string | null;
  email: string;
  display_name: string | null;
  all_chains: boolean;
  active: boolean;
  status?: string;
  intended_role?: string;
  created_at: string;
  updated_at: string;
};

async function chainIdsForStaff(
  supa: ReturnType<typeof supaClient>,
  staffId: string,
  enterpriseId: string
): Promise<string[]> {
  const { data, error } = await supa
    .schema("inventory")
    .from("staff_chain_grant")
    .select("chain_id, chain!inner(enterprise_id)")
    .eq("staff_member_id", staffId)
    .eq("chain.enterprise_id", enterpriseId);
  if (error) throw error;
  return (data ?? []).map((row) => String((row as { chain_id: string }).chain_id));
}

async function validateChainIdsInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  chainIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (chainIds.length === 0) return { ok: true };
  const unique = [...new Set(chainIds)];
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id")
    .eq("enterprise_id", enterpriseId)
    .in("id", unique);
  if (error) {
    return { ok: false, message: formatPostgrestError(error) };
  }
  if ((data ?? []).length !== unique.length) {
    return {
      ok: false,
      message: "One or more chain_ids are not in this enterprise",
    };
  }
  return { ok: true };
}

async function replaceStaffGrants(
  supa: ReturnType<typeof supaClient>,
  staffId: string,
  enterpriseId: string,
  chainIds: string[]
) {
  const { error: delErr } = await supa
    .schema("inventory")
    .from("staff_chain_grant")
    .delete()
    .eq("staff_member_id", staffId);
  if (delErr) throw delErr;

  if (chainIds.length === 0) return;

  const check = await validateChainIdsInEnterprise(supa, enterpriseId, chainIds);
  if (!check.ok) {
    throw new Error(check.message);
  }

  const { error: insErr } = await supa
    .schema("inventory")
    .from("staff_chain_grant")
    .insert(chainIds.map((chain_id) => ({ staff_member_id: staffId, chain_id })));
  if (insErr) throw insErr;
}

function staffToJson(row: StaffRow, chainIds: string[]) {
  return {
    id: row.id,
    enterprise_id: row.enterprise_id,
    auth0_sub: row.auth0_sub,
    email: row.email,
    display_name: row.display_name,
    all_chains: row.all_chains,
    active: row.active,
    status: row.status ?? (row.auth0_sub ? "active" : "pending"),
    intended_role: row.intended_role ?? "front_desk",
    chain_ids: row.all_chains ? [] : chainIds,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadStaffMember(
  supa: ReturnType<typeof supaClient>,
  staffId: string,
  enterpriseId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("staff_member")
    .select("*")
    .eq("id", staffId)
    .eq("enterprise_id", enterpriseId)
    .maybeSingle();
  if (error) throw error;
  return data as StaffRow | null;
}

/** GET /admin/staff — list provisioned staff for the token enterprise. */
export async function listAdminStaff(c: Context<{ Bindings: Env }>) {
  const denied = requireManager(c);
  if (denied) return denied;

  const ent = requireEnterpriseId(c);
  if (!ent.ok) return ent.response;

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("staff_member")
    .select("*")
    .eq("enterprise_id", ent.enterpriseId)
    .order("email");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  const rows = (data ?? []) as StaffRow[];
  const staff = await Promise.all(
    rows.map(async (row) => {
      const chainIds = row.all_chains
        ? []
        : await chainIdsForStaff(supa, row.id, ent.enterpriseId);
      return staffToJson(row, chainIds);
    })
  );

  return c.json({ staff });
}

/** POST /admin/staff — provision staff (manager only). */
export async function createAdminStaff(c: Context<{ Bindings: Env }>) {
  const denied = requireManager(c);
  if (denied) return denied;

  const ent = requireEnterpriseId(c);
  if (!ent.ok) return ent.response;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) {
    return problem(400, "Bad Request", "Valid email is required");
  }

  const auth0Sub = String(body.auth0_sub ?? body.auth0Sub ?? "")
    .trim();
  if (!auth0Sub) {
    return problem(400, "Bad Request", "auth0_sub is required");
  }

  const allChains = body.all_chains === true;
  const rawChainIds = body.chain_ids ?? body.chainIds;
  let chainIds: string[] = [];
  if (Array.isArray(rawChainIds)) {
    chainIds = rawChainIds
      .map((id) => String(id).trim())
      .filter((id) => uuidLike.test(id));
  }

  if (!allChains && chainIds.length === 0) {
    return problem(
      400,
      "Bad Request",
      "Provide all_chains: true or a non-empty chain_ids array"
    );
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);

  if (!allChains) {
    const check = await validateChainIdsInEnterprise(
      supa,
      ent.enterpriseId,
      chainIds
    );
    if (!check.ok) {
      return problem(400, "Bad Request", check.message);
    }
  }

  const displayName =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim()
      : null;
  const active = body.active !== false;

  const { data: inserted, error } = await supa
    .schema("inventory")
    .from("staff_member")
    .insert({
      enterprise_id: ent.enterpriseId,
      auth0_sub: auth0Sub,
      email,
      display_name: displayName,
      all_chains: allChains,
      active,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Staff member already exists for this enterprise");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  const row = inserted as StaffRow;

  try {
    if (!allChains) {
      await replaceStaffGrants(supa, row.id, ent.enterpriseId, chainIds);
    }
  } catch (err) {
    await supa.schema("inventory").from("staff_member").delete().eq("id", row.id);
    return problem(
      500,
      "Database error",
      err instanceof Error ? err.message : "Failed to assign brand grants"
    );
  }

  const resolvedChainIds = allChains
    ? []
    : await chainIdsForStaff(supa, row.id, ent.enterpriseId);

  return c.json(
    { staff: staffToJson(row, resolvedChainIds) },
    201
  );
}

/** PATCH /admin/staff/:id — update staff member fields. */
export async function patchAdminStaff(c: Context<{ Bindings: Env }>) {
  const denied = requireManager(c);
  if (denied) return denied;

  const ent = requireEnterpriseId(c);
  if (!ent.ok) return ent.response;

  const staffId = c.req.param("id")?.trim() ?? "";
  if (!uuidLike.test(staffId)) {
    return problem(400, "Bad Request", "Invalid staff id");
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const existing = await loadStaffMember(supa, staffId, ent.enterpriseId);
  if (!existing) {
    return problem(404, "Not Found", "Staff member not found");
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email.includes("@")) {
      return problem(400, "Bad Request", "Invalid email");
    }
    patch.email = email;
  }
  if (body.auth0_sub !== undefined || body.auth0Sub !== undefined) {
    const sub = String(body.auth0_sub ?? body.auth0Sub).trim();
    if (!sub) return problem(400, "Bad Request", "auth0_sub cannot be empty");
    patch.auth0_sub = sub;
  }
  if (body.display_name !== undefined) {
    patch.display_name =
      body.display_name === null
        ? null
        : String(body.display_name).trim() || null;
  }
  if (body.active !== undefined) {
    patch.active = Boolean(body.active);
  }
  if (body.all_chains !== undefined) {
    patch.all_chains = Boolean(body.all_chains);
  }

  const { data, error } = await supa
    .schema("inventory")
    .from("staff_member")
    .update(patch)
    .eq("id", staffId)
    .eq("enterprise_id", ent.enterpriseId)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "auth0_sub or email already in use");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  const row = data as StaffRow;

  if (row.all_chains) {
    await supa
      .schema("inventory")
      .from("staff_chain_grant")
      .delete()
      .eq("staff_member_id", staffId);
  }

  const chainIds = row.all_chains
    ? []
    : await chainIdsForStaff(supa, row.id, ent.enterpriseId);

  return c.json({ staff: staffToJson(row, chainIds) });
}

/** PUT /admin/staff/:id/chains — replace brand grants (ignored when all_chains). */
export async function putAdminStaffChains(c: Context<{ Bindings: Env }>) {
  const denied = requireManager(c);
  if (denied) return denied;

  const ent = requireEnterpriseId(c);
  if (!ent.ok) return ent.response;

  const staffId = c.req.param("id")?.trim() ?? "";
  if (!uuidLike.test(staffId)) {
    return problem(400, "Bad Request", "Invalid staff id");
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const raw = body.chain_ids ?? body.chainIds;
  if (!Array.isArray(raw)) {
    return problem(400, "Bad Request", "chain_ids array is required");
  }
  const chainIds = raw
    .map((id) => String(id).trim())
    .filter((id) => uuidLike.test(id));

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const existing = await loadStaffMember(supa, staffId, ent.enterpriseId);
  if (!existing) {
    return problem(404, "Not Found", "Staff member not found");
  }
  if (existing.all_chains) {
    return problem(
      400,
      "Bad Request",
      "Staff member has all_chains; set all_chains false before assigning grants"
    );
  }
  if (chainIds.length === 0) {
    return problem(400, "Bad Request", "chain_ids must not be empty");
  }

  try {
    await replaceStaffGrants(supa, staffId, ent.enterpriseId, chainIds);
  } catch (err) {
    return problem(
      400,
      "Bad Request",
      err instanceof Error ? err.message : "Invalid chain_ids"
    );
  }

  const chainIdsOut = await chainIdsForStaff(supa, staffId, ent.enterpriseId);
  return c.json({ staff: staffToJson(existing, chainIdsOut) });
}
