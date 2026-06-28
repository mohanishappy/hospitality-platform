import type { Context } from "hono";
import { isUuidLike } from "../uuid";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";

export type StaffAccessResponse = {
  access: {
    provisioned: boolean;
    active?: boolean;
    all_chains?: boolean;
    chain_ids?: string[];
  };
};

async function grantsForStaffMember(
  supa: ReturnType<typeof supaClient>,
  staffMemberId: string,
  enterpriseId: string
): Promise<string[]> {
  const { data, error } = await supa
    .schema("inventory")
    .from("staff_chain_grant")
    .select("chain_id, chain!inner(enterprise_id)")
    .eq("staff_member_id", staffMemberId)
    .eq("chain.enterprise_id", enterpriseId);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => String((row as { chain_id: string }).chain_id));
}

async function grantsForIntegrationClient(
  supa: ReturnType<typeof supaClient>,
  integrationClientId: string,
  enterpriseId: string
): Promise<string[]> {
  const { data, error } = await supa
    .schema("inventory")
    .from("integration_chain_grant")
    .select("chain_id, chain!inner(enterprise_id)")
    .eq("integration_client_id", integrationClientId)
    .eq("chain.enterprise_id", enterpriseId);
  if (error) {
    throw error;
  }
  return (data ?? []).map((row) => String((row as { chain_id: string }).chain_id));
}

/** Internal: gateway resolves staff / M2M brand scope from DB. */
export async function getStaffAccess(c: Context<{ Bindings: Env }>) {
  const enterpriseId = c.req.query("enterprise_id")?.trim() ?? "";
  const auth0Sub = c.req.query("auth0_sub")?.trim() ?? "";
  const clientId = c.req.query("client_id")?.trim() ?? "";

  if (!enterpriseId || !isUuidLike(enterpriseId)) {
    return problem(400, "Bad Request", "enterprise_id query param required");
  }
  if (!auth0Sub && !clientId) {
    return problem(
      400,
      "Bad Request",
      "auth0_sub or client_id query param required"
    );
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }

  const supa = supaClient(c.env);

  try {
    if (clientId) {
      const { data: client, error } = await supa
        .schema("inventory")
        .from("integration_client")
        .select("id,all_chains,active")
        .eq("enterprise_id", enterpriseId)
        .eq("auth0_client_id", clientId)
        .maybeSingle();
      if (error) {
        return problem(500, "Database error", formatPostgrestError(error));
      }
      if (!client) {
        return c.json({ access: { provisioned: false } } satisfies StaffAccessResponse);
      }
      const chainIds = client.all_chains
        ? []
        : await grantsForIntegrationClient(supa, client.id, enterpriseId);
      return c.json({
        access: {
          provisioned: true,
          active: client.active,
          all_chains: client.all_chains,
          chain_ids: client.all_chains ? undefined : chainIds,
        },
      } satisfies StaffAccessResponse);
    }

    const { data: member, error } = await supa
      .schema("inventory")
      .from("staff_member")
      .select("id,all_chains,active,status")
      .eq("enterprise_id", enterpriseId)
      .eq("auth0_sub", auth0Sub)
      .eq("status", "active")
      .maybeSingle();
    if (error) {
      return problem(500, "Database error", formatPostgrestError(error));
    }
    if (!member) {
      return c.json({ access: { provisioned: false } } satisfies StaffAccessResponse);
    }
    const chainIds = member.all_chains
      ? []
      : await grantsForStaffMember(supa, member.id, enterpriseId);
    return c.json({
      access: {
        provisioned: true,
        active: member.active,
        all_chains: member.all_chains,
        chain_ids: member.all_chains ? undefined : chainIds,
      },
    } satisfies StaffAccessResponse);
  } catch (err) {
    return problem(
      500,
      "Database error",
      err instanceof Error ? err.message : "Staff access lookup failed"
    );
  }
}

/** Authenticated: chains the caller may access (from gateway x-chain-ids). */
export async function getMyChains(c: Context<{ Bindings: Env }>) {
  const raw = c.req.header("x-chain-ids")?.trim();
  const ids = raw
    ? raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => isUuidLike(s))
    : [];
  const single = c.req.header("x-chain-id")?.trim();
  if (single && isUuidLike(single) && !ids.includes(single)) {
    ids.push(single);
  }
  if (ids.length === 0) {
    return c.json({ chains: [] });
  }

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id,code,name,enterprise_id")
    .in("id", ids)
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ chains: data ?? [] });
}
