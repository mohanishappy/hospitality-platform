import { describe, expect, it } from "vitest";
import openApiSpec from "../services/gateway/src/openapi.json";

type OpenApiDoc = {
  openapi?: string;
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, Record<string, unknown>>;
  };
};

const spec = openApiSpec as OpenApiDoc;

const REQUIRED_PATHS = [
  "/v1/inventory/hotels",
  "/v1/inventory/hotels/{id}",
  "/v1/inventory/hotels/{hotelId}/room-types",
  "/v1/inventory/search",
  "/v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/calendar",
  "/v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/availability",
  "/v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/soft-holds",
  "/v1/inventory/soft-holds/{holdId}",
  "/v1/reservations",
  "/v1/reservations/{id}",
  "/v1/reservations/{id}/guest",
  "/v1/reservations/{id}/notes",
] as const;

const PATH_METHODS: Record<(typeof REQUIRED_PATHS)[number], string[]> = {
  "/v1/inventory/hotels": ["get"],
  "/v1/inventory/hotels/{id}": ["get"],
  "/v1/inventory/hotels/{hotelId}/room-types": ["get"],
  "/v1/inventory/search": ["get"],
  "/v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/calendar": ["get"],
  "/v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/availability": ["get"],
  "/v1/inventory/hotels/{hotelId}/room-types/{roomTypeId}/soft-holds": ["post"],
  "/v1/inventory/soft-holds/{holdId}": ["delete"],
  "/v1/reservations": ["get", "post"],
  "/v1/reservations/{id}": ["get", "patch"],
  "/v1/reservations/{id}/guest": ["patch"],
  "/v1/reservations/{id}/notes": ["patch"],
};

function schemaProperties(name: string): Record<string, unknown> | undefined {
  const schema = spec.components?.schemas?.[name];
  if (!schema) return undefined;
  const props = schema.properties as Record<string, unknown> | undefined;
  if (props) return props;
  const allOf = schema.allOf as Array<{ properties?: Record<string, unknown> }> | undefined;
  if (!allOf) return undefined;
  return Object.assign({}, ...allOf.map((s) => s.properties ?? {}));
}

describe("OpenAPI contract guard (FR-D1 / Phase 7C)", () => {
  it("declares OpenAPI 3.x", () => {
    expect(spec.openapi).toMatch(/^3\./);
  });

  it("includes all gateway v1 paths", () => {
    for (const path of REQUIRED_PATHS) {
      expect(spec.paths?.[path], `missing path ${path}`).toBeDefined();
    }
  });

  it("maps expected HTTP methods per path", () => {
    for (const [path, methods] of Object.entries(PATH_METHODS)) {
      const ops = spec.paths?.[path] ?? {};
      for (const m of methods) {
        expect(ops[m], `${path} missing ${m.toUpperCase()}`).toBeDefined();
      }
    }
  });

  it("ReservationListItem includes Phase 5–6 fields", () => {
    const props = schemaProperties("ReservationListItem");
    expect(props).toBeDefined();
    for (const key of [
      "row_version",
      "cancellation_reason",
      "cancelled_at",
      "internal_note",
      "guest_note",
      "pricing_snapshot",
    ]) {
      expect(props![key], `ReservationListItem.${key}`).toBeDefined();
    }
  });

  it("ReservationStatusPatch allows cancellation_reason on cancel", () => {
    const props = schemaProperties("ReservationStatusPatch");
    expect(props?.status).toBeDefined();
    expect(props?.cancellation_reason).toBeDefined();
  });

  it("defines CancellationReason enum", () => {
    const schema = spec.components?.schemas?.CancellationReason as
      | { enum?: string[] }
      | undefined;
    expect(schema?.enum).toEqual([
      "guest_request",
      "no_show",
      "duplicate",
      "rate_dispute",
      "other",
    ]);
  });

  it("ReservationNotesPatch requires at least one note field", () => {
    const schema = spec.components?.schemas?.ReservationNotesPatch;
    expect(schema?.minProperties).toBe(1);
    const props = schema?.properties as Record<string, unknown> | undefined;
    expect(props?.internal_note).toBeDefined();
    expect(props?.guest_note).toBeDefined();
  });
});
