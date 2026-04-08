import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { HOTEL_LIST_SELECT } from "../selects";
import { supaClient } from "../supabase";

export async function listHotels(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("hotel")
    .select(HOTEL_LIST_SELECT)
    .eq("chain_id", chainId);
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ hotels: data ?? [] });
}
