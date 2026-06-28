import { describe, expect, it } from "vitest";
import { isStaffUser } from "../services/gateway/src/claims.ts";
import {
  pickActiveChainId,
  resolveChainScope,
  staffScopeForbiddenDetail,
} from "../services/gateway/src/chain-scope.ts";
import type { StaffAccessRecord } from "../services/gateway/src/staff-access.ts";

const DEMO = "00000000-0000-0000-0000-000000000001";
const HBR = "a1111111-1111-4111-8111-111111111111";
const NWE = "a2222222-2222-4222-8222-222222222222";
const PLG = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const enterpriseChains = [
  { id: DEMO, code: "DEMO", name: "Demo", enterprise_id: PLG },
  { id: HBR, code: "HBR", name: "Harborline", enterprise_id: PLG },
  { id: NWE, code: "NWE", name: "Northwest", enterprise_id: PLG },
];

describe("isStaffUser", () => {
  it("treats front_desk as staff", () => {
    expect(isStaffUser(["front_desk"])).toBe(true);
  });
  it("treats guest-only as non-staff", () => {
    expect(isStaffUser(["guest"])).toBe(false);
  });
  it("treats null roles as non-staff", () => {
    expect(isStaffUser(null)).toBe(false);
  });
});

describe("resolveChainScope", () => {
  it("gives guests all enterprise chains", () => {
    expect(resolveChainScope(enterpriseChains, ["guest"], null)).toEqual([
      DEMO,
      HBR,
      NWE,
    ]);
  });

  it("restricts staff to DB chain grants", () => {
    const access: StaffAccessRecord = {
      provisioned: true,
      active: true,
      all_chains: false,
      chain_ids: [HBR],
    };
    expect(
      resolveChainScope(enterpriseChains, ["front_desk"], access)
    ).toEqual([HBR]);
  });

  it("gives corporate staff all enterprise chains", () => {
    const access: StaffAccessRecord = {
      provisioned: true,
      active: true,
      all_chains: true,
    };
    expect(resolveChainScope(enterpriseChains, ["manager"], access)).toEqual([
      DEMO,
      HBR,
      NWE,
    ]);
  });

  it("denies unprovisioned staff", () => {
    expect(
      resolveChainScope(enterpriseChains, ["front_desk"], {
        provisioned: false,
      })
    ).toEqual([]);
  });
});

describe("staffScopeForbiddenDetail", () => {
  it("explains missing provisioning", () => {
    expect(
      staffScopeForbiddenDetail(["front_desk"], { provisioned: false })
    ).toContain("not provisioned");
  });
});

describe("pickActiveChainId", () => {
  it("prefers x-chain-code resolution when in scope", () => {
    expect(
      pickActiveChainId([DEMO, HBR], DEMO, {
        id: HBR,
        code: "HBR",
        name: "Harborline",
      })
    ).toBe(HBR);
  });

  it("falls back to token chain_id when code not in scope", () => {
    expect(
      pickActiveChainId([DEMO], DEMO, {
        id: HBR,
        code: "HBR",
        name: "Harborline",
      })
    ).toBe(DEMO);
  });
});
