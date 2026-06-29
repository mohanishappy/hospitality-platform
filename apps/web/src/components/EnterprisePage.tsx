import { ArrowUpRight, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  fetchEnterpriseByCode,
  fetchEnterpriseChains,
  type ChainSummary,
} from "../api/gateway";
import { chainPath, enterpriseAdminPath } from "../lib/tenantPath";
import type { AppConfig } from "../config";
import { GuestShell } from "./layout/GuestShell";
import { HeroBand, PageHeader } from "./layout/PageHeader";
import { ErrorAlert } from "./shared/ErrorAlert";
import { EmptyState } from "./shared/EmptyState";
import {
  AccessClaimsProvider,
  useAccessClaims,
} from "../hooks/useAccessClaims";
import { useAuthReady } from "../hooks/useGatewayToken";
import { ReservationsPanel } from "./ReservationsPanel";
import { CalendarPanel } from "./CalendarPanel";
import { PanelErrorBoundary } from "./ErrorBoundary";
import { Button } from "./ui/button";
import { motion } from "framer-motion";

type Props = {
  config: AppConfig;
  enterpriseCode: string;
};

function EnterpriseSiteInner({
  config,
  enterpriseCode,
  enterpriseName,
  chains,
  loadError,
}: {
  config: AppConfig;
  enterpriseCode: string;
  enterpriseName: string;
  chains: ChainSummary[];
  loadError?: string | null;
}) {
  const { isAuthenticated } = useAuth0();
  const { ready } = useAuthReady();
  const { can, isGuestOnly, accessWarning, isManager } = useAccessClaims();

  const showReservations =
    ready && isAuthenticated && can("reservations:read");
  const showCalendar =
    ready && isAuthenticated && can("inventory:read") && !isGuestOnly;

  return (
    <GuestShell
      brandName={enterpriseName}
      brandHref="/"
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
      wide
      hero={
        <HeroBand
          title={enterpriseName}
          description="Choose a brand to book, or sign in to view reservations across all brands."
        >
          {isManager && (
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <a href={enterpriseAdminPath(enterpriseCode)}>
                <Settings className="h-4 w-4" />
                Enterprise admin
              </a>
            </Button>
          )}
        </HeroBand>
      }
    >
      {loadError && <ErrorAlert message={loadError} />}

      <section className="space-y-4">
        <PageHeader title="Our brands" />
        {chains.length === 0 ? (
          <EmptyState title="No brands yet" description="Brands will appear here when configured." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {chains.map((chain, i) => (
              <motion.li
                key={chain.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <a
                  href={chainPath(chain.code)}
                  className="group flex h-full flex-col rounded-xl border border-border/80 bg-card p-6 transition-all hover:border-primary/40 hover:shadow-lg"
                >
                  <strong className="font-display text-xl font-semibold group-hover:text-primary">
                    {chain.name}
                  </strong>
                  <span className="mt-auto flex items-center gap-1 pt-6 text-sm text-muted-foreground">
                    Book a stay
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </a>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      {accessWarning && <ErrorAlert message={accessWarning} />}

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
    </GuestShell>
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
      .catch(() => undefined);
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
      <EnterpriseSiteInner
        config={config}
        enterpriseCode={enterpriseCode}
        enterpriseName={enterpriseName}
        chains={chains}
        loadError={error}
      />
    </AccessClaimsProvider>
  );
}
