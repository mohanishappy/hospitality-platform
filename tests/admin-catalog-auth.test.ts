import { describe, expect, it } from "vitest";
import { requiredPermissions } from "../services/gateway/src/authorization";

describe("gateway catalog admin authorization", () => {
  it("requires staff:admin for admin hotel list", () => {
    expect(
      requiredPermissions(
        "GET",
        "/v1/inventory/admin/chains/a1111111-1111-4111-8111-111111111111/hotels"
      )
    ).toEqual(["staff:admin"]);
  });

  it("requires staff:admin for admin room type create", () => {
    expect(
      requiredPermissions(
        "POST",
        "/v1/inventory/admin/hotels/a1111111-1111-4111-8111-111111111111/room-types"
      )
    ).toEqual(["staff:admin"]);
  });

  it("requires staff:admin for admin room type patch", () => {
    expect(
      requiredPermissions(
        "PATCH",
        "/v1/inventory/admin/room-types/a1111111-1111-4111-8111-111111111111"
      )
    ).toEqual(["staff:admin"]);
  });
});
