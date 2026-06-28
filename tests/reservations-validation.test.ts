import { describe, expect, it } from "vitest";
import {
  canTransitionTo,
  canWriteInternalNote,
  parseCreateBody,
  parseGuestPatchBody,
  parseListQuery,
  parseNotesPatchBody,
  parseReservationListFilters,
  parseReservationStatus,
  parseRolesHeader,
} from "../services/reservations/src/validation.ts";

describe("parseCreateBody", () => {
  const validGuest = {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
  };

  it("accepts a valid body", () => {
    const r = parseCreateBody({
      hotel_id: " 11111111-1111-4111-8111-111111111111 ",
      room_type_id: "22222222-2222-4222-8222-222222222222",
      check_in: "2026-06-01",
      check_out: "2026-06-04",
      guest: { ...validGuest, phone: null },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.hotel_id).toBe("11111111-1111-4111-8111-111111111111");
      expect(r.body.guest.phone).toBeNull();
    }
  });

  it("rejects check_out before or equal to check_in", () => {
    const r = parseCreateBody({
      hotel_id: "11111111-1111-4111-8111-111111111111",
      room_type_id: "22222222-2222-4222-8222-222222222222",
      check_in: "2026-06-04",
      check_out: "2026-06-01",
      guest: validGuest,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid JSON root", () => {
    expect(parseCreateBody(null).ok).toBe(false);
  });

  it("accepts optional expected_total_cents", () => {
    const r = parseCreateBody({
      hotel_id: "11111111-1111-4111-8111-111111111111",
      room_type_id: "22222222-2222-4222-8222-222222222222",
      check_in: "2026-06-01",
      check_out: "2026-06-04",
      expected_total_cents: 12_345,
      guest: validGuest,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.expected_total_cents).toBe(12_345);
  });

  it("rejects non-integer expected_total_cents", () => {
    const r = parseCreateBody({
      hotel_id: "11111111-1111-4111-8111-111111111111",
      room_type_id: "22222222-2222-4222-8222-222222222222",
      check_in: "2026-06-01",
      check_out: "2026-06-04",
      expected_total_cents: 1.5,
      guest: validGuest,
    });
    expect(r.ok).toBe(false);
  });
});

describe("parseReservationStatus", () => {
  it("accepts pending, confirmed, cancelled", () => {
    expect(parseReservationStatus({ status: "pending" }).ok).toBe(true);
    expect(parseReservationStatus({ status: "confirmed" }).ok).toBe(true);
    expect(parseReservationStatus({ status: "cancelled" }).ok).toBe(true);
  });

  it("accepts optional cancellation_reason when cancelling", () => {
    const r = parseReservationStatus({
      status: "cancelled",
      cancellation_reason: "guest_request",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cancellation_reason).toBe("guest_request");
  });

  it("rejects cancellation_reason on confirm", () => {
    const r = parseReservationStatus({
      status: "confirmed",
      cancellation_reason: "guest_request",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects unknown status", () => {
    expect(parseReservationStatus({ status: "open" }).ok).toBe(false);
  });
});

describe("canTransitionTo", () => {
  it("allows pending → confirmed and pending → cancelled", () => {
    expect(canTransitionTo("pending", "confirmed")).toBe("ok");
    expect(canTransitionTo("pending", "cancelled")).toBe("ok");
  });

  it("allows confirmed → cancelled only", () => {
    expect(canTransitionTo("confirmed", "cancelled")).toBe("ok");
    expect(canTransitionTo("confirmed", "pending")).toBe("forbidden");
  });

  it("is noop when same status", () => {
    expect(canTransitionTo("pending", "pending")).toBe("noop");
  });

  it("forbids changes from cancelled", () => {
    expect(canTransitionTo("cancelled", "pending")).toBe("forbidden");
  });
});

describe("parseGuestPatchBody", () => {
  it("parses phone null to clear", () => {
    const r = parseGuestPatchBody({ phone: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.phone).toBeNull();
  });

  it("parses phone string", () => {
    const r = parseGuestPatchBody({ phone: "+1-555-0100" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.phone).toBe("+1-555-0100");
  });

  it("rejects phone number type", () => {
    const r = parseGuestPatchBody({ phone: 123 as unknown as string });
    expect(r.ok).toBe(false);
  });

  it("rejects empty patch", () => {
    expect(parseGuestPatchBody({}).ok).toBe(false);
  });
});

describe("parseReservationListFilters", () => {
  const q = (map: Record<string, string>) => (k: string) => map[k];

  it("parses status and hotel_id", () => {
    const r = parseReservationListFilters({
      req: { query: q({ status: "pending", hotel_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" }) },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("pending");
      expect(r.hotel_id).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    }
  });

  it("requires both stay_from and stay_to", () => {
    const onlyFrom = parseReservationListFilters({
      req: { query: q({ stay_from: "2026-01-01" }) },
    });
    expect(onlyFrom.ok).toBe(false);
  });

  it("parses stay window", () => {
    const r = parseReservationListFilters({
      req: {
        query: q({ stay_from: "2026-01-01", stay_to: "2026-01-10" }),
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.stay_from).toBe("2026-01-01");
      expect(r.stay_to).toBe("2026-01-10");
    }
  });
});

describe("parseListQuery", () => {
  it("defaults limit 20 and offset 0", () => {
    const q = parseListQuery({
      req: { query: () => undefined },
    });
    expect(q).toEqual({ limit: 20, offset: 0 });
  });

  it("caps limit at 100", () => {
    const q = parseListQuery({
      req: { query: (k) => (k === "limit" ? "500" : undefined) },
    });
    expect(q.limit).toBe(100);
  });

  it("clamps bad offset", () => {
    const q = parseListQuery({
      req: { query: (k) => (k === "offset" ? "-1" : undefined) },
    });
    expect(q.offset).toBe(0);
  });
});

describe("parseNotesPatchBody", () => {
  it("accepts guest_note", () => {
    const r = parseNotesPatchBody({ guest_note: "Late arrival" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch.guest_note).toBe("Late arrival");
  });

  it("rejects empty patch", () => {
    expect(parseNotesPatchBody({}).ok).toBe(false);
  });
});

describe("canWriteInternalNote", () => {
  it("allows when roles header absent", () => {
    expect(canWriteInternalNote(null)).toBe(true);
  });

  it("requires manager when roles enforced", () => {
    expect(canWriteInternalNote(["front_desk"])).toBe(false);
    expect(canWriteInternalNote(["manager"])).toBe(true);
  });
});

describe("parseRolesHeader", () => {
  it("parses comma-separated roles", () => {
    expect(parseRolesHeader("front_desk,manager")).toEqual([
      "front_desk",
      "manager",
    ]);
  });
});
