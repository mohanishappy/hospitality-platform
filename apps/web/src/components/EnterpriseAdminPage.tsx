import { useCallback, useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import {
  fetchEnterpriseByCode,
  fetchEnterpriseChains,
  type ChainSummary,
} from "../api/gateway";
import type { AppConfig } from "../config";
import {
  AccessClaimsProvider,
  useAccessClaims,
} from "../hooks/useAccessClaims";
import { useAuthReady } from "../hooks/useGatewayToken";
import { useTenantPath } from "../hooks/useChainPath";
import { formatRolesLabel } from "../lib/claims";
import {
  enterpriseAdminPath,
  enterprisePath,
  type EnterpriseAdminTab,
} from "../lib/tenantPath";
import { AuthBar } from "./AuthBar";
import { AdminAvailabilityTab } from "./admin/AdminAvailabilityTab";
import { AdminBrandsTab } from "./admin/AdminBrandsTab";
import { AdminPropertiesTab } from "./admin/AdminPropertiesTab";
import { AdminRatesTab } from "./admin/AdminRatesTab";
import { AdminStaffTab } from "./admin/AdminStaffTab";
import { PanelErrorBoundary } from "./ErrorBoundary";
import { AdminSidebar, OpsShell } from "./layout/OpsShell";
import { PageHeader } from "./layout/PageHeader";
import { ErrorAlert } from "./shared/ErrorAlert";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

type Props = {
  config: AppConfig;
  enterpriseCode: string;
  tab: EnterpriseAdminTab;
};

function AdminShell({
  config,
  enterpriseCode,
  tab,
  enterpriseName,
  chains,
  reloadChains,
}: Props & {
  enterpriseName: string;
  chains: ChainSummary[];
  reloadChains: () => void;
}) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth0();
  const { ready } = useAuthReady();
  const {
    isManager,
    enterpriseId,
    roles,
    loading: claimsLoading,
  } = useAccessClaims();
  const { navigateToEnterpriseAdmin, navigateToEnterprise } = useTenantPath();

  const loading = authLoading || (isAuthenticated && ready && claimsLoading);

  const getHref = (t: EnterpriseAdminTab) => enterpriseAdminPath(enterpriseCode, t);

  return (
    <OpsShell
      brandName={enterpriseName}
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
      badge="Admin"
      headerActions={
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigateToEnterprise(enterpriseCode)}
        >
          ← Staff portal
        </Button>
      }
      sidebar={
        <AdminSidebar
          enterpriseCode={enterpriseCode}
          tab={tab}
          getHref={getHref}
          onNavigate={(t) => navigateToEnterpriseAdmin(enterpriseCode, t)}
        />
      }
    >
      {loading && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Checking access…
        </p>
      )}

      {!loading && !isAuthenticated && (
        <Card>
          <CardContent className="space-y-4 p-8">
            <PageHeader
              title="Enterprise admin"
              description="Sign in with a manager account to continue."
            />
            <AuthBar audience={config.auth0Audience} />
          </CardContent>
        </Card>
      )}

      {!loading && isAuthenticated && !isManager && (
        <Card>
          <CardContent className="space-y-4 p-8">
            <PageHeader title="Manager access required" />
            <ErrorAlert message="Your account does not have the manager role for this enterprise." />
            <dl className="kv text-sm">
              <div>
                <dt>Signed in as</dt>
                <dd>{user?.email ?? "—"}</dd>
              </div>
              <div>
                <dt>Token roles</dt>
                <dd>{formatRolesLabel(roles)}</dd>
              </div>
              <div>
                <dt>Enterprise scope</dt>
                <dd>{enterpriseId ?? "none"}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              After staff onboarding, roles come from{" "}
              <code className="rounded bg-secondary px-1">inventory.staff_member</code>{" "}
              via the Auth0 Post Login Action. Sign out and sign in again after accepting
              an invite.
            </p>
            <Button asChild variant="secondary">
              <a href={enterprisePath(enterpriseCode)}>← Back to {enterpriseName}</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && isAuthenticated && isManager && !enterpriseId && (
        <ErrorAlert message="Your token has no enterprise scope. Re-login after accepting a staff invite or contact support." />
      )}

      {!loading && isAuthenticated && isManager && enterpriseId && (
        <>
          <div className="md:hidden">
            <nav
              className="mb-4 flex gap-1 overflow-x-auto pb-2"
              aria-label="Enterprise admin"
            >
              {(
                [
                  ["staff", "Staff"],
                  ["brands", "Brands"],
                  ["properties", "Properties"],
                  ["rates", "Rates"],
                  ["availability", "Availability"],
                ] as const
              ).map(([id, label]) => (
                <a
                  key={id}
                  href={getHref(id)}
                  className={
                    tab === id ? "admin-nav-link active shrink-0" : "admin-nav-link shrink-0"
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    navigateToEnterpriseAdmin(enterpriseCode, id);
                  }}
                >
                  {label}
                </a>
              ))}
            </nav>
          </div>

          {tab === "staff" && (
            <PanelErrorBoundary title="Staff admin">
              <AdminStaffTab
                gatewayUrl={config.gatewayUrl}
                audience={config.auth0Audience}
                chains={chains}
              />
            </PanelErrorBoundary>
          )}
          {tab === "brands" && (
            <PanelErrorBoundary title="Brands admin">
              <AdminBrandsTab
                gatewayUrl={config.gatewayUrl}
                audience={config.auth0Audience}
                chains={chains}
                onChainsChange={reloadChains}
              />
            </PanelErrorBoundary>
          )}
          {tab === "properties" && (
            <PanelErrorBoundary title="Properties admin">
              <AdminPropertiesTab
                gatewayUrl={config.gatewayUrl}
                audience={config.auth0Audience}
                chains={chains}
              />
            </PanelErrorBoundary>
          )}
          {tab === "rates" && (
            <PanelErrorBoundary title="Rates admin">
              <AdminRatesTab
                gatewayUrl={config.gatewayUrl}
                audience={config.auth0Audience}
                chains={chains}
              />
            </PanelErrorBoundary>
          )}
          {tab === "availability" && (
            <PanelErrorBoundary title="Availability admin">
              <AdminAvailabilityTab
                gatewayUrl={config.gatewayUrl}
                audience={config.auth0Audience}
                chains={chains}
              />
            </PanelErrorBoundary>
          )}
        </>
      )}
    </OpsShell>
  );
}

export function EnterpriseAdminPage({ config, enterpriseCode, tab }: Props) {
  const [enterpriseName, setEnterpriseName] = useState(enterpriseCode);
  const [chains, setChains] = useState<ChainSummary[]>([]);

  const reloadChains = useCallback(() => {
    void fetchEnterpriseChains(config.gatewayUrl, enterpriseCode)
      .then((data) => setChains(data.chains ?? []))
      .catch(() => setChains([]));
  }, [config.gatewayUrl, enterpriseCode]);

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
      .catch(() => {
        if (!cancelled) setChains([]);
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
      <AdminShell
        config={config}
        enterpriseCode={enterpriseCode}
        tab={tab}
        enterpriseName={enterpriseName}
        chains={chains}
        reloadChains={reloadChains}
      />
    </AccessClaimsProvider>
  );
}
