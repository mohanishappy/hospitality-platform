import { describe, expect, it } from "vitest";
import { isManagerRequest, parseRolesHeader } from "../services/inventory/src/admin-auth.ts";

describe("parseRolesHeader", () => {
  it("normalizes role names from x-roles", () => {
    const roles = parseRolesHeader({
      req: { header: (name: string) => (name === "x-roles" ? "Manager, front_desk" : undefined) },
    } as never);
    expect(roles).toEqual(["manager", "front_desk"]);
  });
});

describe("isManagerRequest", () => {
  it("returns true when manager role present", () => {
    expect(
      isManagerRequest({
        req: { header: (name: string) => (name === "x-roles" ? "manager" : undefined) },
      } as never)
    ).toBe(true);
  });

  it("returns false for front_desk only", () => {
    expect(
      isManagerRequest({
        req: { header: (name: string) => (name === "x-roles" ? "front_desk" : undefined) },
      } as never)
    ).toBe(false);
  });
});
