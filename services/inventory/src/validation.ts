const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
const uuidLike =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalCode(
  raw: string | undefined
): string | null | undefined {
  if (raw === undefined) return undefined;
  const t = raw.trim();
  return t === "" ? null : t;
}

export function parseAvailabilityQuery(c: {
  req: { query: (k: string) => string | undefined };
}):
  | {
      ok: true;
      check_in: string;
      check_out: string;
      rate_plan_code: string | null;
      promotion_code: string | null;
    }
  | { ok: false; detail: string } {
  const check_in = c.req.query("check_in");
  const check_out = c.req.query("check_out");
  if (typeof check_in !== "string" || !isoDateRe.test(check_in)) {
    return {
      ok: false,
      detail: "check_in query param required (YYYY-MM-DD)",
    };
  }
  if (typeof check_out !== "string" || !isoDateRe.test(check_out)) {
    return {
      ok: false,
      detail: "check_out query param required (YYYY-MM-DD)",
    };
  }
  const t0 = Date.parse(`${check_in}T00:00:00.000Z`);
  const t1 = Date.parse(`${check_out}T00:00:00.000Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) {
    return {
      ok: false,
      detail: "check_out must be after check_in (date-only)",
    };
  }
  return {
    ok: true,
    check_in,
    check_out,
    rate_plan_code: optionalCode(c.req.query("rate_plan_code")) ?? null,
    promotion_code: optionalCode(c.req.query("promotion_code")) ?? null,
  };
}

export function parseSearchQuery(c: {
  req: { query: (k: string) => string | undefined };
}):
  | {
      ok: true;
      check_in: string;
      check_out: string;
      hotel_ids: string[] | null;
      sort: string;
      limit: number;
      rate_plan_code: string | null;
      promotion_code: string | null;
    }
  | { ok: false; detail: string } {
  const check_in = c.req.query("check_in");
  const check_out = c.req.query("check_out");
  if (typeof check_in !== "string" || !isoDateRe.test(check_in)) {
    return {
      ok: false,
      detail: "check_in query param required (YYYY-MM-DD)",
    };
  }
  if (typeof check_out !== "string" || !isoDateRe.test(check_out)) {
    return {
      ok: false,
      detail: "check_out query param required (YYYY-MM-DD)",
    };
  }
  const t0 = Date.parse(`${check_in}T00:00:00.000Z`);
  const t1 = Date.parse(`${check_out}T00:00:00.000Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) {
    return {
      ok: false,
      detail: "check_out must be after check_in (date-only)",
    };
  }

  let hotel_ids: string[] | null = null;
  const hotelsRaw = c.req.query("hotel_ids")?.trim();
  if (hotelsRaw) {
    const parts = hotelsRaw.split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of parts) {
      if (!uuidLike.test(id)) {
        return {
          ok: false,
          detail: "hotel_ids must be comma-separated UUIDs",
        };
      }
    }
    hotel_ids = parts.length ? parts : null;
  }

  let sort = (c.req.query("sort") ?? "price").trim().toLowerCase();
  if (sort !== "price" && sort !== "bookable") {
    return { ok: false, detail: 'sort must be "price" or "bookable"' };
  }

  let limit = Number.parseInt(c.req.query("limit") ?? "20", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  return {
    ok: true,
    check_in,
    check_out,
    hotel_ids,
    sort,
    limit,
    rate_plan_code: optionalCode(c.req.query("rate_plan_code")) ?? null,
    promotion_code: optionalCode(c.req.query("promotion_code")) ?? null,
  };
}

export function parseCalendarQuery(c: {
  req: { query: (k: string) => string | undefined };
}):
  | { ok: true; from: string; to: string }
  | { ok: false; detail: string } {
  const from = c.req.query("from");
  const to = c.req.query("to");
  if (typeof from !== "string" || !isoDateRe.test(from)) {
    return {
      ok: false,
      detail: "from query param required (YYYY-MM-DD), half-open range with to",
    };
  }
  if (typeof to !== "string" || !isoDateRe.test(to)) {
    return {
      ok: false,
      detail: "to query param required (YYYY-MM-DD), exclusive end",
    };
  }
  const t0 = Date.parse(`${from}T00:00:00.000Z`);
  const t1 = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) {
    return {
      ok: false,
      detail: "to must be after from (half-open [from, to))",
    };
  }
  return { ok: true, from, to };
}
