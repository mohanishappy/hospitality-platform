import type { Context } from "hono";
import type { Env } from "../types";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { supaClient } from "../supabase";
import { parseSoftHoldCreateBody } from "../validation";

export async function createSoftHold(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const hotelId = c.req.param("hotelId")?.trim();
  const roomTypeId = c.req.param("roomTypeId")?.trim();
  if (!hotelId || !roomTypeId) {
    return problem(400, "Bad Request", "hotel id and room type id required");
  }
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }
  const parsed = parseSoftHoldCreateBody(raw);
  if (!parsed.ok) {
    return problem(400, "Bad Request", parsed.detail);
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa.rpc("create_soft_hold", {
    p_chain_id: chainId,
    p_hotel_id: hotelId,
    p_room_type_id: roomTypeId,
    p_check_in: parsed.body.check_in,
    p_check_out: parsed.body.check_out,
    p_ttl_seconds: parsed.body.ttl_seconds,
    p_units_held: parsed.body.units_held,
  });
  if (error) {
    if (error.code === "22023") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ soft_hold: data });
}

export async function releaseSoftHold(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.header("x-chain-id");
  if (!chainId) {
    return problem(401, "Unauthorized", "Missing x-chain-id");
  }
  const holdId = c.req.param("holdId")?.trim();
  if (!holdId) {
    return problem(400, "Bad Request", "hold id required");
  }
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return problem(500, "Misconfigured", "Supabase env missing");
  }
  const supa = supaClient(c.env);
  const { data, error } = await supa.rpc("release_soft_hold", {
    p_chain_id: chainId,
    p_hold_id: holdId,
  });
  if (error) {
    if (error.code === "22023") {
      return problem(404, "Not Found", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }
  return c.json({ result: data });
}
