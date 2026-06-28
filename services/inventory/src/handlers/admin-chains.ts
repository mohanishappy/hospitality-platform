import type { Context } from "hono";
import {
  adminContext,
  assertManagerChainAccess,
  loadChainInEnterprise,
  parseHotelCode,
  parseHotelName,
} from "../admin-catalog";
import { uuidLike } from "../admin-auth";
import { formatPostgrestError } from "../postgrest";
import { problem } from "../problem";
import type { Env } from "../types";

const CHAIN_SELECT = "id,code,name,enterprise_id,default_currency,created_at";

function parseDefaultCurrency(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") return null;
  const c = raw.trim().toUpperCase();
  if (!c || c.length > 8) return null;
  return c;
}

/** POST /admin/chains — create brand in token enterprise. */
export async function createAdminChain(c: Context<{ Bindings: Env }>) {
  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return problem(400, "Bad Request", "Invalid JSON body");
  }

  const code = parseHotelCode(body.code);
  const name = parseHotelName(body.name);
  if (!code) return problem(400, "Bad Request", "Valid brand code is required");
  if (!name) return problem(400, "Bad Request", "Valid brand name is required");

  const currency = parseDefaultCurrency(body.default_currency);
  if (currency === null) {
    return problem(400, "Bad Request", "Invalid default_currency");
  }

  const row: Record<string, unknown> = {
    enterprise_id: ctx.enterpriseId,
    code,
    name,
  };
  if (currency) row.default_currency = currency;

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("chain")
    .insert(row)
    .select(CHAIN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Brand code already exists");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ chain: data }, 201);
}

/** PATCH /admin/chains/:chainId */
export async function patchAdminChain(c: Context<{ Bindings: Env }>) {
  const chainId = c.req.param("chainId")?.trim() ?? "";
  if (!uuidLike.test(chainId)) {
    return problem(400, "Bad Request", "Invalid brand id");
  }

  const ctx = adminContext(c);
  if (!ctx.ok) return ctx.response;

  const loaded = await loadChainInEnterprise(ctx.supa, ctx.enterpriseId, chainId);
  if (!loaded.ok) return loaded.response;

  const scopeDenied = assertManagerChainAccess(c, chainId);
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
    if (!name) return problem(400, "Bad Request", "Invalid brand name");
    patch.name = name;
  }
  if ("code" in body) {
    const code = parseHotelCode(body.code);
    if (!code) return problem(400, "Bad Request", "Invalid brand code");
    patch.code = code;
  }
  if ("default_currency" in body) {
    const currency = parseDefaultCurrency(body.default_currency);
    if (currency === null || currency === undefined) {
      return problem(400, "Bad Request", "Invalid default_currency");
    }
    patch.default_currency = currency;
  }

  if (Object.keys(patch).length === 0) {
    return problem(400, "Bad Request", "No supported fields to update");
  }

  const { data, error } = await ctx.supa
    .schema("inventory")
    .from("chain")
    .update(patch)
    .eq("id", chainId)
    .select(CHAIN_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      return problem(409, "Conflict", "Brand code already exists");
    }
    return problem(500, "Database error", formatPostgrestError(error));
  }

  return c.json({ chain: data });
}
