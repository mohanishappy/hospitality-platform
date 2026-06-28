import { describe, expect, it } from "vitest";
import { isUuidLike, UUID_LIKE } from "../lib/uuid.ts";

const DEMO = "00000000-0000-0000-0000-000000000001";
const HBR = "a1111111-1111-4111-8111-111111111111";

describe("isUuidLike", () => {
  it("accepts RFC and legacy seed ids", () => {
    expect(isUuidLike(DEMO)).toBe(true);
    expect(isUuidLike(HBR)).toBe(true);
    expect(UUID_LIKE.test(DEMO)).toBe(true);
  });

  it("rejects non-uuid strings", () => {
    expect(isUuidLike("DEMO")).toBe(false);
    expect(isUuidLike("not-a-uuid")).toBe(false);
  });
});
