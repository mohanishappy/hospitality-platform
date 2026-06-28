import type { Context } from "hono";
import { uuidLike } from "../admin-auth";
import {
  adminContext,
  assertManagerChainAccess,
  loadChainInEnterprise,
  loadRatePlanInEnterprise,
  parseCatalogCode,
  parseOptionalDate,
  parseOptionalInt,
  validateHotelInChain,
  validateRoomTypeInChain,
} from "../admin-catalog";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import type { supaClient } from "../supabase";
import type { Env } from "../types";

const RATE_PLAN_SELECT =
  "id,chain_id,hotel_id,room_type_id,code,label,priority,valid_from,valid_to,nightly_rate_cents,created_at";

const LOS_TIER_SELECT =
  "id,rate_plan_id,min_nights,max_nights,nightly_rate_cents";

async function resolvePlanScope(
  supa: ReturnType<typeof supaClient>,
  chainId: string,
  body: Record<string, unknown>
): Promise<
  | { ok: true; hotel_id: string | null; room_type_id: string | null }
  | { ok: false; response: Response }
> {
  const hotelRaw = body.hotel_id ?? body.hotelId;
  const roomRaw = body.room_type_id ?? body.roomTypeId;
  let hotelId: string | null = null;
  let roomTypeId: string | null = null;

  if (hotelRaw != null && String(hotelRaw).trim()) {
    hotelId = String(hotelRaw).trim();
    if (!uuidLike.test(hotelId)) {
      return {
        ok: false,
        response: problem(400, "Bad Request", "Invalid hotel_id"),
      };
    }
    if (!(await validateHotelInChain(supa, chainId, hotelId))) {
      return {
        ok: false,
        response: problem(400, "Bad Request", "hotel_id not in this brand"),
      };
    }
  }

  if (roomRaw != null && String(roomRaw).trim()) {
    roomTypeId = String(roomRaw).trim();
    if (!uuidLike.test(roomTypeId)) {
      return {
        ok: false,
        response: problem(400, "Bad Request", "Invalid room_type_id"),
      };
    }
    const rt = await validateRoomTypeInChain(supa, chainId, roomTypeId, hotelId);
    if (!rt.ok) {
      return {
        ok: false,
        response: problem(400, "Bad Request", "room_type_id not in this brand"),
      };
    }
    hotelId = rt.hotel_id;
  }

  return { ok: true, hotel_id: hotelId, room_type_id: roomTypeId };
}

/** GET /admin/chains/:chainId/rate-plans */
export async function listAdminRatePlans(c: Context<{ Bindings: Env }>) {
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
    .from("rate_plan")
    .select(RATE_PLAN_SELECT)
    .eq("chain_id", chainId)
    .order("code");

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ chain_id: chainId, rate_plans: data ?? [] });
}

/** POST /admin/chains/:chainId/rate-plans */
export async function createAdminRatePlan(c: Context<{ Bindings: Env }>) {
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

  const code = parseCatalogCode(body.code);
  const validFrom = parseOptionalDate(body.valid_from ?? body.validFrom);
  if (!code) return problem(400, "Bad Request", "Valid rate plan code required");
  if (!validFrom) {
    return problem(400, "Bad Request", "valid_from (YYYY-MM-DD) required");
  }

  const validTo = parseOptionalDate(body.valid_to ?? body.validTo);
  if (validTo === null) {
    return problem(400, "Bad Request", "Invalid valid_to");
  }

  const scope = await resolvePlanScope(ctx.supa, chainId, body);
  if (!scope.ok) return scope.response;

  const priority = parseOptionalInt(body.priority, { min: 0 });
  if (priority === null) {
    return problem(400, "Bad Request", "Invalid priority");
  }
  const nightly = parseOptionalInt(body.nightly_rate_cents, { min: 0 });
  if (nightly === null) {
    return problem(400, "Bad Request", "Invalid nightly_rate_cents");
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : null;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("rate_plan")
    .insert({
      chain_id: chainId,
      hotel_id: scope.hotel_id,
      room_type_id: scope.room_type_id,
      code,
      label,
      priority: priority ?? 0,
      valid_from: validFrom,
      valid_to: validTo ?? null,
      nightly_rate_cents: nightly ?? null,
    })
    .select(RATE_PLAN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Rate plan code already exists for brand");
    }
    if (error.code === "23514") {
      return problem(400, "Bad Request", error.message);
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ rate_plan: data }, 201);
}

