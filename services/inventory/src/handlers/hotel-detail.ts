import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { HOTEL_DETAIL_SELECT } from "../selects";
import { supaClient } from "../supabase";

export async function getHotel(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const id = c.req.param("id")?.trim();
  if (!id) {
    return problem(400, "Bad Request", "Hotel id required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("inventory")
    .from("hotel")
    .select(HOTEL_DETAIL_SELECT)
    .eq("id", id)
    .eq("chain_id", chainId)
    .maybeSingle();
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  if (!data) {
    return problem(404, "Not Found", "Hotel not found for this chain");
  }
  return c.json({ hotel: data });
}
