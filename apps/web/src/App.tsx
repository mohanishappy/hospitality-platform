import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { BookingPanel } from "./components/BookingPanel";
import { BrandHeader } from "./components/BrandHeader";
import { CalendarPanel } from "./components/CalendarPanel";
import { EnterprisePage } from "./components/EnterprisePage";
import { PanelErrorBoundary } from "./components/ErrorBoundary";
import { HomePage } from "./components/HomePage";
import { InviteAcceptPage } from "./components/InviteAcceptPage";
import { ReservationsPanel } from "./components/ReservationsPanel";
import { SiteFooter } from "./components/SiteFooter";
import {
  AccessClaimsProvider,
  useAccessClaims,
} from "./hooks/useAccessClaims";
import { useAuthReady } from "./hooks/useGatewayToken";
import { useTenantPath } from "./hooks/useChainPath";
import { fetchChainByCode } from "./api/gateway";
import { consumePostLogoutReturn } from "./lib/authReturn";
import {
  isInviteAcceptPath,
  parseInviteTokenFromSearch,
} from "./lib/tenantPath";
import type { AppConfig } from "./config";
import "./App.css";

type Props = {
  config: AppConfig;
};

function ChainSite({ config, chainCode }: { config: AppConfig; chainCode: string }) {
  const { isAuthenticated } = useAuth0();
  const { ready } = useAuthReady();
  const { can, isGuestOnly, accessWarning } = useAccessClaims();
  const [brandName, setBrandName] = useState(chainCode);
  const [defaultChainId, setDefaultChainId] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    void fetchChainByCode(config.gatewayUrl, chainCode)
      .then((data) => {
        if (!cancelled && data.chain) {
          if (data.chain.name) setBrandName(data.chain.name);
          setDefaultChainId(data.chain.id);
        }
      })
      .catch(() => {
        /* keep chain code as fallback title */
      });
    return () => {
      cancelled = true;
    };
  }, [chainCode, config.gatewayUrl]);

  const showReservations =
    ready && isAuthenticated && can("reservations:read");
  const showCalendar =
    ready && isAuthenticated && can("inventory:read") && !isGuestOnly;

  return (
    <div className="app">
      <BrandHeader
        brandName={brandName}
        audience={config.auth0Audience}
        chainCode={chainCode}
      />

      <main className="site-main">
        <section className="brand-hero">
          <h1>Find your stay</h1>
          <p className="lede">
            Search availability and book directly with {brandName}.
          </p>
        </section>

        <BookingPanel
          gatewayUrl={config.gatewayUrl}
          audience={config.auth0Audience}
          chainCode={chainCode}
        />

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
            chainCode={chainCode}
            defaultChainFilter={defaultChainId ?? "all"}
          />
        )}

        {showCalendar && (
          <PanelErrorBoundary title="Availability">
            <CalendarPanel
              gatewayUrl={config.gatewayUrl}
              audience={config.auth0Audience}
              chainCode={chainCode}
            />
          </PanelErrorBoundary>
        )}
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}

export function App({ config }: Props) {
  const { chainCode, enterpriseCode } = useTenantPath();

  useEffect(() => {
    const path = consumePostLogoutReturn();
    if (path) {
      window.history.replaceState({}, document.title, path);
    }
  }, []);

  if (isInviteAcceptPath(window.location.pathname)) {
    const token = parseInviteTokenFromSearch(window.location.search);
    return <InviteAcceptPage config={config} token={token} />;
  }

  if (enterpriseCode) {
    return <EnterprisePage config={config} enterpriseCode={enterpriseCode} />;
  }

  if (!chainCode) {
    return <HomePage config={config} />;
  }

  return (
    <AccessClaimsProvider audience={config.auth0Audience} gatewayUrl={config.gatewayUrl}>
      <ChainSite config={config} chainCode={chainCode} />
    </AccessClaimsProvider>
  );
}
