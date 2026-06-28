import type { ChainSummary } from "../../api/gateway";
import { chainPath } from "../../lib/tenantPath";

type Props = {
  chains: ChainSummary[];
};

export function AdminBrandsTab({ chains }: Props) {
  return (
    <div className="admin-tab">
      <section className="panel panel-wide">
        <h2 className="section-title">Brands</h2>
        <p className="muted">
          Create and edit brands via the API (Phase 9F) — coming to this UI
          soon. For now, managers can view brands and open booking sites.
        </p>
        {chains.length === 0 ? (
          <p className="muted">No brands in this enterprise.</p>
        ) : (
          <ul className="brand-list">
            {chains.map((chain) => (
              <li key={chain.id}>
                <a href={chainPath(chain.code)} className="brand-card">
                  <strong>{chain.name}</strong>
                  <span className="muted">
                    {chain.code} · Open booking site →
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
