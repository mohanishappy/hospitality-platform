import { describe, expect, it } from "vitest";
import type { JWTPayload } from "jose";
import {
  effectivePermissions,
  enforcePublicBookingAuthorization,
  hasPermission,
  requiredPermissions,
} from "../services/gateway/src/authorization.ts";
import { getRoles, getUserEmail, isM2mToken, normalizeRoleName } from "../services/gateway/src/claims.ts";

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

  it("normalizes Auth0 role name casing and spaces", () => {
    expect(
      getRoles({
        "https://hospitality.app/claims/roles": ["Front Desk", "Manager"],
      })
    ).toEqual(["front_desk", "manager"]);
  });
});

describe("normalizeRoleName", () => {
  it("lowercases and underscores spaces", () => {
    expect(normalizeRoleName("Front Desk")).toBe("front_desk");
  });
});

describe("getUserEmail", () => {
  it("reads standard and namespaced email claims", () => {
    expect(getUserEmail({ email: "Ada@Example.com" })).toBe("ada@example.com");
    expect(
      getUserEmail({
        "https://hospitality.app/claims/email": "mohan@mjtech.in",
      })
    ).toBe("mohan@mjtech.in");
  });

  it("returns null when email is absent", () => {
    expect(getUserEmail({ sub: "user" })).toBeNull();
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

  it("maps admin staff routes to staff:admin", () => {
    expect(requiredPermissions("GET", "/v1/inventory/admin/staff")).toEqual([
      "staff:admin",
    ]);
    expect(
      requiredPermissions("POST", "/v1/inventory/admin/staff")
    ).toEqual(["staff:admin"]);
    expect(
      requiredPermissions("PUT", `/v1/inventory/admin/staff/${id}/chains`)
    ).toEqual(["staff:admin"]);
  });

  it("maps me/chains to inventory:read", () => {
    expect(requiredPermissions("GET", "/v1/inventory/me/chains")).toEqual([
      "inventory:read",
    ]);
  });

  it("maps invite accept to inventory:read", () => {
    expect(
      requiredPermissions("POST", "/v1/inventory/invites/accept")
    ).toEqual(["inventory:read"]);
  });

  it("maps staff invite to staff:admin", () => {
    expect(
      requiredPermissions("POST", "/v1/inventory/admin/staff/invite")
    ).toEqual(["staff:admin"]);
  });
});

describe("effectivePermissions", () => {
  it("defaults user tokens without roles claim to guest", () => {
    const perms = effectivePermissions({ sub: "u" }, null);
    expect(perms).not.toBeNull();
    expect(hasPermission(perms, ["reservations:create"])).toBe(true);
    expect(hasPermission(perms, ["reservations:read"])).toBe(true);
    expect(hasPermission(perms, ["reservations:confirm"])).toBe(false);
    expect(hasPermission(perms, ["reservations:notes"])).toBe(false);
  });

  it("keeps M2M tokens without roles claim as legacy full access", () => {
    expect(
      effectivePermissions(
        { sub: "client@clients", gty: "client-credentials" } as JWTPayload,
        null
      )
    ).toBeNull();
  });

  it("defaults empty roles array to guest", () => {
    const perms = effectivePermissions({ sub: "u" }, []);
    expect(hasPermission(perms, ["reservations:create"])).toBe(true);
    expect(hasPermission(perms, ["reservations:confirm"])).toBe(false);
  });

  it("grants guest book and cancel only", () => {
    const perms = effectivePermissions({ sub: "u" }, ["guest"]);
    expect(hasPermission(perms, ["inventory:read"])).toBe(true);
    expect(hasPermission(perms, ["reservations:create"])).toBe(true);
    expect(hasPermission(perms, ["reservations:cancel"])).toBe(true);
    expect(hasPermission(perms, ["reservations:confirm"])).toBe(false);
  });

  it("grants read_only no permissions", () => {
    const perms = effectivePermissions({ sub: "u" }, ["read_only"]);
    expect(perms).not.toBeNull();
    expect(hasPermission(perms, ["inventory:read"])).toBe(false);
    expect(hasPermission(perms, ["reservations:create"])).toBe(false);
  });

  it("allows manager to cancel", () => {
    const perms = effectivePermissions({ sub: "u" }, ["manager"]);
    expect(hasPermission(perms, ["reservations:cancel"])).toBe(true);
    expect(hasPermission(perms, ["staff:admin"])).toBe(true);
  });

  it("denies front_desk staff admin", () => {
    const perms = effectivePermissions({ sub: "u" }, ["front_desk"]);
    expect(hasPermission(perms, ["staff:admin"])).toBe(false);
  });

  it("allows front_desk to cancel", () => {
    const perms = effectivePermissions({ sub: "u" }, ["front_desk"]);
    expect(hasPermission(perms, ["reservations:cancel"])).toBe(true);
    expect(hasPermission(perms, ["reservations:confirm"])).toBe(true);
  });

  it("falls back unknown user roles to guest permissions", () => {
    const perms = effectivePermissions({ sub: "u" }, ["Guest"]);
    expect(hasPermission(perms, ["inventory:read"])).toBe(true);
    expect(hasPermission(perms, ["reservations:create"])).toBe(true);
  });

  it("does not fall back explicit read_only to guest", () => {
    const perms = effectivePermissions({ sub: "u" }, ["read_only"]);
    expect(hasPermission(perms, ["inventory:read"])).toBe(false);
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

describe("enforcePublicBookingAuthorization", () => {
  it("allows guest public booking routes", async () => {
    const c = {
      req: { method: "POST", path: "/v1/reservations" },
      get: () => undefined,
    };
    expect(await enforcePublicBookingAuthorization(c as never)).toBeUndefined();
  });

  it("denies public access to staff inventory writes", async () => {
    const hotel = "11111111-1111-4111-8111-111111111111";
    const room = "22222222-2222-4222-8222-222222222222";
    const c = {
      req: {
        method: "POST",
        path: `/v1/inventory/hotels/${hotel}/room-types/${room}/soft-holds`,
      },
      get: () => undefined,
    };
    const res = await enforcePublicBookingAuthorization(c as never);
    expect(res?.status).toBe(403);
  });
});
