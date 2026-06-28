import type { Context } from "hono";
import {
  requireEnterpriseId,
  requireManager,
  uuidLike,
} from "../admin-auth";
import { generateInviteToken, hashInviteToken, inviteTtlMs } from "../invite-crypto";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";
import { normalizeIntendedRole, STAFF_INTENDED_ROLES } from "../staff-roles";
import type { Env } from "../types";

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

function inviteAcceptPath(token: string): string {
  return `/invite/accept?token=${encodeURIComponent(token)}`;
}

function resolveInviteBaseUrl(c: Context<{ Bindings: Env }>): string | null {
  const fromEnv = c.env.INVITE_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return null;
}

/** POST /admin/staff/invite — pending staff + invite token (dev: returns accept URL). */
export async function createStaffInvite(c: Context<{ Bindings: Env }>) {
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

  const intendedRole =
    normalizeIntendedRole(body.intended_role ?? body.intendedRole) ??
    "front_desk";
  if (!STAFF_INTENDED_ROLES.includes(intendedRole)) {
    return problem(400, "Bad Request", "Invalid intended_role");
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

  const inviterSub = c.req.header("x-auth0-sub")?.trim() ?? "";
  let invitedBy: string | null = null;
  if (inviterSub) {
    const { data: inviter } = await supa
      .schema("inventory")
      .from("staff_member")
      .select("id")
      .eq("enterprise_id", ent.enterpriseId)
      .eq("auth0_sub", inviterSub)
      .eq("status", "active")
      .maybeSingle();
    if (inviter?.id) invitedBy = String(inviter.id);
  }

  const { data: inserted, error: insErr } = await supa
    .schema("inventory")
    .from("staff_member")
    .insert({
      enterprise_id: ent.enterpriseId,
      auth0_sub: null,
      email,
      display_name: displayName,
      all_chains: allChains,
      active: false,
      status: "pending",
      intended_role: intendedRole,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insErr) {
    if (insErr.code === "23505") {
      return problem(
        409,
        "Conflict",
        "Staff member or pending invite already exists for this email"
      );
    }
    return problem(500, "Database error", formatPostgrestError(insErr));
  }

  const staffId = String((inserted as { id: string }).id);

  if (!allChains) {
    const { error: grantErr } = await supa
      .schema("inventory")
      .from("staff_chain_grant")
      .insert(chainIds.map((chain_id) => ({ staff_member_id: staffId, chain_id })));
    if (grantErr) {
      await supa.schema("inventory").from("staff_member").delete().eq("id", staffId);
      return problem(500, "Database error", formatPostgrestError(grantErr));
    }
  }

  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);
  const expiresAt = new Date(Date.now() + inviteTtlMs()).toISOString();

  const { error: inviteErr } = await supa.schema("inventory").from("staff_invite").insert({
    staff_member_id: staffId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: invitedBy,
  });

  if (inviteErr) {
    await supa.schema("inventory").from("staff_member").delete().eq("id", staffId);
    return problem(500, "Database error", formatPostgrestError(inviteErr));
  }

  const acceptPath = inviteAcceptPath(token);
  const baseUrl = resolveInviteBaseUrl(c);
  const acceptUrl = baseUrl ? `${baseUrl}${acceptPath}` : acceptPath;

  return c.json(
    {
      invite: {
        staff_member_id: staffId,
        email,
        intended_role: intendedRole,
        status: "pending",
        expires_at: expiresAt,
        accept_url: acceptUrl,
      },
    },
    201
  );
}

/** POST /invites/accept — link auth0_sub after invite (Bearer required). */
export async function acceptStaffInvite(c: Context<{ Bindings: Env }>) {
  const auth0Sub = c.req.header("x-auth0-sub")?.trim() ?? "";
  const email = c.req.header("x-user-email")?.trim().toLowerCase() ?? "";
  if (!auth0Sub) {
    return problem(401, "Unauthorized", "Missing authenticated subject");
  }
  if (!email || !email.includes("@")) {
    return problem(401, "Unauthorized", "Missing login email on token");
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const token = String(body.token ?? "").trim();
  if (!token) {
    return problem(400, "Bad Request", "token is required");
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const tokenHash = await hashInviteToken(token);

  const { data: invite, error: inviteErr } = await supa
    .schema("inventory")
    .from("staff_invite")
    .select("id,staff_member_id,expires_at,accepted_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (inviteErr) {
    return problem(500, "Database error", formatPostgrestError(inviteErr));
  }
  if (!invite) {
    return problem(404, "Not Found", "Invite not found or invalid token");
  }
  if (invite.accepted_at) {
    return problem(409, "Conflict", "Invite already accepted");
  }
  if (new Date(String(invite.expires_at)).getTime() < Date.now()) {
    return problem(410, "Gone", "Invite expired");
  }

  const { data: staff, error: staffErr } = await supa
    .schema("inventory")
    .from("staff_member")
    .select("id,email,enterprise_id,status")
    .eq("id", invite.staff_member_id)
    .maybeSingle();
  if (staffErr) {
    return problem(500, "Database error", formatPostgrestError(staffErr));
  }
  if (!staff || staff.status !== "pending") {
    return problem(400, "Bad Request", "Staff invite is no longer pending");
  }
  if (String(staff.email).toLowerCase() !== email) {
    return problem(
      403,
      "Forbidden",
      "Invite email does not match your login email"
    );
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supa
    .schema("inventory")
    .from("staff_member")
    .update({
      auth0_sub: auth0Sub,
      status: "active",
      active: true,
      updated_at: now,
    })
    .eq("id", staff.id);
  if (updErr) {
    if (updErr.code === "23505") {
      return problem(
        409,
        "Conflict",
        "This account is already linked to another staff profile"
      );
    }
    return problem(500, "Database error", formatPostgrestError(updErr));
  }

  const { error: acceptErr } = await supa
    .schema("inventory")
    .from("staff_invite")
    .update({ accepted_at: now })
    .eq("id", invite.id);
  if (acceptErr) {
    return problem(500, "Database error", formatPostgrestError(acceptErr));
  }

  return c.json({
    accepted: true,
    staff_member_id: staff.id,
    enterprise_id: staff.enterprise_id,
    message: "Invite accepted. Sign out and sign in again to refresh your access token.",
  });
}
