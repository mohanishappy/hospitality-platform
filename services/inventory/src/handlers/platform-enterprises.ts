import type { Context } from "hono";
import {
  generateInviteToken,
  hashInviteToken,
  inviteTtlMs,
} from "../invite-crypto";
import { requirePlatformOperator } from "../platform-auth";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";
import { isUuidLike } from "../uuid";
import type { Env } from "../types";

const CODE_RE = /^[A-Z0-9_-]{2,32}$/;

function inviteAcceptPath(token: string): string {
  return `/invite/accept?token=${encodeURIComponent(token)}`;
}

function resolveInviteBaseUrl(c: Context<{ Bindings: Env }>): string | null {
  const fromEnv = c.env.INVITE_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return null;
}

/** GET /platform/enterprises — list all enterprises (platform ops). */
export async function listPlatformEnterprises(c: Context<{ Bindings: Env }>) {
  const denied = requirePlatformOperator(c);
  if (denied) return denied;

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("enterprise")
    .select("id,code,name,active,created_at")
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ enterprises: data ?? [] });
}

/** POST /platform/enterprises — create enterprise (no brands). */
export async function createPlatformEnterprise(c: Context<{ Bindings: Env }>) {
  const denied = requirePlatformOperator(c);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const name = String(body.name ?? "").trim();
  const code = String(body.code ?? "")
    .trim()
    .toUpperCase();
  if (!name) {
    return problem(400, "Bad Request", "name is required");
  }
  if (!code || !CODE_RE.test(code)) {
    return problem(
      400,
      "Bad Request",
      "code is required (2–32 chars: A-Z, 0-9, _, -)"
    );
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("enterprise")
    .insert({ name, code, active: true })
    .select("id,code,name,active,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Enterprise code already exists");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ enterprise: data }, 201);
}

/** PATCH /platform/enterprises/:enterpriseId — suspend/reactivate or rename. */
export async function patchPlatformEnterprise(c: Context<{ Bindings: Env }>) {
  const denied = requirePlatformOperator(c);
  if (denied) return denied;

  const enterpriseId = c.req.param("enterpriseId")?.trim() ?? "";
  if (!isUuidLike(enterpriseId)) {
    return problem(400, "Bad Request", "Invalid enterprise id");
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const patch: Record<string, unknown> = {};
  if ("name" in body) {
    const name = String(body.name ?? "").trim();
    if (!name) {
      return problem(400, "Bad Request", "name cannot be empty");
    }
    patch.name = name;
  }
  if ("active" in body) {
    patch.active = Boolean(body.active);
  }
  if (Object.keys(patch).length === 0) {
    return problem(400, "Bad Request", "No supported fields to update");
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("enterprise")
    .update(patch)
    .eq("id", enterpriseId)
    .select("id,code,name,active,created_at")
    .maybeSingle();

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  if (!data) {
    return problem(404, "Not Found", "Enterprise not found");
  }

  return c.json({ enterprise: data });
}

/** POST /platform/enterprises/:enterpriseId/bootstrap-invite — first all-chain manager. */
export async function createPlatformBootstrapInvite(
  c: Context<{ Bindings: Env }>
) {
  const denied = requirePlatformOperator(c);
  if (denied) return denied;

  const enterpriseId = c.req.param("enterpriseId")?.trim() ?? "";
  if (!isUuidLike(enterpriseId)) {
    return problem(400, "Bad Request", "Invalid enterprise id");
  }

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

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const { data: enterprise, error: entErr } = await supa
    .schema("inventory")
    .from("enterprise")
    .select("id,active")
    .eq("id", enterpriseId)
    .maybeSingle();
  if (entErr) {
    return problem(500, "Database error", formatPostgrestError(entErr));
  }
  if (!enterprise) {
    return problem(404, "Not Found", "Enterprise not found");
  }
  if (enterprise.active === false) {
    return problem(403, "Forbidden", "Enterprise is suspended");
  }

  const displayName =
    typeof body.display_name === "string" && body.display_name.trim()
      ? body.display_name.trim()
      : null;

  const { data: inserted, error: insErr } = await supa
    .schema("inventory")
    .from("staff_member")
    .insert({
      enterprise_id: enterpriseId,
      auth0_sub: null,
      email,
      display_name: displayName,
      all_chains: true,
      active: false,
      status: "pending",
      intended_role: "manager",
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
  const token = generateInviteToken();
  const tokenHash = await hashInviteToken(token);
  const expiresAt = new Date(Date.now() + inviteTtlMs()).toISOString();

  const { error: inviteErr } = await supa.schema("inventory").from("staff_invite").insert({
    staff_member_id: staffId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    invited_by: null,
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
        intended_role: "manager",
        all_chains: true,
        status: "pending",
        expires_at: expiresAt,
        accept_url: acceptUrl,
      },
    },
    201
  );
}
