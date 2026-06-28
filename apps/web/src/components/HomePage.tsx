import { useEffect, useState } from "react";
import { fetchChains, type ChainSummary } from "../api/gateway";
import { chainPath } from "../lib/chainPath";
import type { AppConfig } from "../config";
import { SiteFooter } from "./SiteFooter";

type Props = {
  config: AppConfig;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; chains: ChainSummary[] }
  | { kind: "error"; message: string };

export function HomePage({ config }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void fetchChains(config.gatewayUrl)
      .then((data) => {
        if (!cancelled) {
          setState({ kind: "ok", chains: data.chains ?? [] });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Failed to load brands",
          });
        }
      });
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
            Choose a hotel group to check availability and reserve your room.
          </p>
        </section>

        <section className="panel panel-wide brand-picker">
          {state.kind === "loading" && <p className="muted">Loading…</p>}
          {state.kind === "error" && <p className="error">{state.message}</p>}
          {state.kind === "ok" && state.chains.length === 0 && (
            <p className="muted">No properties available right now.</p>
          )}
          {state.kind === "ok" && state.chains.length > 0 && (
            <ul className="brand-list">
              {state.chains.map((chain) => (
                <li key={chain.id}>
                  <a href={chainPath(chain.code)} className="brand-card">
                    <strong>{chain.name}</strong>
                    <span className="muted">View availability →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}
