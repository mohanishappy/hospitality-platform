import { describe, expect, it } from "vitest";
import {
  allowsEmptyChainScope,
  isActionClaimsRoute,
} from "../services/gateway/src/route-scope.ts";

describe("isActionClaimsRoute", () => {
  it("matches internal staff claims GET", () => {
    expect(
      isActionClaimsRoute("GET", "/v1/inventory/internal/staff/claims")
    ).toBe(true);
    expect(
      isActionClaimsRoute("POST", "/v1/inventory/internal/staff/claims")
    ).toBe(false);
  });
});

describe("allowsEmptyChainScope", () => {
  it("allows invite accept without brand scope", () => {
    expect(
      allowsEmptyChainScope("POST", "/v1/inventory/invites/accept")
    ).toBe(true);
  });

  it("allows admin staff routes", () => {
    expect(
      allowsEmptyChainScope("POST", "/v1/inventory/admin/staff/invite")
    ).toBe(true);
    expect(allowsEmptyChainScope("GET", "/v1/inventory/admin/staff")).toBe(
      true
    );
  });

  it("allows me/chains lookup", () => {
    expect(allowsEmptyChainScope("GET", "/v1/inventory/me/chains")).toBe(true);
  });

  it("denies regular inventory reads without scope", () => {
    expect(allowsEmptyChainScope("GET", "/v1/inventory/hotels")).toBe(false);
  });

  it("allows admin catalog routes without brand scope", () => {
    expect(
      allowsEmptyChainScope(
        "GET",
        "/v1/inventory/admin/chains/00000000-0000-0000-0000-000000000001/hotels"
      )
    ).toBe(true);
    expect(
      allowsEmptyChainScope(
        "POST",
        "/v1/inventory/admin/hotels/11111111-1111-4111-8111-111111111111/room-types"
      )
    ).toBe(true);
  });

  it("allows platform routes without brand scope", () => {
    expect(
      allowsEmptyChainScope("GET", "/v1/inventory/platform/enterprises")
    ).toBe(true);
    expect(
      allowsEmptyChainScope("POST", "/v1/inventory/platform/enterprises")
    ).toBe(true);
  });
});
