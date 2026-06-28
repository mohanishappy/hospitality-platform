import { describe, expect, it } from "vitest";
import {
  pickStaffClaimsForEmail,
  normalizeIntendedRole,
} from "../services/inventory/src/staff-roles.ts";

const PLG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("normalizeIntendedRole", () => {
  it("accepts manager and front_desk", () => {
    expect(normalizeIntendedRole("Manager")).toBe("manager");
    expect(normalizeIntendedRole("front_desk")).toBe("front_desk");
  });

  it("rejects unknown roles", () => {
    expect(normalizeIntendedRole("admin")).toBeNull();
  });
});

describe("pickStaffClaimsForEmail", () => {
  it("returns null when no active rows", () => {
    expect(
      pickStaffClaimsForEmail([
        {
          enterprise_id: PLG,
          intended_role: "manager",
          status: "pending",
          active: false,
          updated_at: "2026-01-01T00:00:00Z",
        },
      ])
    ).toBeNull();
  });

  it("picks newest active staff row", () => {
    expect(
      pickStaffClaimsForEmail([
        {
          enterprise_id: PLG,
          intended_role: "front_desk",
          status: "active",
          active: true,
          updated_at: "2026-01-01T00:00:00Z",
        },
        {
          enterprise_id: PLG,
          intended_role: "manager",
          status: "active",
          active: true,
          updated_at: "2026-06-01T00:00:00Z",
        },
      ])
    ).toEqual({ enterprise_id: PLG, roles: ["manager"] });
  });

  it("ignores disabled rows", () => {
    expect(
      pickStaffClaimsForEmail([
        {
          enterprise_id: PLG,
          intended_role: "manager",
          status: "disabled",
          active: false,
          updated_at: "2026-06-01T00:00:00Z",
        },
      ])
    ).toBeNull();
  });
});
