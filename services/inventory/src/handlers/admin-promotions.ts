import type { Context } from "hono";
import { uuidLike } from "../admin-auth";
import {
  adminContext,
  assertManagerChainAccess,
  loadChainInEnterprise,
  loadPromotionInEnterprise,
  parseCatalogCode,
  parseOptionalDate,
  parseOptionalInt,
} from "../admin-catalog";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import type { Env } from "../types";

const PROMOTION_SELECT =
  "id,chain_id,code,label,active,discount_percent_bps,discount_amount_cents,min_los,valid_from,valid_to,blackout_dates,created_at";

function parseBlackoutDates(raw: unknown): string[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.trim())) {
      return null;
    }
    out.push(item.trim());
  }
  return out;
}

/** GET /admin/chains/:chainId/promotions */
export async function listAdminPromotions(c: Context<{ Bindings: Env }>) {
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
    .from("promotion")
    .select(PROMOTION_SELECT)
    .eq("chain_id", chainId)
    .order("code");

  if (error) {
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ chain_id: chainId, promotions: data ?? [] });
}

/** POST /admin/chains/:chainId/promotions */
export async function createAdminPromotion(c: Context<{ Bindings: Env }>) {
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
  if (!code) return problem(400, "Bad Request", "Valid promotion code required");
  if (!validFrom) {
    return problem(400, "Bad Request", "valid_from (YYYY-MM-DD) required");
  }

  const validTo = parseOptionalDate(body.valid_to ?? body.validTo);
  if (validTo === null) {
    return problem(400, "Bad Request", "Invalid valid_to");
  }

  const pct = parseOptionalInt(body.discount_percent_bps, {
    min: 0,
    max: 10000,
  });
  const amt = parseOptionalInt(body.discount_amount_cents, { min: 0 });
  const minLos = parseOptionalInt(body.min_los, { min: 1 });
  if (pct === null) {
    return problem(400, "Bad Request", "Invalid discount_percent_bps");
  }
  if (amt === null) {
    return problem(400, "Bad Request", "Invalid discount_amount_cents");
  }
  if (minLos === null) {
    return problem(400, "Bad Request", "Invalid min_los");
  }

  const blackouts = parseBlackoutDates(body.blackout_dates);
  if (blackouts === null) {
    return problem(400, "Bad Request", "Invalid blackout_dates");
  }

  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim()
      : null;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("promotion")
    .insert({
      chain_id: chainId,
      code,
      label,
      active: body.active !== false,
      discount_percent_bps: pct ?? 0,
      discount_amount_cents: amt ?? 0,
      min_los: minLos ?? 1,
      valid_from: validFrom,
      valid_to: validTo ?? null,
      blackout_dates: blackouts ?? [],
    })
    .select(PROMOTION_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Promotion code already exists for brand");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ promotion: data }, 201);
}

/** PATCH /admin/promotions/:promotionId */
export async function patchAdminPromotion(c: Context<{ Bindings: Env }>) {
  const promotionId = c.req.param("promotionId")?.trim() ?? "";
  if (!uuidLike.test(promotionId)) {
    return problem(400, "Bad Request", "Invalid promotion id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadPromotionInEnterprise(
    ctx.supa,
    ctx.enterpriseId,
    promotionId
  );
  if (!loaded.ok) return loaded.response;

  const promo = loaded.promotion as { chain_id: string };
  const scopeDenied = assertManagerChainAccess(c, promo.chain_id);
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
  if ("active" in body) patch.active = Boolean(body.active);
  if ("discount_percent_bps" in body) {
    const v = parseOptionalInt(body.discount_percent_bps, {
      min: 0,
      max: 10000,
    });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid discount_percent_bps");
    }
    patch.discount_percent_bps = v;
  }
  if ("discount_amount_cents" in body) {
    const v = parseOptionalInt(body.discount_amount_cents, { min: 0 });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid discount_amount_cents");
    }
    patch.discount_amount_cents = v;
  }
  if ("min_los" in body) {
    const v = parseOptionalInt(body.min_los, { min: 1 });
    if (v === null || v === undefined) {
      return problem(400, "Bad Request", "Invalid min_los");
    }
    patch.min_los = v;
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
  if ("blackout_dates" in body) {
    const b = parseBlackoutDates(body.blackout_dates);
    if (b === null) {
      return problem(400, "Bad Request", "Invalid blackout_dates");
    }
    patch.blackout_dates = b;
  }

  if (Object.keys(patch).length === 0) {
    return problem(400, "Bad Request", "No supported fields to update");
  }

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("promotion")
    .update(patch)
    .eq("id", promotionId)
    .select(PROMOTION_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Promotion code already exists");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ promotion: data });
}
