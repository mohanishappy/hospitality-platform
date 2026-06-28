import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";

export async function listEnterprises(c: Context<{ Bindings: Env }>) {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("enterprise")
    .select("id,code,name")
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ enterprises: data ?? [] });
}

export async function getEnterpriseByCode(c: Context<{ Bindings: Env }>) {
  const raw = c.req.param("code")?.trim();
  if (!raw) {
    return problem(400, "Bad Request", "Enterprise code required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("enterprise")
    .select("id,code,name")
    .eq("code", raw.toUpperCase())
    .maybeSingle();
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  if (!data) {
    return problem(404, "Not Found", "Enterprise not found");
  }
  return c.json({ enterprise: data });
}

export async function listEnterpriseChains(c: Context<{ Bindings: Env }>) {
  const raw = c.req.param("code")?.trim();
  if (!raw) {
    return problem(400, "Bad Request", "Enterprise code required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data: enterprise, error: entErr } = await supa
    .schema("inventory")
    .from("enterprise")
    .select("id")
    .eq("code", raw.toUpperCase())
    .maybeSingle();
  if (entErr) {
    return problem(500, "Database error", formatPostgrestError(entErr));
  }
  if (!enterprise) {
    return problem(404, "Not Found", "Enterprise not found");
  }
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id,code,name,enterprise_id,default_currency")
    .eq("enterprise_id", enterprise.id)
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ chains: data ?? [] });
}

export async function listEnterpriseChainsById(c: Context<{ Bindings: Env }>) {
  const raw = c.req.param("enterpriseId")?.trim();
  if (!raw) {
    return problem(400, "Bad Request", "Enterprise id required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data: enterprise, error: entErr } = await supa
    .schema("inventory")
    .from("enterprise")
    .select("id")
    .eq("id", raw)
    .maybeSingle();
  if (entErr) {
    return problem(500, "Database error", formatPostgrestError(entErr));
  }
  if (!enterprise) {
    return problem(404, "Not Found", "Enterprise not found");
  }
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id,code,name,enterprise_id,default_currency")
    .eq("enterprise_id", enterprise.id)
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ chains: data ?? [] });
}
