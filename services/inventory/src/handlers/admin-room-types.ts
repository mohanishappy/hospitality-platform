import type { Context } from "hono";
import {
  adminContext,
  assertManagerChainAccess,
  loadHotelInEnterprise,
  loadRoomTypeInEnterprise,
  parseHotelName,
  parseOptionalInt,
} from "../admin-catalog";
import { uuidLike } from "../admin-auth";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import { ROOM_TYPE_LIST_SELECT } from "../selects";
import type { Env } from "../types";

function parseRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!code || code.length > 64) return null;
  return code;
}

function parseCapacity(raw: unknown): number | null {
  const v = parseOptionalInt(raw, { min: 1, max: 20 });
  return v === undefined ? null : v;
}

/** GET /admin/hotels/:hotelId/room-types */
export async function listAdminRoomTypes(c: Context<{ Bindings: Env }>) {
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
    .from("room_type")
    .select(ROOM_TYPE_LIST_SELECT)
    .eq("hotel_id", hotelId)
    .order("code");

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ hotel_id: hotelId, room_types: data ?? [] });
}

/** POST /admin/hotels/:hotelId/room-types */
export async function createAdminRoomType(c: Context<{ Bindings: Env }>) {
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

  const code = parseRoomCode(body.code);
  const name = parseHotelName(body.name);
  const capacity = parseCapacity(body.capacity ?? 2);
  const unitsTotal = parseOptionalInt(body.units_total, { min: 1 });
  const overbooking = parseOptionalInt(body.overbooking_allowance, { min: 0 });
  const baseRate = parseOptionalInt(body.base_rate_cents, { min: 0 });
  const taxBps = parseOptionalInt(body.tax_rate_bps, { min: 0, max: 100000 });
  const feeFixed = parseOptionalInt(body.fee_fixed_cents, { min: 0 });

  if (!code) return problem(400, "Bad Request", "Valid room type code is required");
  if (!name) return problem(400, "Bad Request", "Valid room type name is required");
  if (capacity === null) return problem(400, "Bad Request", "Invalid capacity");
  if (unitsTotal === null) {
    return problem(400, "Bad Request", "Invalid units_total");
  }
  if (overbooking === null) {
    return problem(400, "Bad Request", "Invalid overbooking_allowance");
  }
  if (baseRate === null) {
    return problem(400, "Bad Request", "Invalid base_rate_cents");
  }
  if (taxBps === null) return problem(400, "Bad Request", "Invalid tax_rate_bps");
  if (feeFixed === null) {
    return problem(400, "Bad Request", "Invalid fee_fixed_cents");
  }

  const row = {
    chain_id: loaded.hotel.chain_id,
    hotel_id: hotelId,
    code,
    name,
    capacity,
    units_total: unitsTotal ?? 5,
    overbooking_allowance: overbooking ?? 0,
    base_rate_cents: baseRate ?? null,
    tax_rate_bps: taxBps ?? 0,
    fee_fixed_cents: feeFixed ?? 0,
  };

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("room_type")
    .insert(row)
    .select(ROOM_TYPE_LIST_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(
        409,
        "Conflict",
        "Room type code already exists for this hotel"
      );
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ room_type: data }, 201);
}

/** GET /admin/room-types/:roomTypeId */
export async function getAdminRoomType(c: Context<{ Bindings: Env }>) {
  const roomTypeId = c.req.param("roomTypeId")?.trim() ?? "";
  if (!uuidLike.test(roomTypeId)) {
    return problem(400, "Bad Request", "Invalid room type id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadRoomTypeInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    roomTypeId
  );
  if (!loaded.ok) return loaded.response;

  const scopeDenied = assertManagerChainAccess(c, loaded.roomType.chain_id);
  if (scopeDenied) return scopeDenied;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("room_type")
    .select(ROOM_TYPE_LIST_SELECT)
    .eq("id", roomTypeId)
    .single();

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ room_type: data });
}

/** PATCH /admin/room-types/:roomTypeId */
export async function patchAdminRoomType(c: Context<{ Bindings: Env }>) {
  const roomTypeId = c.req.param("roomTypeId")?.trim() ?? "";
  if (!uuidLike.test(roomTypeId)) {
    return problem(400, "Bad Request", "Invalid room type id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadRoomTypeInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    roomTypeId
  );
  if (!loaded.ok) return loaded.response;

  const scopeDenied = assertManagerChainAccess(c, loaded.roomType.chain_id);
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
    if (!name) return problem(400, "Bad Request", "Invalid room type name");
    patch.name = name;
  }
  if ("code" in body) {
    const code = parseRoomCode(body.code);
    if (!code) return problem(400, "Bad Request", "Invalid room type code");
    patch.code = code;
  }
  if ("capacity" in body) {
    const capacity = parseCapacity(body.capacity);
    if (capacity === null) return problem(400, "Bad Request", "Invalid capacity");
    patch.capacity = capacity;
  }
  if ("units_total" in body) {
    const v = parseOptionalInt(body.units_total, { min: 1 });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid units_total");
    }
    patch.units_total = v;
  }
  if ("overbooking_allowance" in body) {
    const v = parseOptionalInt(body.overbooking_allowance, { min: 0 });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid overbooking_allowance");
    }
    patch.overbooking_allowance = v;
  }
  if ("base_rate_cents" in body) {
    const v = parseOptionalInt(body.base_rate_cents, { min: 0 });
    if (v === null) return problem(400, "Bad Request", "Invalid base_rate_cents");
    patch.base_rate_cents = v;
  }
  if ("tax_rate_bps" in body) {
    const v = parseOptionalInt(body.tax_rate_bps, { min: 0, max: 100000 });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid tax_rate_bps");
    }
    patch.tax_rate_bps = v;
  }
  if ("fee_fixed_cents" in body) {
    const v = parseOptionalInt(body.fee_fixed_cents, { min: 0 });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid fee_fixed_cents");
    }
    patch.fee_fixed_cents = v;
  }

  if (Object.keys(patch).length === 0) {
    return problem(400, "Bad Request", "No supported fields to update");
  }

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("room_type")
    .update(patch)
    .eq("id", roomTypeId)
    .select(ROOM_TYPE_LIST_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(
        409,
        "Conflict",
        "Room type code already exists for this hotel"
      );
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ room_type: data });
}
