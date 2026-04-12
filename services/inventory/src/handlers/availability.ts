import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";
import { parseAvailabilityQuery } from "../validation";

export async function getRoomTypeAvailability(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const hotelId = c.req.param("hotelId")?.trim();
  const roomTypeId = c.req.param("roomTypeId")?.trim();
  if (!hotelId || !roomTypeId) {
    return problem(400, "Bad Request", "hotel id and room type id required");
  }
  const dates = parseAvailabilityQuery(c);
  if (!dates.ok) {
    return problem(400, "Bad Request", dates.detail);
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa.rpc("room_type_availability_quote", {
    p_chain_id: chainId,
    p_hotel_id: hotelId,
    p_room_type_id: roomTypeId,
    p_check_in: dates.check_in,
    p_check_out: dates.check_out,
  });
  if (error) {
    if (error.code === "22023") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ availability: data });
}
