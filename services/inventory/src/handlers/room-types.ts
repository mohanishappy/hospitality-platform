import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { ROOM_TYPE_LIST_SELECT } from "../selects";
import { supaClient } from "../supabase";

export async function listRoomTypes(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const hotelId = c.req.param("hotelId")?.trim();
  if (!hotelId) {
    return problem(400, "Bad Request", "hotel id required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data: hotel, error: hotelErr } = await supa
    .schema("inventory")
    .from("hotel")
    .select("id")
    .eq("id", hotelId)
    .eq("chain_id", chainId)
    .maybeSingle();
  if (hotelErr) {
    return problem(500, "Database error", formatPostgrestError(hotelErr));
  }
  if (!hotel) {
    return problem(404, "Not Found", "Hotel not found for this chain");
  }
  const { data, error } = await supa
    .schema("inventory")
    .from("room_type")
    .select(ROOM_TYPE_LIST_SELECT)
    .eq("hotel_id", hotelId)
    .eq("chain_id", chainId)
    .order("code");
  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ hotel_id: hotelId, room_types: data ?? [] });
}
