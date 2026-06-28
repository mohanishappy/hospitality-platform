import type { Context } from "hono";
import { requireEnterpriseId, requireManager, uuidLike } from "./admin-auth";
import { formatPostgrestError } from "./postgrest";
import { problem } from "./problem";
import type { Env } from "./types";
import { supaClient } from "./supabase";

export function parseChainIdsHeader(c: Context<{ Bindings: Env }>): string[] {
  const raw = c.req.header("x-chain-ids")?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => uuidLike.test(id));
}

/** When gateway sends a non-empty x-chain-ids list, target chain must be included. */
export function assertManagerChainAccess(
  c: Context<{ Bindings: Env }>,
  chainId: string
): Response | null {
  const denied = requireManager(c);
  if (denied) return denied;

  const allowed = parseChainIdsHeader(c);
  if (allowed.length > 0 && !allowed.includes(chainId)) {
    return problem(
      403,
      "Forbidden",
      "This brand is outside your assigned scope"
    );
  }
  return null;
}

export function adminContext(c: Context<{ Bindings: Env }>) {
  const denied = requireManager(c);
  if (denied) return { ok: false as const, response: denied };

  const ent = requireEnterpriseId(c);
  if (!ent.ok) return { ok: false as const, response: ent.response };

  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false as const,
      response: problem(500, "Misconfigured", "Supabase env missing"),
    };
  }

  return {
    ok: true as const,
    enterpriseId: ent.enterpriseId,
    supa: supaClient(c.env),
  };
}

export async function loadChainInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  chainId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("chain")
    .select("id,enterprise_id,code,name")
    .eq("id", chainId)
    .eq("enterprise_id", enterpriseId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: problem(500, "Database error", formatPostgrestError(error)),
    };
  }
  if (!data) {
    return {
      ok: false as const,
      response: problem(404, "Not Found", "Brand not found for this enterprise"),
    };
  }
  return { ok: true as const, chain: data };
}

export async function loadHotelInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  hotelId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("hotel")
    .select("id,chain_id,name,code,chain:chain_id(enterprise_id)")
    .eq("id", hotelId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: problem(500, "Database error", formatPostgrestError(error)),
    };
  }
  const row = data as {
    id: string;
    chain_id: string;
    name: string;
    code: string;
    chain: { enterprise_id: string } | null;
  } | null;
  if (!row || row.chain?.enterprise_id !== enterpriseId) {
    return {
      ok: false as const,
      response: problem(404, "Not Found", "Hotel not found for this enterprise"),
    };
  }
  return { ok: true as const, hotel: row };
}

export async function loadRoomTypeInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  roomTypeId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("room_type")
    .select("id,hotel_id,chain_id,name,code,chain:chain_id(enterprise_id)")
    .eq("id", roomTypeId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: problem(500, "Database error", formatPostgrestError(error)),
    };
  }
  const row = data as {
    id: string;
    hotel_id: string;
    chain_id: string;
    name: string;
    code: string;
    chain: { enterprise_id: string } | null;
  } | null;
  if (!row || row.chain?.enterprise_id !== enterpriseId) {
    return {
      ok: false as const,
      response: problem(
        404,
        "Not Found",
        "Room type not found for this enterprise"
      ),
    };
  }
  return { ok: true as const, roomType: row };
}

export function parseHotelCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  if (!code || code.length > 64) return null;
  return code;
}

export function parseHotelName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  if (!name || name.length > 200) return null;
  return name;
}

export function parseOptionalInt(
  raw: unknown,
  opts: { min?: number; max?: number } = {}
): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n)) return null;
  if (opts.min != null && n < opts.min) return null;
  if (opts.max != null && n > opts.max) return null;
  return n;
}

export function parseOptionalStringArray(raw: unknown): number[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number(item);
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    out.push(n);
  }
  return out;
}

export function parseOptionalTime(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(t)) return null;
  return t.length === 5 ? `${t}:00` : t;
}

export function parseCatalogCode(raw: unknown): string | null {
  return parseHotelCode(raw);
}

export function parseOptionalDate(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return null;
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d;
}

export async function validateHotelInChain(
  supa: ReturnType<typeof supaClient>,
  chainId: string,
  hotelId: string
): Promise<boolean> {
  const { data } = await supa
    .schema("inventory")
    .from("hotel")
    .select("id")
    .eq("id", hotelId)
    .eq("chain_id", chainId)
    .maybeSingle();
  return !!data;
}

export async function validateRoomTypeInChain(
  supa: ReturnType<typeof supaClient>,
  chainId: string,
  roomTypeId: string,
  hotelId?: string | null
): Promise<{ ok: true; hotel_id: string } | { ok: false }> {
  const { data } = await supa
    .schema("inventory")
    .from("room_type")
    .select("id,hotel_id,chain_id")
    .eq("id", roomTypeId)
    .eq("chain_id", chainId)
    .maybeSingle();
  if (!data) return { ok: false };
  const row = data as { hotel_id: string };
  if (hotelId && row.hotel_id !== hotelId) return { ok: false };
  return { ok: true, hotel_id: row.hotel_id };
}

export async function loadRatePlanInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  ratePlanId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("rate_plan")
    .select("id,chain_id,hotel_id,room_type_id,code,label,priority,valid_from,valid_to,nightly_rate_cents,created_at,chain:chain_id(enterprise_id)")
    .eq("id", ratePlanId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: problem(500, "Database error", formatPostgrestError(error)),
    };
  }
  const row = data as {
    chain: { enterprise_id: string } | null;
  } | null;
  if (!data || row?.chain?.enterprise_id !== enterpriseId) {
    return {
      ok: false as const,
      response: problem(404, "Not Found", "Rate plan not found"),
    };
  }
  return { ok: true as const, ratePlan: data };
}

export async function loadPromotionInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  promotionId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("promotion")
    .select("id,chain_id,code,label,active,discount_percent_bps,discount_amount_cents,min_los,valid_from,valid_to,blackout_dates,created_at,chain:chain_id(enterprise_id)")
    .eq("id", promotionId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: problem(500, "Database error", formatPostgrestError(error)),
    };
  }
  const row = data as { chain: { enterprise_id: string } | null } | null;
  if (!data || row?.chain?.enterprise_id !== enterpriseId) {
    return {
      ok: false as const,
      response: problem(404, "Not Found", "Promotion not found"),
    };
  }
  return { ok: true as const, promotion: data };
}

export async function loadBlockInEnterprise(
  supa: ReturnType<typeof supaClient>,
  enterpriseId: string,
  blockId: string
) {
  const { data, error } = await supa
    .schema("inventory")
    .from("inventory_block")
    .select("id,chain_id,hotel_id,room_type_id,units_reduced,start_date,end_date,label,chain:chain_id(enterprise_id)")
    .eq("id", blockId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      response: problem(500, "Database error", formatPostgrestError(error)),
    };
  }
  const row = data as { chain: { enterprise_id: string } | null } | null;
  if (!data || row?.chain?.enterprise_id !== enterpriseId) {
    return {
      ok: false as const,
      response: problem(404, "Not Found", "Block not found"),
    };
  }
  return { ok: true as const, block: data };
}
