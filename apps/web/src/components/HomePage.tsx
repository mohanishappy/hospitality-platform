import { useEffect, useState } from "react";
import {
  fetchEnterpriseChains,
  fetchEnterprises,
  type ChainSummary,
  type EnterpriseSummary,
} from "../api/gateway";
import { chainPath, enterprisePath } from "../lib/tenantPath";
import type { AppConfig } from "../config";
import { SiteFooter } from "./SiteFooter";

type Props = {
  config: AppConfig;
};

type EnterpriseGroup = {
  enterprise: EnterpriseSummary;
  chains: ChainSummary[];
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; groups: EnterpriseGroup[] }
  | { kind: "error"; message: string };

export function HomePage({ config }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const entData = await fetchEnterprises(config.gatewayUrl);
        const enterprises = entData.enterprises ?? [];
        const groups = await Promise.all(
          enterprises.map(async (enterprise) => {
            const chainData = await fetchEnterpriseChains(
              config.gatewayUrl,
              enterprise.code
            );
            return {
              enterprise,
              chains: chainData.chains ?? [],
            };
          })
        );
        if (!cancelled) setState({ kind: "ok", groups });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config.gatewayUrl]);

  return (
    <div className="app">
      <header className="site-header site-header-home">
        <div className="site-brand">
          <span className="site-brand-link">Book a stay</span>
        </div>
      </header>

      <main className="site-main">
        <section className="brand-hero">
          <h1>Where would you like to stay?</h1>
          <p className="lede">
            Browse our hotel groups and brands to check availability and reserve
            your room.
          </p>
        </section>

        <section className="panel panel-wide brand-picker">
          {state.kind === "loading" && <p className="muted">Loading…</p>}
          {state.kind === "error" && <p className="error">{state.message}</p>}
          {state.kind === "ok" && state.groups.length === 0 && (
            <p className="muted">No properties available right now.</p>
          )}
          {state.kind === "ok" &&
            state.groups.map((group) => (
              <div key={group.enterprise.id} className="enterprise-group">
                <div className="enterprise-group-head">
                  <h2>
                    <a href={enterprisePath(group.enterprise.code)}>
                      {group.enterprise.name}
                    </a>
                  </h2>
                  <a
                    href={enterprisePath(group.enterprise.code)}
                    className="muted enterprise-hub-link"
                  >
                    Enterprise hub →
                  </a>
                </div>
                <ul className="brand-list">
                  {group.chains.map((chain) => (
                    <li key={chain.id}>
                      <a href={chainPath(chain.code)} className="brand-card">
                        <strong>{chain.name}</strong>
                        <span className="muted">View availability →</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}
