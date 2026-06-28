import type { Context } from "hono";
import {
  adminContext,
  assertManagerChainAccess,
  loadChainInEnterprise,
  loadHotelInEnterprise,
  parseHotelCode,
  parseHotelName,
  parseOptionalInt,
  parseOptionalStringArray,
  parseOptionalTime,
} from "../admin-catalog";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { ADMIN_HOTEL_SELECT } from "../selects";
import type { Env } from "../types";
import { uuidLike } from "../admin-auth";

/** GET /admin/chains/:chainId/hotels */
export async function listAdminHotels(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.param("chainId")?.trim() ?? "";
  if (!uuidLike.test(chainId)) {
    return problem(400, "Bad Request", "Invalid chain id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const scopeDenied = assertManagerChainAccess(c, chainId);
  if (scopeDenied) return scopeDenied;

  const chain = await loadChainInEnterprise(ctx.supa, ctx.enterpriseId, chainId);
  if (!chain.ok) return chain.response;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("hotel")
    .select(ADMIN_HOTEL_SELECT)
    .eq("chain_id", chainId)
    .order("code");

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ chain_id: chainId, hotels: data ?? [] });
}

/** POST /admin/chains/:chainId/hotels */
export async function createAdminHotel(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.param("chainId")?.trim() ?? "";
  if (!uuidLike.test(chainId)) {
    return problem(400, "Bad Request", "Invalid chain id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const scopeDenied = assertManagerChainAccess(c, chainId);
  if (scopeDenied) return scopeDenied;

  const chain = await loadChainInEnterprise(ctx.supa, ctx.enterpriseId, chainId);
  if (!chain.ok) return chain.response;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const code = parseHotelCode(body.code);
  const name = parseHotelName(body.name);
  if (!code) return problem(400, "Bad Request", "Valid hotel code is required");
  if (!name) return problem(400, "Bad Request", "Valid hotel name is required");

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("hotel")
    .insert({ chain_id: chainId, code, name })
    .select(ADMIN_HOTEL_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Hotel code already exists for this brand");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ hotel: data }, 201);
}

/** GET /admin/hotels/:hotelId */
export async function getAdminHotel(c: Context<{ Bindings: Env }>) {
  const hotelId = c.req.param("hotelId")?.trim() ?? "";
  if (!uuidLike.test(hotelId)) {
    return problem(400, "Bad Request", "Invalid hotel id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadHotelInEnterprise(ctx.supa, ctx.enterpriseId, hotelId);
  if (!loaded.ok) return loaded.response;

  const scopeDenied = assertManagerChainAccess(c, loaded.hotel.chain_id);
  if (scopeDenied) return scopeDenied;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("hotel")
    .select(ADMIN_HOTEL_SELECT)
    .eq("id", hotelId)
    .single();

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ hotel: data });
}

/** PATCH /admin/hotels/:hotelId */
export async function patchAdminHotel(c: Context<{ Bindings: Env }>) {
  const hotelId = c.req.param("hotelId")?.trim() ?? "";
  if (!uuidLike.test(hotelId)) {
    return problem(400, "Bad Request", "Invalid hotel id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadHotelInEnterprise(ctx.supa, ctx.enterpriseId, hotelId);
  if (!loaded.ok) return loaded.response;

  const scopeDenied = assertManagerChainAccess(c, loaded.hotel.chain_id);
  if (scopeDenied) return scopeDenied;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const patch: Record<string, unknown> = {};

  if ("name" in body) {
    const name = parseHotelName(body.name);
    if (!name) return problem(400, "Bad Request", "Invalid hotel name");
    patch.name = name;
  }
  if ("code" in body) {
    const code = parseHotelCode(body.code);
    if (!code) return problem(400, "Bad Request", "Invalid hotel code");
    patch.code = code;
  }
  if ("booking_min_los" in body) {
    const v = parseOptionalInt(body.booking_min_los, { min: 1 });
    if (v === null) return problem(400, "Bad Request", "Invalid booking_min_los");
    if (v !== undefined) patch.booking_min_los = v;
  }
  if ("booking_max_los" in body) {
    const v = parseOptionalInt(body.booking_max_los, { min: 1 });
    if (v === null) return problem(400, "Bad Request", "Invalid booking_max_los");
    patch.booking_max_los = v;
  }
  if ("booking_closed_arrival_dow" in body) {
    const v = parseOptionalStringArray(body.booking_closed_arrival_dow);
    if (v === null) {
      return problem(400, "Bad Request", "Invalid booking_closed_arrival_dow");
    }
    if (v !== undefined) patch.booking_closed_arrival_dow = v;
  }
  if ("booking_closed_departure_dow" in body) {
    const v = parseOptionalStringArray(body.booking_closed_departure_dow);
    if (v === null) {
      return problem(
        400,
        "Bad Request",
        "Invalid booking_closed_departure_dow"
      );
    }
    if (v !== undefined) patch.booking_closed_departure_dow = v;
  }
  if ("booking_timezone" in body) {
    if (typeof body.booking_timezone !== "string" || !body.booking_timezone.trim()) {
      return problem(400, "Bad Request", "Invalid booking_timezone");
    }
    patch.booking_timezone = body.booking_timezone.trim();
  }
  if ("booking_same_day_cutoff_time" in body) {
    const v = parseOptionalTime(body.booking_same_day_cutoff_time);
    if (v === null) {
      return problem(
        400,
        "Bad Request",
        "Invalid booking_same_day_cutoff_time (use HH:MM)"
      );
    }
    patch.booking_same_day_cutoff_time = v;
  }

  if (Object.keys(patch).length === 0) {
    return problem(400, "Bad Request", "No supported fields to update");
  }

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("hotel")
    .update(patch)
    .eq("id", hotelId)
    .select(ADMIN_HOTEL_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Hotel code already exists for this brand");
    }
    if (error.code === "23514") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ hotel: data });
}
