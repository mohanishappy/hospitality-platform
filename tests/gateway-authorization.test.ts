import { describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import {
  effectivePermissions,
  hasPermission,
  requiredPermissions,
} from "../services/gateway/src/authorization.ts";
import { getRoles, isM2mToken } from "../services/gateway/src/claims.ts";

describe("getRoles", () => {
  it("returns null when roles claim is absent", () => {
    expect(getRoles({ sub: "user" })).toBeNull();
  });

  it("parses namespaced roles array", () => {
    expect(
      getRoles({
        "https://hospitality.app/claims/roles": ["front_desk", "manager"],
      })
    ).toEqual(["front_desk", "manager"]);
  });
});

describe("isM2mToken", () => {
  it("detects client-credentials", () => {
    expect(isM2mToken({ gty: "client-credentials" } as JWTPayload)).toBe(true);
    expect(isM2mToken({ gty: "password" } as JWTPayload)).toBe(false);
  });
});

describe("requiredPermissions", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("maps inventory GET to inventory:read", () => {
    expect(requiredPermissions("GET", "/v1/inventory/hotels")).toEqual([
      "inventory:read",
    ]);
  });

  it("maps reservation cancel PATCH to reservations:cancel", () => {
    expect(
      requiredPermissions("PATCH", `/v1/reservations/${id}`, "cancelled")
    ).toEqual(["reservations:cancel"]);
  });

  it("maps reservation confirm PATCH to reservations:confirm", () => {
    expect(
      requiredPermissions("PATCH", `/v1/reservations/${id}`, "confirmed")
    ).toEqual(["reservations:confirm"]);
  });

  it("maps notes PATCH to reservations:notes", () => {
    expect(
      requiredPermissions("PATCH", `/v1/reservations/${id}/notes`)
    ).toEqual(["reservations:notes"]);
  });
});

describe("effectivePermissions", () => {
  it("returns null when roles claim absent (legacy full access)", () => {
    expect(effectivePermissions({ sub: "u" }, null)).toBeNull();
  });

  it("grants read_only only read permissions", () => {
    const perms = effectivePermissions({ sub: "u" }, ["read_only"]);
    expect(perms).not.toBeNull();
    expect(hasPermission(perms, ["inventory:read"])).toBe(true);
    expect(hasPermission(perms, ["reservations:create"])).toBe(false);
  });

  it("allows manager to cancel", () => {
    const perms = effectivePermissions({ sub: "u" }, ["manager"]);
    expect(hasPermission(perms, ["reservations:cancel"])).toBe(true);
  });

  it("denies front_desk cancel", () => {
    const perms = effectivePermissions({ sub: "u" }, ["front_desk"]);
    expect(hasPermission(perms, ["reservations:cancel"])).toBe(false);
    expect(hasPermission(perms, ["reservations:confirm"])).toBe(true);
  });

  it("restricts M2M tokens without manager role", () => {
    const perms = effectivePermissions(
      { sub: "client@clients", gty: "client-credentials" } as JWTPayload,
      ["integration"]
    );
    expect(hasPermission(perms, ["reservations:create"])).toBe(true);
    expect(hasPermission(perms, ["reservations:confirm"])).toBe(false);
    expect(hasPermission(perms, ["reservations:cancel"])).toBe(false);
  });
});
