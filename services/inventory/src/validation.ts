const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

export function parseAvailabilityQuery(c: {
  req: { query: (k: string) => string | undefined };
}):
  | { ok: true; check_in: string; check_out: string }
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
  return { ok: true, check_in, check_out };
}
