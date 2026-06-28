import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import { BookingPanel } from "./components/BookingPanel";
import { BrandHeader } from "./components/BrandHeader";
import { CalendarPanel } from "./components/CalendarPanel";
import { PanelErrorBoundary } from "./components/ErrorBoundary";
import { HomePage } from "./components/HomePage";
import { ReservationsPanel } from "./components/ReservationsPanel";
import { SiteFooter } from "./components/SiteFooter";
import {
  AccessClaimsProvider,
  useAccessClaims,
} from "./hooks/useAccessClaims";
import { useAuthReady } from "./hooks/useGatewayToken";
import { useChainPath } from "./hooks/useChainPath";
import { fetchChainByCode } from "./api/gateway";
import type { AppConfig } from "./config";
import "./App.css";

type Props = {
  config: AppConfig;
};

function ChainSite({ config, chainCode }: { config: AppConfig; chainCode: string }) {
  const { isAuthenticated } = useAuth0();
  const { ready } = useAuthReady();
  const { can, isGuestOnly } = useAccessClaims();
  const [brandName, setBrandName] = useState(chainCode);

  useEffect(() => {
    let cancelled = false;
    void fetchChainByCode(config.gatewayUrl, chainCode)
      .then((data) => {
        if (!cancelled && data.chain?.name) {
          setBrandName(data.chain.name);
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
      <BrandHeader brandName={brandName} audience={config.auth0Audience} />

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

        {showReservations && (
          <ReservationsPanel
            gatewayUrl={config.gatewayUrl}
            audience={config.auth0Audience}
            guestMode={isGuestOnly}
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

export function App({ config }: Props) {
  const { chainCode } = useChainPath();

  if (!chainCode) {
    return <HomePage config={config} />;
  }

  return (
    <AccessClaimsProvider audience={config.auth0Audience}>
      <ChainSite config={config} chainCode={chainCode} />
    </AccessClaimsProvider>
  );
}
