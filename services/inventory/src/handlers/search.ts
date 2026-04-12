import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";
import { parseSearchQuery } from "../validation";

export async function searchStays(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const q = parseSearchQuery(c);
  if (!q.ok) {
    return problem(400, "Bad Request", q.detail);
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa.rpc("inventory_search_stays", {
    p_chain_id: chainId,
    p_check_in: q.check_in,
    p_check_out: q.check_out,
    p_hotel_ids: q.hotel_ids,
    p_sort: q.sort,
    p_limit: q.limit,
    p_rate_plan_code: q.rate_plan_code,
    p_promotion_code: q.promotion_code,
  });
  if (error) {
    if (error.code === "22023") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ results: data ?? [] });
}
