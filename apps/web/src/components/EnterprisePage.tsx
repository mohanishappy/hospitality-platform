import { useEffect, useState } from "react";
import {
  fetchEnterpriseByCode,
  fetchEnterpriseChains,
  type ChainSummary,
} from "../api/gateway";
import { chainPath, enterpriseAdminPath } from "../lib/tenantPath";
import type { AppConfig } from "../config";
import { SiteFooter } from "./SiteFooter";
import { AuthBar } from "./AuthBar";
import {
  AccessClaimsProvider,
  useAccessClaims,
} from "../hooks/useAccessClaims";
import { useAuthReady } from "../hooks/useGatewayToken";
import { useAuth0 } from "@auth0/auth0-react";
import { ReservationsPanel } from "./ReservationsPanel";
import { CalendarPanel } from "./CalendarPanel";
import { PanelErrorBoundary } from "./ErrorBoundary";

type Props = {
  config: AppConfig;
  enterpriseCode: string;
};

function EnterpriseSiteInner({
  config,
  enterpriseCode,
  enterpriseName,
  chains,
}: {
  config: AppConfig;
  enterpriseCode: string;
  enterpriseName: string;
  chains: ChainSummary[];
}) {
  const { isAuthenticated } = useAuth0();
  const { ready } = useAuthReady();
  const { can, isGuestOnly, accessWarning, isManager } = useAccessClaims();

  const showReservations =
    ready && isAuthenticated && can("reservations:read");
  const showCalendar =
    ready && isAuthenticated && can("inventory:read") && !isGuestOnly;

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-brand">
          <a href="/" className="site-brand-link">
            {enterpriseName}
          </a>
        </div>
        <AuthBar audience={config.auth0Audience} />
      </header>

      <main className="site-main">
        <section className="brand-hero">
          <h1>{enterpriseName}</h1>
          <p className="lede">
            Choose a brand to book, or sign in to view reservations across all
            brands.
          </p>
          {isManager && (
            <p>
              <a
                href={enterpriseAdminPath(enterpriseCode)}
                className="admin-portal-link"
              >
                Enterprise admin →
              </a>
            </p>
          )}
        </section>

        <section className="panel panel-wide brand-picker">
          <h2 className="section-title">Our brands</h2>
          {chains.length === 0 ? (
            <p className="muted">No brands available.</p>
          ) : (
            <ul className="brand-list">
              {chains.map((chain) => (
                <li key={chain.id}>
                  <a href={chainPath(chain.code)} className="brand-card">
                    <strong>{chain.name}</strong>
                    <span className="muted">Book a stay →</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {accessWarning && (
          <section className="panel panel-wide">
            <p className="error">{accessWarning}</p>
          </section>
        )}

        {showReservations && (
          <ReservationsPanel
            gatewayUrl={config.gatewayUrl}
            audience={config.auth0Audience}
            guestMode={isGuestOnly}
            defaultChainFilter="all"
          />
        )}

        {showCalendar && (
          <PanelErrorBoundary title="Availability">
            <CalendarPanel
              gatewayUrl={config.gatewayUrl}
              audience={config.auth0Audience}
            />
          </PanelErrorBoundary>
        )}
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}

export function EnterprisePage({ config, enterpriseCode }: Props) {
  const [enterpriseName, setEnterpriseName] = useState(enterpriseCode);
  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchEnterpriseByCode(config.gatewayUrl, enterpriseCode)
      .then((data) => {
        if (!cancelled && data.enterprise?.name) {
          setEnterpriseName(data.enterprise.name);
        }
      })
      .catch(() => {
        /* keep code as fallback */
      });
    void fetchEnterpriseChains(config.gatewayUrl, enterpriseCode)
      .then((data) => {
        if (!cancelled) setChains(data.chains ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load brands");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [config.gatewayUrl, enterpriseCode]);

  return (
    <AccessClaimsProvider
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
    >
      {error && (
        <p className="error enterprise-load-error">{error}</p>
      )}
      <EnterpriseSiteInner
        config={config}
        enterpriseCode={enterpriseCode}
        enterpriseName={enterpriseName}
        chains={chains}
      />
    </AccessClaimsProvider>
  );
}
