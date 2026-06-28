import type { Context } from "hono";
import { uuidLike } from "../admin-auth";
import {
  adminContext,
  assertManagerChainAccess,
  loadBlockInEnterprise,
  loadRoomTypeInEnterprise,
  parseOptionalDate,
  parseOptionalInt,
} from "../admin-catalog";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import type { Env } from "../types";

const BLOCK_SELECT =
  "id,chain_id,hotel_id,room_type_id,units_reduced,start_date,end_date,label";

/** GET /admin/room-types/:roomTypeId/blocks */
export async function listAdminBlocks(c: Context<{ Bindings: Env }>) {
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
    .from("inventory_block")
    .select(BLOCK_SELECT)
    .eq("room_type_id", roomTypeId)
    .order("start_date");

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ room_type_id: roomTypeId, blocks: data ?? [] });
}

/** POST /admin/room-types/:roomTypeId/blocks */
export async function createAdminBlock(c: Context<{ Bindings: Env }>) {
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

  const startDate = parseOptionalDate(body.start_date ?? body.startDate);
  const endDate = parseOptionalDate(body.end_date ?? body.endDate);
  const units = parseOptionalInt(body.units_reduced, { min: 1 });
  if (!startDate) {
    return problem(400, "Bad Request", "start_date (YYYY-MM-DD) required");
  }
  if (!endDate) {
    return problem(400, "Bad Request", "end_date (YYYY-MM-DD) required");
  }
  if (units === null || units === undefined) {
    return problem(400, "Bad Request", "units_reduced must be a positive integer");
  }
  if (endDate <= startDate) {
    return problem(400, "Bad Request", "end_date must be after start_date");
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : null;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("inventory_block")
    .insert({
      chain_id: loaded.roomType.chain_id,
      hotel_id: loaded.roomType.hotel_id,
      room_type_id: roomTypeId,
      units_reduced: units,
      start_date: startDate,
      end_date: endDate,
      label,
    })
    .select(BLOCK_SELECT)
    .single();

  if (error) {
    if (error.code === "23514") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ block: data }, 201);
}

/** DELETE /admin/blocks/:blockId */
export async function deleteAdminBlock(c: Context<{ Bindings: Env }>) {
  const blockId = c.req.param("blockId")?.trim() ?? "";
  if (!uuidLike.test(blockId)) {
    return problem(400, "Bad Request", "Invalid block id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadBlockInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    blockId
  );
  if (!loaded.ok) return loaded.response;

  const block = loaded.block as { chain_id: string };
  const scopeDenied = assertManagerChainAccess(c, block.chain_id);
  if (scopeDenied) return scopeDenied;

  const { error } = await ctx.supa
    .schema("inventory")
    .from("inventory_block")
    .delete()
    .eq("id", blockId);

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.body(null, 204);
}
