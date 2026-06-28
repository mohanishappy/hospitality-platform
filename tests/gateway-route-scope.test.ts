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
});