/** GET /admin/rate-plans/:ratePlanId */
export async function getAdminRatePlan(c: Context<{ Bindings: Env }>) {
  const ratePlanId = c.req.param("ratePlanId")?.trim() ?? "";
  if (!uuidLike.test(ratePlanId)) {
    return problem(400, "Bad Request", "Invalid rate plan id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadRatePlanInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    ratePlanId
  );
  if (!loaded.ok) return loaded.response;

  const plan = loaded.ratePlan as { chain_id: string };
  const scopeDenied = assertManagerChainAccess(c, plan.chain_id);
  if (scopeDenied) return scopeDenied;

  const { data: tiers, error: tierErr } = await ctx.supa
    .schema("inventory")
    .from("rate_plan_los_tier")
    .select(LOS_TIER_SELECT)
    .eq("rate_plan_id", ratePlanId)
    .order("min_nights");

  if (tierErr) {
    return problem(500, "Database error", formatPostgrestError(tierErr));
  }

  return c.json({
    rate_plan: loaded.ratePlan,
    los_tiers: tiers ?? [],
  });
}

/** PATCH /admin/rate-plans/:ratePlanId */
export async function patchAdminRatePlan(c: Context<{ Bindings: Env }>) {
  const ratePlanId = c.req.param("ratePlanId")?.trim() ?? "";
  if (!uuidLike.test(ratePlanId)) {
    return problem(400, "Bad Request", "Invalid rate plan id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadRatePlanInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    ratePlanId
  );
  if (!loaded.ok) return loaded.response;

  const plan = loaded.ratePlan as { chain_id: string };
  const scopeDenied = assertManagerChainAccess(c, plan.chain_id);
  if (scopeDenied) return scopeDenied;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const patch: Record<string, unknown> = {};

  if ("code" in body) {
    const code = parseCatalogCode(body.code);
    if (!code) return problem(400, "Bad Request", "Invalid code");
    patch.code = code;
  }
  if ("label" in body) {
    patch.label =
      body.label === null
        ? null
        : typeof body.label === "string" && body.label.trim()
          ? body.label.trim()
          : null;
  }
  if ("priority" in body) {
    const p = parseOptionalInt(body.priority, { min: 0 });
    if (p === null || p === undefined) {
      return problem(400, "Bad Request", "Invalid priority");
    }
    patch.priority = p;
  }
  if ("valid_from" in body || "validFrom" in body) {
    const d = parseOptionalDate(body.valid_from ?? body.validFrom);
    if (!d) return problem(400, "Bad Request", "Invalid valid_from");
    patch.valid_from = d;
  }
  if ("valid_to" in body || "validTo" in body) {
    const d = parseOptionalDate(body.valid_to ?? body.validTo);
    if (d === null) return problem(400, "Bad Request", "Invalid valid_to");
    patch.valid_to = d;
  }
  if ("nightly_rate_cents" in body) {
    const n = parseOptionalInt(body.nightly_rate_cents, { min: 0 });
    if (n === null) {
      return problem(400, "Bad Request", "Invalid nightly_rate_cents");
    }
    patch.nightly_rate_cents = n;
  }
  if (
    "hotel_id" in body ||
    "hotelId" in body ||
    "room_type_id" in body ||
    "roomTypeId" in body
  ) {
    const scope = await resolvePlanScope(ctx.supa, plan.chain_id, body);
    if (!scope.ok) return scope.response;
    patch.hotel_id = scope.hotel_id;
    patch.room_type_id = scope.room_type_id;
  }

  if (Object.keys(patch).length === 0) {
    return problem(400, "Bad Request", "No supported fields to update");
  }

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("rate_plan")
    .update(patch)
    .eq("id", ratePlanId)
    .select(RATE_PLAN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Rate plan code already exists");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ rate_plan: data });
}

/** PUT /admin/rate-plans/:ratePlanId/los-tiers */
export async function putAdminRatePlanLosTiers(c: Context<{ Bindings: Env }>) {
  const ratePlanId = c.req.param("ratePlanId")?.trim() ?? "";
  if (!uuidLike.test(ratePlanId)) {
    return problem(400, "Bad Request", "Invalid rate plan id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadRatePlanInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    ratePlanId
  );
  if (!loaded.ok) return loaded.response;

  const plan = loaded.ratePlan as { chain_id: string };
  const scopeDenied = assertManagerChainAccess(c, plan.chain_id);
  if (scopeDenied) return scopeDenied;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const raw = body.tiers ?? body.los_tiers;
  if (!Array.isArray(raw)) {
    return problem(400, "Bad Request", "tiers array required");
  }

  const rows: {
    rate_plan_id: string;
    min_nights: number;
    max_nights: number | null;
    nightly_rate_cents: number;
  }[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return problem(400, "Bad Request", "Invalid tier entry");
    }
    const rec = item as Record<string, unknown>;
    const minN = parseOptionalInt(rec.min_nights, { min: 1 });
    const maxN = parseOptionalInt(rec.max_nights, { min: 1 });
    const rate = parseOptionalInt(rec.nightly_rate_cents, { min: 0 });
    if (minN === null || minN === undefined) {
      return problem(400, "Bad Request", "Invalid min_nights in tier");
    }
    if (maxN === null) {
      return problem(400, "Bad Request", "Invalid max_nights in tier");
    }
    if (rate === null || rate === undefined) {
      return problem(400, "Bad Request", "Invalid nightly_rate_cents in tier");
    }
    rows.push({
      rate_plan_id: ratePlanId,
      min_nights: minN,
      max_nights: maxN ?? null,
      nightly_rate_cents: rate,
    });
  }

  const { error: delErr } = await ctx.supa
    .schema("inventory")
    .from("rate_plan_los_tier")
    .delete()
    .eq("rate_plan_id", ratePlanId);
  if (delErr) {
    return problem(500, "Database error", formatPostgrestError(delErr));
  }

  if (rows.length > 0) {
    const { error: insErr } = await ctx.supa
      .schema("inventory")
      .from("rate_plan_los_tier")
      .insert(rows);
    if (insErr) {
      return problem(500, "Database error", formatPostgrestError(insErr));
    }
  }

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("rate_plan_los_tier")
    .select(LOS_TIER_SELECT)
    .eq("rate_plan_id", ratePlanId)
    .order("min_nights");

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ rate_plan_id: ratePlanId, los_tiers: data ?? [] });
}
