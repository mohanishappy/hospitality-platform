import type { Context } from "hono";
import { isUuidLike } from "../uuid";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { HOTEL_LIST_SELECT, HOTEL_LIST_WITH_CHAIN_SELECT } from "../selects";
import { supaClient } from "../supabase";

function parseChainIdsHeader(c: Context<{ Bindings: Env }>): string[] | null {
  const multiRaw = c.req.header("x-chain-ids")?.trim();
  if (multiRaw) {
    const ids = multiRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => isUuidLike(s));
    if (ids.length > 0) return ids;
  }
  const single = c.req.header("x-chain-id")?.trim();
  if (single && isUuidLike(single)) return [single];
  return null;
}

type HotelRow = {
  id: string;
  name: string;
  code: string;
  chain_id: string;
  chain?: { name?: string; code?: string } | null;
};

function mapHotelRow(row: HotelRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    chain_id: row.chain_id,
    chain_name: row.chain?.name ?? undefined,
    chain_code: row.chain?.code ?? undefined,
  };
}

export async function listHotels(c: Context<{ Bindings: Env }>) {
  const chainIds = parseChainIdsHeader(c);
  if (!chainIds?.length) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const multiChain = chainIds.length > 1;
  let q = supa
    .schema("inventory")
    .from("hotel")
    .select(multiChain ? HOTEL_LIST_WITH_CHAIN_SELECT : HOTEL_LIST_SELECT);
  q = chainIds.length === 1 ? q.eq("chain_id", chainIds[0]) : q.in("chain_id", chainIds);
  const { data, error } = await q.order("name");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  const hotels = multiChain
    ? ((data ?? []) as unknown as HotelRow[]).map(mapHotelRow)
    : (data ?? []);
  return c.json({ hotels });
}
