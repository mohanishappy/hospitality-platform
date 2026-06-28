import { describe, expect, it } from "vitest";
import {
  parseUserEmailHeader,
  redactStaffFields,
  requiresGuestEmailScope,
} from "../services/reservations/src/guest-scope.ts";
import { parseRolesHeader } from "../services/reservations/src/validation.ts";

describe("requiresGuestEmailScope", () => {
  it("is false when roles claim is absent (legacy chain-wide)", () => {
    expect(requiresGuestEmailScope(null)).toBe(false);
  });

  it("is true for guest and empty/default roles", () => {
    expect(requiresGuestEmailScope(["guest"])).toBe(true);
    expect(requiresGuestEmailScope([])).toBe(true);
  });

  it("is false for staff roles", () => {
    expect(requiresGuestEmailScope(["front_desk"])).toBe(false);
    expect(requiresGuestEmailScope(["manager"])).toBe(false);
    expect(requiresGuestEmailScope(["guest", "front_desk"])).toBe(false);
  });
});

describe("parseUserEmailHeader", () => {
  it("normalizes email to lowercase", () => {
    expect(parseUserEmailHeader(" Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("returns null for missing header", () => {
    expect(parseUserEmailHeader(undefined)).toBeNull();
    expect(parseUserEmailHeader("  ")).toBeNull();
  });
});

describe("redactStaffFields", () => {
  it("removes internal_note from responses", () => {
    const row = {
      id: "1",
      internal_note: "secret",
      guest_note: "hello",
    };
    expect(redactStaffFields(row)).toEqual({
      id: "1",
      guest_note: "hello",
    });
  });
});

describe("parseRolesHeader integration", () => {
  it("parses comma-separated roles from gateway forward", () => {
    expect(parseRolesHeader("guest")).toEqual(["guest"]);
    expect(parseRolesHeader("front_desk,manager")).toEqual([
      "front_desk",
      "manager",
    ]);
    expect(parseRolesHeader("")).toEqual([]);
  });
});
