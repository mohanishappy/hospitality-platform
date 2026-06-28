import type { Context } from "hono";
import { problem } from "../problem";
import { formatPostgrestError } from "../postgrest";
import { supaClient } from "../supabase";
import { pickStaffClaimsForEmail } from "../staff-roles";
import type { Env } from "../types";

function validateActionSecret(c: Context<{ Bindings: Env }>): Response | null {
  const expected = c.env.ACTION_CLAIMS_SECRET?.trim();
  if (!expected) {
    return problem(500, "Misconfigured", "ACTION_CLAIMS_SECRET not configured");
  }
  const provided = c.req.header("x-action-secret")?.trim() ?? "";
  if (!provided || provided !== expected) {
    return problem(401, "Unauthorized", "Invalid action secret");
  }
  return null;
}

/** Internal: Auth0 Post Login Action resolves enterprise_id + roles from DB. */
export async function getInternalStaffClaims(c: Context<{ Bindings: Env }>) {
  const denied = validateActionSecret(c);
  if (denied) return denied;

  const email = c.req.query("email")?.trim().toLowerCase() ?? "";
  if (!email || !email.includes("@")) {
    return problem(400, "Bad Request", "email query param required");
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("staff_member")
    .select("enterprise_id,intended_role,status,active,updated_at")
    .eq("email", email)
    .neq("status", "disabled");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  const claims = pickStaffClaimsForEmail(data ?? []);
  if (claims) {
    return c.json(claims);
  }

  const { data: platformRows, error: platformErr } = await supa
    .schema("inventory")
    .from("platform_operator")
    .select("active,updated_at")
    .eq("email", email)
    .maybeSingle();
  if (platformErr) {
    return problem(500, "Database error", formatPostgrestError(platformErr));
  }
  if (platformRows && platformRows.active !== false) {
    return c.json({ roles: ["platform_operator"] });
  }

  return c.json({});
}
