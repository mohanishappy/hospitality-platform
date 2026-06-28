import { describe, expect, it } from "vitest";
import {
  getChainIds,
  getEnterpriseId,
} from "../services/gateway/src/claims.ts";
import { reservationInScope } from "../services/reservations/src/chain-scope.ts";
import { parseReservationListFilters } from "../services/reservations/src/validation.ts";

const DEMO = "00000000-0000-0000-0000-000000000001";
const HBR = "a1111111-1111-4111-8111-111111111111";
const PLG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("getEnterpriseId", () => {
  it("reads namespaced enterprise_id claim", () => {
    expect(
      getEnterpriseId({
        "https://hospitality.app/claims/enterprise_id": PLG,
      })
    ).toBe(PLG);
  });
});

describe("getChainIds", () => {
  it("returns null when chain_ids claim is absent", () => {
    expect(getChainIds({ sub: "user" })).toBeNull();
  });

  it("parses namespaced chain_ids array", () => {
    expect(
      getChainIds({
        "https://hospitality.app/claims/chain_ids": [DEMO, HBR],
      })
    ).toEqual([DEMO, HBR]);
  });
});

describe("reservationInScope", () => {
  it("accepts chain ids in the allowed set", () => {
    expect(reservationInScope(DEMO, [DEMO, HBR])).toBe(true);
    expect(reservationInScope(HBR, [DEMO])).toBe(false);
  });
});

describe("parseReservationListFilters chain_id", () => {
  it("accepts optional chain_id UUID", () => {
    const result = parseReservationListFilters({
      req: { query: (k) => (k === "chain_id" ? HBR : undefined) },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.chain_id).toBe(HBR);
  });

  it("rejects invalid chain_id", () => {
    const result = parseReservationListFilters({
      req: { query: (k) => (k === "chain_id" ? "not-a-uuid" : undefined) },
    });
    expect(result.ok).toBe(false);
  });
});
