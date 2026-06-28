import { useEffect, useState } from "react";
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
import { AdminBrandsTab } from "./admin/AdminBrandsTab";
import { AdminStaffTab } from "./admin/AdminStaffTab";
import { PanelErrorBoundary } from "./ErrorBoundary";
import { SiteFooter } from "./SiteFooter";

type Props = {
  config: AppConfig;
  enterpriseCode: string;
  tab: EnterpriseAdminTab;
};

const TABS: { id: EnterpriseAdminTab; label: string }[] = [
  { id: "staff", label: "Staff" },
  { id: "brands", label: "Brands" },
  { id: "properties", label: "Properties" },
];

function AdminShell({
  config,
  enterpriseCode,
  tab,
  enterpriseName,
  chains,
}: Props & { enterpriseName: string; chains: ChainSummary[] }) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth0();
  const { ready } = useAuthReady();
  const {
    isManager,
    enterpriseId,
    roles,
    loading: claimsLoading,
  } = useAccessClaims();
  const { navigateToEnterpriseAdmin } = useTenantPath();

  const loading = authLoading || (isAuthenticated && ready && claimsLoading);

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-brand">
          <a href={enterprisePath(enterpriseCode)} className="site-brand-link">
            {enterpriseName}
          </a>
          <span className="admin-badge">Admin</span>
        </div>
        <AuthBar audience={config.auth0Audience} />
      </header>

      <nav className="admin-nav" aria-label="Enterprise admin">
        {TABS.map((t) => (
          <a
            key={t.id}
            href={enterpriseAdminPath(enterpriseCode, t.id)}
            className={tab === t.id ? "admin-nav-link active" : "admin-nav-link"}
            onClick={(e) => {
              e.preventDefault();
              navigateToEnterpriseAdmin(enterpriseCode, t.id);
            }}
          >
            {t.label}
          </a>
        ))}
      </nav>

      <main className="site-main">
        {loading && <p className="muted">Checking access…</p>}

        {!loading && !isAuthenticated && (
          <section className="panel panel-wide">
            <h1>Enterprise admin</h1>
            <p className="lede">Sign in with a manager account to continue.</p>
            <AuthBar audience={config.auth0Audience} />
          </section>
        )}

        {!loading && isAuthenticated && !isManager && (
          <section className="panel panel-wide">
            <h1>Manager access required</h1>
            <p className="error">
              Your account does not have the manager role for this enterprise.
            </p>
            <dl className="quote-breakdown">
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
            <p className="muted">
              After 9B, roles come from <code>inventory.staff_member</code> via
              the Auth0 Post Login Action — not from the email address alone.
              Confirm the 9B Action is deployed,{" "}
              <code>ACTION_CLAIMS_SECRET</code> matches on gateway + inventory +
              Auth0, then <strong>sign out and sign in again</strong>.
            </p>
            <p className="muted">
              <a href={enterprisePath(enterpriseCode)}>← Back to {enterpriseName}</a>
            </p>
          </section>
        )}

        {!loading && isAuthenticated && isManager && !enterpriseId && (
          <section className="panel panel-wide">
            <p className="error">
              Your token has no enterprise scope. Re-login after accepting a
              staff invite or contact support.
            </p>
          </section>
        )}

        {!loading && isAuthenticated && isManager && enterpriseId && (
          <>
            {tab === "staff" && (
              <PanelErrorBoundary title="Staff admin">
                <AdminStaffTab
                  gatewayUrl={config.gatewayUrl}
                  audience={config.auth0Audience}
                  chains={chains}
                />
              </PanelErrorBoundary>
            )}
            {tab === "brands" && <AdminBrandsTab chains={chains} />}
            {tab === "properties" && (
              <section className="panel panel-wide">
                <h2 className="section-title">Properties</h2>
                <p className="muted">
                  Hotel and room type management UI (Phase 10C) is next. Use
                  Postman folder <strong>01c — Admin catalog</strong> until
                  then.
                </p>
              </section>
            )}
          </>
        )}
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}

export function EnterpriseAdminPage({ config, enterpriseCode, tab }: Props) {
  const [enterpriseName, setEnterpriseName] = useState(enterpriseCode);
  const [chains, setChains] = useState<ChainSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchEnterpriseByCode(config.gatewayUrl, enterpriseCode)
      .then((data) => {
        if (!cancelled && data.enterprise?.name) {
          setEnterpriseName(data.enterprise.name);
        }
      })
      .catch(() => {
        /* keep code */
      });
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
      />
    </AccessClaimsProvider>
  );
}
