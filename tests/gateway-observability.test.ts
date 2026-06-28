import { describe, expect, it } from "vitest";
import {
  buildRequestLogEntry,
  metricPath,
} from "../services/gateway/src/observability.ts";

describe("metricPath", () => {
  it("strips trailing slash", () => {
    expect(metricPath("/v1/reservations/")).toBe("/v1/reservations");
  });

  it("keeps root path", () => {
    expect(metricPath("/")).toBe("/");
  });
});

describe("buildRequestLogEntry", () => {
  it("builds structured log shape", () => {
    expect(
      buildRequestLogEntry("rid-1", "get", "/health", 200, 12)
    ).toEqual({
      service: "gateway",
      request_id: "rid-1",
      method: "GET",
      path: "/health",
      status: 200,
      duration_ms: 12,
    });
  });
});
