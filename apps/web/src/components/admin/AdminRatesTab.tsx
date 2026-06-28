import { useCallback, useEffect, useState } from "react";
import {
  createAdminPromotion,
  createAdminRatePlan,
  GatewayError,
  getAdminRatePlan,
  listAdminPromotions,
  listAdminRatePlans,
  patchAdminPromotion,
  putAdminRatePlanLosTiers,
  type AdminPromotion,
  type AdminRatePlan,
  type ChainSummary,
} from "../../api/gateway";
import { useGatewayToken } from "../../hooks/useGatewayToken";

type Props = {
  gatewayUrl: string;
  audience: string;
  chains: ChainSummary[];
};

type SubTab = "plans" | "promotions";

export function AdminRatesTab({ gatewayUrl, audience, chains }: Props) {
  const getToken = useGatewayToken(audience);
  const [subTab, setSubTab] = useState<SubTab>("plans");
  const [chainId, setChainId] = useState("");
  const [plans, setPlans] = useState<AdminRatePlan[]>([]);
  const [promos, setPromos] = useState<AdminPromotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planCode, setPlanCode] = useState("");
  const [planLabel, setPlanLabel] = useState("");
  const [planValidFrom, setPlanValidFrom] = useState("2020-01-01");
  const [planMinNights, setPlanMinNights] = useState("3");
  const [planNightly, setPlanNightly] = useState("9000");

  const [promoCode, setPromoCode] = useState("");
  const [promoLabel, setPromoLabel] = useState("");
  const [promoBps, setPromoBps] = useState("500");
  const [promoValidFrom, setPromoValidFrom] = useState("2020-01-01");

  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [tierMin, setTierMin] = useState("");
  const [tierMax, setTierMax] = useState("");
  const [tierRate, setTierRate] = useState("");

  useEffect(() => {
    if (chains.length > 0 && !chainId) setChainId(chains[0]!.id);
  }, [chainId, chains]);

  const load = useCallback(async () => {
    if (!chainId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const [p, pr] = await Promise.all([
        listAdminRatePlans(gatewayUrl, token, chainId),
        listAdminPromotions(gatewayUrl, token, chainId),
      ]);
      setPlans(p.rate_plans ?? []);
      setPromos(pr.promotions ?? []);
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Failed to load rates"
      );
    } finally {
      setLoading(false);
    }
  }, [chainId, gatewayUrl, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chainId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const minN = Number(planMinNights);
      const nightly = Number(planNightly);
      const created = await createAdminRatePlan(gatewayUrl, token, chainId, {
        code: planCode.trim().toUpperCase(),
        label: planLabel.trim() || undefined,
        valid_from: planValidFrom,
        priority: 5,
      });
      if (Number.isInteger(minN) && minN > 0 && Number.isInteger(nightly)) {
        await putAdminRatePlanLosTiers(
          gatewayUrl,
          token,
          created.rate_plan.id,
          [{ min_nights: minN, nightly_rate_cents: nightly }]
        );
      }
      setPlanCode("");
      setPlanLabel("");
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Create rate plan failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chainId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await createAdminPromotion(gatewayUrl, token, chainId, {
        code: promoCode.trim().toUpperCase(),
        label: promoLabel.trim() || undefined,
        discount_percent_bps: Number(promoBps) || 0,
        valid_from: promoValidFrom,
      });
      setPromoCode("");
      setPromoLabel("");
      await load();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Create promotion failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const togglePromo = async (promo: AdminPromotion) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await patchAdminPromotion(gatewayUrl, token, promo.id, {
        active: !promo.active,
      });
      await load();
    } catch (err: unknown) {
      setError(err instanceof GatewayError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const openPlanTiers = async (plan: AdminRatePlan) => {
    setEditingPlanId(plan.id);
    setError(null);
    try {
      const token = await getToken();
      const data = await getAdminRatePlan(gatewayUrl, token, plan.id);
      const tier = data.los_tiers?.[0];
      setTierMin(tier ? String(tier.min_nights) : "3");
      setTierMax(tier?.max_nights != null ? String(tier.max_nights) : "");
      setTierRate(tier ? String(tier.nightly_rate_cents) : "");
    } catch {
      setTierMin("3");
      setTierMax("");
      setTierRate("");
    }
  };

  const saveTiers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlanId) return;
    const minN = Number(tierMin);
    const rate = Number(tierRate);
    if (!Number.isInteger(minN) || minN < 1 || !Number.isInteger(rate)) {
      setError("Tier min nights and nightly rate must be valid integers");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const maxRaw = tierMax.trim();
      const maxN = maxRaw ? Number(maxRaw) : null;
      await putAdminRatePlanLosTiers(gatewayUrl, token, editingPlanId, [
        {
          min_nights: minN,
          max_nights: maxN,
          nightly_rate_cents: rate,
        },
      ]);
      setEditingPlanId(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof GatewayError ? err.message : "Save tiers failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-tab">
      <section className="panel panel-wide">
        <h2 className="section-title">Rates & promotions</h2>
        <p className="muted">
          Rate plans and promos apply on the guest booking site after cache TTL
          (~60s). Test with promo field on <code>/c/:code</code>.
        </p>
        {chains.length === 0 ? (
          <p className="muted">Create a brand first.</p>
        ) : (
          <label className="admin-inline-field">
            Brand
            <select value={chainId} onChange={(e) => setChainId(e.target.value)}>
              {chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="admin-subnav">
          <button
            type="button"
            className={subTab === "plans" ? "admin-subnav-btn active" : "admin-subnav-btn"}
            onClick={() => setSubTab("plans")}
          >
            Rate plans
          </button>
          <button
            type="button"
            className={
              subTab === "promotions" ? "admin-subnav-btn active" : "admin-subnav-btn"
            }
            onClick={() => setSubTab("promotions")}
          >
            Promotions
          </button>
        </div>
      </section>

      {error && (
        <section className="panel panel-wide">
          <p className="error">{error}</p>
        </section>
      )}

      {subTab === "plans" && (
        <>
          <section className="panel panel-wide">
            <h3 className="subsection-title">Rate plans</h3>
            {loading && <p className="muted">Loading…</p>}
            {plans.length === 0 && !loading && (
              <p className="muted">No rate plans for this brand.</p>
            )}
            <ul className="staff-list">
              {plans.map((plan) => (
                <li key={plan.id} className="staff-row">
                  <div className="staff-row-main">
                    <strong>{plan.code}</strong>
                    <span className="staff-meta muted">
                      {plan.label ?? "—"} · from {plan.valid_from}
                      {plan.nightly_rate_cents != null
                        ? ` · flat ${plan.nightly_rate_cents}¢`
                        : " · LOS tiers"}
                    </span>
                  </div>
                  <div className="staff-row-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => void openPlanTiers(plan)}
                    >
                      LOS tiers
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {editingPlanId && (
              <form className="admin-form staff-edit-grants" onSubmit={saveTiers}>
                <h4 className="subsection-title">LOS tiers</h4>
                <label>
                  Min nights
                  <input
                    value={tierMin}
                    onChange={(e) => setTierMin(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Max nights (optional)
                  <input value={tierMax} onChange={(e) => setTierMax(e.target.value)} />
                </label>
                <label>
                  Nightly rate (cents)
                  <input
                    value={tierRate}
                    onChange={(e) => setTierRate(e.target.value)}
                    required
                  />
                </label>
                <div className="staff-edit-actions">
                  <button type="submit" disabled={busy}>
                    Save tiers
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setEditingPlanId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
          <section className="panel panel-wide">
            <form className="admin-form" onSubmit={submitPlan}>
              <h3 className="subsection-title">Create rate plan</h3>
              <label>
                Code
                <input
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value.toUpperCase())}
                  required
                  placeholder="LOS3"
                />
              </label>
              <label>
                Label
                <input value={planLabel} onChange={(e) => setPlanLabel(e.target.value)} />
              </label>
              <label>
                Valid from
                <input
                  type="date"
                  value={planValidFrom}
                  onChange={(e) => setPlanValidFrom(e.target.value)}
                  required
                />
              </label>
              <label>
                First tier min nights
                <input
                  value={planMinNights}
                  onChange={(e) => setPlanMinNights(e.target.value)}
                />
              </label>
              <label>
                First tier nightly (cents)
                <input
                  value={planNightly}
                  onChange={(e) => setPlanNightly(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Create plan + tier
              </button>
            </form>
          </section>
        </>
      )}

      {subTab === "promotions" && (
        <>
          <section className="panel panel-wide">
            <h3 className="subsection-title">Promotions</h3>
            {loading && <p className="muted">Loading…</p>}
            <ul className="staff-list">
              {promos.map((promo) => (
                <li key={promo.id} className="staff-row">
                  <div className="staff-row-main">
                    <strong>{promo.code}</strong>
                    <span className="staff-meta muted">
                      {promo.discount_percent_bps} bps off ·{" "}
                      {promo.active ? "active" : "inactive"}
                    </span>
                  </div>
                  <div className="staff-row-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void togglePromo(promo)}
                    >
                      {promo.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel panel-wide">
            <form className="admin-form" onSubmit={submitPromo}>
              <h3 className="subsection-title">Create promotion</h3>
              <label>
                Code
                <input
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                  required
                  placeholder="SAVE5"
                />
              </label>
              <label>
                Label
                <input value={promoLabel} onChange={(e) => setPromoLabel(e.target.value)} />
              </label>
              <label>
                Discount (basis points, 500 = 5%)
                <input value={promoBps} onChange={(e) => setPromoBps(e.target.value)} />
              </label>
              <label>
                Valid from
                <input
                  type="date"
                  value={promoValidFrom}
                  onChange={(e) => setPromoValidFrom(e.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={busy}>
                Create promotion
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
