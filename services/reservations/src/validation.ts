import type {
  CreateReservationBody,
  GuestPatch,
  ReservationStatus,
} from "./types";

const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;

export function parseCreateBody(raw: unknown):
  | { ok: true; body: CreateReservationBody }
  | { ok: false; detail: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, detail: "JSON body required" };
  }
  const o = raw as Record<string, unknown>;
  const hotel_id = o.hotel_id;
  const room_type_id = o.room_type_id;
  const check_in = o.check_in;
  const check_out = o.check_out;
  const guest = o.guest;
  if (typeof hotel_id !== "string" || !hotel_id.trim()) {
    return { ok: false, detail: "hotel_id (uuid) required" };
  }
  if (typeof room_type_id !== "string" || !room_type_id.trim()) {
    return { ok: false, detail: "room_type_id (uuid) required" };
  }
  if (typeof check_in !== "string" || !isoDateRe.test(check_in)) {
    return {
      ok: false,
      detail: "check_in must be a date-only ISO string (YYYY-MM-DD)",
    };
  }
  if (typeof check_out !== "string" || !isoDateRe.test(check_out)) {
    return {
      ok: false,
      detail: "check_out must be a date-only ISO string (YYYY-MM-DD)",
    };
  }
  const t0 = Date.parse(`${check_in}T00:00:00.000Z`);
  const t1 = Date.parse(`${check_out}T00:00:00.000Z`);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) {
    return {
      ok: false,
      detail:
        "check_out must be after check_in (hotel: departure date after arrival)",
    };
  }
  if (guest === null || typeof guest !== "object") {
    return { ok: false, detail: "guest object required" };
  }
  const g = guest as Record<string, unknown>;
  const first_name = g.first_name;
  const last_name = g.last_name;
  const email = g.email;
  const phone = g.phone;
  if (typeof first_name !== "string" || !first_name.trim()) {
    return { ok: false, detail: "guest.first_name required" };
  }
  if (typeof last_name !== "string" || !last_name.trim()) {
    return { ok: false, detail: "guest.last_name required" };
  }
  if (typeof email !== "string" || !email.trim()) {
    return { ok: false, detail: "guest.email required" };
  }
  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    return { ok: false, detail: "guest.phone must be a string if present" };
  }
  let expected_total_cents: number | null | undefined;
  if ("expected_total_cents" in o) {
    const e = o.expected_total_cents;
    if (e === null || e === undefined) {
      expected_total_cents = null;
    } else if (typeof e === "number" && Number.isInteger(e) && e >= 0) {
      expected_total_cents = e;
    } else {
      return {
        ok: false,
        detail: "expected_total_cents must be a non-negative integer or null",
      };
    }
  }
  return {
    ok: true,
    body: {
      hotel_id: hotel_id.trim(),
      room_type_id: room_type_id.trim(),
      check_in,
      check_out,
      expected_total_cents,
      guest: {
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim(),
        phone: typeof phone === "string" ? phone.trim() || null : null,
      },
    },
  };
}

export function parseReservationStatus(
  raw: unknown
): { ok: true; status: ReservationStatus } | { ok: false; detail: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, detail: "JSON body required" };
  }
  const s = (raw as Record<string, unknown>).status;
  if (s !== "pending" && s !== "confirmed" && s !== "cancelled") {
    return {
      ok: false,
      detail: 'status must be "pending", "confirmed", or "cancelled"',
    };
  }
  return { ok: true, status: s };
}

export function canTransitionTo(
  from: string,
  to: ReservationStatus
): "ok" | "noop" | "forbidden" {
  if (from === to) return "noop";
  if (from === "cancelled") return "forbidden";
  if (from === "pending" && (to === "confirmed" || to === "cancelled")) {
    return "ok";
  }
  if (from === "confirmed" && to === "cancelled") return "ok";
  return "forbidden";
}

