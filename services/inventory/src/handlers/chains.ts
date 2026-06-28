import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";

export async function listChains(c: Context<{ Bindings: Env }>) {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id,code,name")
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ chains: data ?? [] });
}

export async function getChainByCode(c: Context<{ Bindings: Env }>) {
  const raw = c.req.param("code")?.trim();
  if (!raw) {
    return problem(400, "Bad Request", "Chain code required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id,code,name")
    .eq("code", raw.toUpperCase())
    .maybeSingle();
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  if (!data) {
    return problem(404, "Not Found", "Chain not found");
  }
  return c.json({ chain: data });
}
