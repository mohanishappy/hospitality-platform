import { describe, expect, it } from "vitest";
import {
  isPublicBookingRoute,
  isPublicChainCatalogRoute,
} from "../services/gateway/src/public-booking.ts";
import {
  chainPath,
  parseChainCodeFromPath,
} from "../apps/web/src/lib/chainPath.ts";

describe("isPublicBookingRoute", () => {
  it("allows anonymous chain catalog", () => {
    expect(isPublicBookingRoute("GET", "/v1/inventory/chains")).toBe(true);
    expect(isPublicBookingRoute("GET", "/v1/inventory/chains/HBR")).toBe(true);
  });

  it("allows anonymous search, hotels, availability, and create", () => {
    const hotel = "11111111-1111-4111-8111-111111111111";
    const room = "22222222-2222-4222-8222-222222222222";
    expect(isPublicBookingRoute("GET", "/v1/inventory/search")).toBe(true);
    expect(isPublicBookingRoute("GET", "/v1/inventory/hotels")).toBe(true);
    expect(
      isPublicBookingRoute(
        "GET",
        `/v1/inventory/hotels/${hotel}/room-types/${room}/availability`
      )
    ).toBe(true);
    expect(isPublicBookingRoute("POST", "/v1/reservations")).toBe(true);
  });

  it("denies staff-only routes", () => {
    expect(isPublicBookingRoute("GET", "/v1/reservations")).toBe(false);
    expect(
      isPublicBookingRoute(
        "GET",
        `/v1/inventory/hotels/11111111-1111-4111-8111-111111111111/room-types/22222222-2222-4222-8222-222222222222/calendar`
      )
    ).toBe(false);
  });
});

describe("isPublicChainCatalogRoute", () => {
  it("matches chain list and lookup only", () => {
    expect(isPublicChainCatalogRoute("GET", "/v1/inventory/chains")).toBe(true);
    expect(isPublicChainCatalogRoute("GET", "/v1/inventory/chains/DEMO")).toBe(
      true
    );
    expect(isPublicChainCatalogRoute("GET", "/v1/inventory/search")).toBe(
      false
    );
  });
});

describe("chain path routing", () => {
  it("parses /c/:chainCode", () => {
    expect(parseChainCodeFromPath("/c/HBR")).toBe("HBR");
    expect(parseChainCodeFromPath("/c/demo/")).toBe("demo");
    expect(parseChainCodeFromPath("/")).toBeNull();
    expect(parseChainCodeFromPath("/c/")).toBeNull();
  });

  it("builds chain paths", () => {
    expect(chainPath("HBR")).toBe("/c/HBR");
  });
});
