import { describe, expect, it } from "vitest";
import {
  parseAvailabilityQuery,
  parseSoftHoldCreateBody,
} from "../services/inventory/src/validation.ts";

function mockQuery(params: Record<string, string>) {
  return {
    req: {
      query: (k: string) => params[k],
    },
  };
}

describe("parseAvailabilityQuery", () => {
  it("accepts valid check_in and check_out", () => {
    const r = parseAvailabilityQuery(
      mockQuery({ check_in: "2026-06-01", check_out: "2026-06-04" })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.check_in).toBe("2026-06-01");
      expect(r.check_out).toBe("2026-06-04");
      expect(r.rate_plan_code).toBeNull();
      expect(r.promotion_code).toBeNull();
    }
  });

  it("rejects missing check_in", () => {
    const r = parseAvailabilityQuery(mockQuery({ check_out: "2026-06-04" }));
    expect(r.ok).toBe(false);
  });

  it("rejects check_out not after check_in", () => {
    const r = parseAvailabilityQuery(
      mockQuery({ check_in: "2026-06-04", check_out: "2026-06-01" })
    );
    expect(r.ok).toBe(false);
  });
});

describe("parseSoftHoldCreateBody", () => {
  it("accepts check_in and check_out with defaults", () => {
    const r = parseSoftHoldCreateBody({
      check_in: "2026-06-01",
      check_out: "2026-06-04",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.ttl_seconds).toBe(900);
      expect(r.body.units_held).toBe(1);
    }
  });

  it("rejects ttl_seconds out of range", () => {
    const r = parseSoftHoldCreateBody({
      check_in: "2026-06-01",
      check_out: "2026-06-04",
      ttl_seconds: 30,
    });
    expect(r.ok).toBe(false);
  });
});
