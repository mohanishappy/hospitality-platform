import type { Context } from "hono";
import type { Env } from "../types";
import { problem } from "../problem";
import { RESERVATION_LIST_SELECT } from "../selects";
import { supaClient } from "../supabase";
import { parseListQuery } from "../validation";

export async function listReservations(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const { limit, offset } = parseListQuery(c);
  const fetchCount = limit + 1;
  const supa = supaClient(c.env);
  const { data, error } = await supa
    .schema("reservations")
    .from("reservation_stub")
    .select(RESERVATION_LIST_SELECT)
    .eq("chain_id", chainId)
    .order("created_at", { ascending: false })
    .range(offset, offset + fetchCount - 1);
  if (error) {
    return problem(500, "Database error", error.message);
  }
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const reservations = hasMore ? rows.slice(0, limit) : rows;
  return c.json({
    reservations,
    limit,
    offset,
    has_more: hasMore,
  });
}
