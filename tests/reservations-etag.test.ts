import { describe, expect, it } from "vitest";
import {
  ifMatchPreconditionResponse,
  normalizeRowVersion,
  weakEtag,
} from "../services/reservations/src/etag.ts";

describe("weakEtag", () => {
  it("formats weak etag from row version", () => {
    expect(weakEtag(7)).toBe('W/"7"');
  });
});

describe("normalizeRowVersion", () => {
  it("accepts number and digit string", () => {
    expect(normalizeRowVersion(4)).toBe(4);
    expect(normalizeRowVersion("12")).toBe(12);
  });
  it("rejects non-numeric", () => {
    expect(normalizeRowVersion("x")).toBeNull();
    expect(normalizeRowVersion(null)).toBeNull();
  });
});

describe("ifMatchPreconditionResponse", () => {
  it("allows missing or blank header", () => {
    expect(ifMatchPreconditionResponse(2, undefined)).toBeNull();
    expect(ifMatchPreconditionResponse(2, "   ")).toBeNull();
  });

  it("allows matching weak etag", () => {
    expect(ifMatchPreconditionResponse(3, 'W/"3"')).toBeNull();
    expect(ifMatchPreconditionResponse(3, 'W/"3", W/"99"')).toBeNull();
  });

  it("returns 412 when no tag matches", () => {
    const r = ifMatchPreconditionResponse(3, 'W/"1"');
    expect(r).not.toBeNull();
    expect(r!.status).toBe(412);
  });

  it("treats lone * as no precondition", () => {
    expect(ifMatchPreconditionResponse(3, "*")).toBeNull();
  });
});