export function parseGuestPatchBody(raw: unknown):
  | { ok: true; patch: GuestPatch }
  | { ok: false; detail: string } {
  if (raw === null || typeof raw !== "object") {
    return { ok: false, detail: "JSON body required" };
  }
  const o = raw as Record<string, unknown>;
  const patch: GuestPatch = {};
  if ("first_name" in o) {
    if (typeof o.first_name !== "string") {
      return { ok: false, detail: "first_name must be a string" };
    }
    if (!o.first_name.trim()) {
      return { ok: false, detail: "first_name cannot be empty" };
    }
    patch.first_name = o.first_name.trim();
  }
  if ("last_name" in o) {
    if (typeof o.last_name !== "string") {
      return { ok: false, detail: "last_name must be a string" };
    }
    if (!o.last_name.trim()) {
      return { ok: false, detail: "last_name cannot be empty" };
    }
    patch.last_name = o.last_name.trim();
  }
  if ("email" in o) {
    if (typeof o.email !== "string") {
      return { ok: false, detail: "email must be a string" };
    }
    if (!o.email.trim()) {
      return { ok: false, detail: "email cannot be empty" };
    }
    patch.email = o.email.trim();
  }
  if ("phone" in o) {
    const v = o.phone;
    if (v === null) {
      patch.phone = null;
    } else if (typeof v === "string") {
      patch.phone = v.trim() === "" ? null : v.trim();
    } else {
      return { ok: false, detail: "phone must be a string or null" };
    }
  }
  if (Object.keys(patch).length === 0) {
    return {
      ok: false,
      detail: "Provide at least one of: first_name, last_name, email, phone",
    };
  }
  return { ok: true, patch };
}

export function parseListQuery(c: {
  req: { query: (k: string) => string | undefined };
}): { limit: number; offset: number } {
  const limitRaw = c.req.query("limit");
  const offsetRaw = c.req.query("offset");
  let limit = Number.parseInt(limitRaw ?? "20", 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;
  let offset = Number.parseInt(offsetRaw ?? "0", 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

const uuidLike =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Query params for `GET /v1/reservations` list filters (FR-R8). */
export function parseReservationListFilters(c: {
  req: { query: (k: string) => string | undefined };
}):
  | {
      ok: true;
      status?: "pending" | "confirmed" | "cancelled";
      hotel_id?: string;
      stay_from?: string;
      stay_to?: string;
    }
  | { ok: false; detail: string } {
  const statusRaw = c.req.query("status")?.trim();
  const hotelIdRaw = c.req.query("hotel_id")?.trim();
  const stayFrom = c.req.query("stay_from")?.trim();
  const stayTo = c.req.query("stay_to")?.trim();

  let status: "pending" | "confirmed" | "cancelled" | undefined;
  if (statusRaw) {
    if (
      statusRaw !== "pending" &&
      statusRaw !== "confirmed" &&
      statusRaw !== "cancelled"
    ) {
      return {
        ok: false,
        detail:
          'status must be "pending", "confirmed", or "cancelled" when provided',
      };
    }
    status = statusRaw;
  }

  let hotel_id: string | undefined;
  if (hotelIdRaw) {
    if (!uuidLike.test(hotelIdRaw)) {
      return { ok: false, detail: "hotel_id must be a UUID when provided" };
    }
    hotel_id = hotelIdRaw;
  }

  const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (stayFrom || stayTo) {
    if (!stayFrom || !stayTo) {
      return {
        ok: false,
        detail: "stay_from and stay_to must both be provided for a date window filter",
      };
    }
    if (!isoDateRe.test(stayFrom) || !isoDateRe.test(stayTo)) {
      return {
        ok: false,
        detail: "stay_from and stay_to must be YYYY-MM-DD",
      };
    }
    const t0 = Date.parse(`${stayFrom}T00:00:00.000Z`);
    const t1 = Date.parse(`${stayTo}T00:00:00.000Z`);
    if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) {
      return {
        ok: false,
        detail: "stay_to must be after stay_from for overlap filter",
      };
    }
    return {
      ok: true,
      status,
      hotel_id,
      stay_from: stayFrom,
      stay_to: stayTo,
    };
  }

  return { ok: true, status, hotel_id };
}
