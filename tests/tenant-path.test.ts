import { describe, expect, it } from "vitest";
import {
  enterpriseAdminPath,
  parseEnterpriseAdminFromPath,
  parseEnterpriseCodeFromPath,
} from "../apps/web/src/lib/tenantPath.ts";

describe("parseEnterpriseAdminFromPath", () => {
  it("parses /e/PLG/admin as staff tab", () => {
    expect(parseEnterpriseAdminFromPath("/e/PLG/admin")).toEqual({
      enterpriseCode: "PLG",
      tab: "staff",
    });
  });

  it("parses brands tab", () => {
    expect(parseEnterpriseAdminFromPath("/e/plg/admin/brands")).toEqual({
      enterpriseCode: "plg",
      tab: "brands",
    });
  });

  it("returns null for public enterprise path", () => {
    expect(parseEnterpriseAdminFromPath("/e/PLG")).toBeNull();
  });
});

describe("parseEnterpriseCodeFromPath", () => {
  it("does not treat admin path as enterprise hub", () => {
    expect(parseEnterpriseCodeFromPath("/e/PLG/admin")).toBeNull();
    expect(parseEnterpriseCodeFromPath("/e/PLG")).toBe("PLG");
  });
});

describe("enterpriseAdminPath", () => {
  it("builds staff and brands URLs", () => {
    expect(enterpriseAdminPath("PLG")).toBe("/e/PLG/admin");
    expect(enterpriseAdminPath("PLG", "brands")).toBe("/e/PLG/admin/brands");
  });
});
