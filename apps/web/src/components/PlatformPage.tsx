import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createPlatformBootstrapInvite,
  createPlatformEnterprise,
  fetchPlatformEnterprises,
  patchPlatformEnterprise,
  type EnterpriseSummary,
} from "../api/gateway";
import type { AppConfig } from "../config";
import {
  AccessClaimsProvider,
  useAccessClaims,
} from "../hooks/useAccessClaims";
import { useAuthReady, useGatewayToken } from "../hooks/useGatewayToken";
import { useTenantPath } from "../hooks/useChainPath";
import { formatRolesLabel } from "../lib/claims";
import { hasPlatformOperatorRole } from "../lib/permissions";
import { AuthBar } from "./AuthBar";
import { SiteFooter } from "./SiteFooter";

type Props = {
  config: AppConfig;
};

function PlatformShell({ config }: Props) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth0();
  const { ready } = useAuthReady();
  const getToken = useGatewayToken(config.auth0Audience);
  const { roles, loading: claimsLoading } = useAccessClaims();
  const { navigateToEnterprise } = useTenantPath();

  const [enterprises, setEnterprises] = useState<EnterpriseSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState<Record<string, string>>({});

  const isOperator = hasPlatformOperatorRole(roles ?? null);
  const loading = authLoading || (isAuthenticated && ready && claimsLoading);

  const reload = useCallback(async () => {
    if (!isAuthenticated || !ready) return;
    setError(null);
    try {
      const token = await getToken();
      const data = await fetchPlatformEnterprises(config.gatewayUrl, token);
      setEnterprises(data.enterprises ?? []);
    } catch (err) {
      setEnterprises([]);
      setError(err instanceof Error ? err.message : "Failed to load enterprises");
    }
  }, [config.gatewayUrl, getToken, isAuthenticated, ready]);

  useEffect(() => {
    if (loading || !isAuthenticated || !isOperator) return;
    void reload();
  }, [isAuthenticated, isOperator, loading, reload]);

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      await createPlatformEnterprise(config.gatewayUrl, token, {
        name: newName.trim(),
        code: newCode.trim().toUpperCase(),
      });
      setNewName("");
      setNewCode("");
      setSuccess("Enterprise created.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (ent: EnterpriseSummary) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      await patchPlatformEnterprise(config.gatewayUrl, token, ent.id, {
        active: ent.active === false,
      });
      setSuccess(ent.active === false ? "Enterprise reactivated." : "Enterprise suspended.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const submitInvite = async (enterpriseId: string) => {
    const email = inviteEmail[enterpriseId]?.trim();
    if (!email) {
      setError("Bootstrap manager email is required.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getToken();
      const data = await createPlatformBootstrapInvite(
        config.gatewayUrl,
        token,
        enterpriseId,
        { email }
      );
      setSuccess(`Invite created for ${email}. Share: ${data.invite.accept_url}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-brand">
          <a href="/" className="site-brand-link">
            Platform
          </a>
          <span className="admin-badge">Ops</span>
        </div>
        <AuthBar audience={config.auth0Audience} />
      </header>

      <main className="site-main">
        {loading && <p className="muted">Checking access…</p>}

        {!loading && !isAuthenticated && (
          <section className="panel panel-wide">
            <h1>Platform Portal</h1>
            <p className="lede">Sign in with a platform operator account.</p>
            <AuthBar audience={config.auth0Audience} />
          </section>
        )}

        {!loading && isAuthenticated && !isOperator && (
          <section className="panel panel-wide">
            <h1>Platform access required</h1>
            <p className="error">
              Your account does not have the platform_operator role.
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
            </dl>
            <p className="muted">
              Add your email to <code>inventory.platform_operator</code>, ensure
              the Post Login Action is deployed, then sign out and sign in again.
            </p>
          </section>
        )}

        {!loading && isAuthenticated && isOperator && (
          <>
            <section className="panel panel-wide">
              <h1>Enterprises</h1>
              <p className="lede muted">
                Onboard hotel groups and invite the first all-chain manager. Brand
                creation happens in the Enterprise Admin Portal after accept.
              </p>
              {error && <p className="error">{error}</p>}
              {success && <p className="ok">{success}</p>}

              <form className="admin-form" onSubmit={(e) => void submitCreate(e)}>
                <h2 className="section-title">Create enterprise</h2>
                <div className="guest-fields">
                  <label>
                    Name
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Code
                    <input
                      value={newCode}
                      onChange={(e) =>
                        setNewCode(e.target.value.toUpperCase())
                      }
                      placeholder="ACME"
                      required
                    />
                  </label>
                </div>
                <button type="submit" disabled={busy}>
                  Create enterprise
                </button>
              </form>
            </section>

            <section className="panel panel-wide">
              <h2 className="section-title">All enterprises</h2>
              {enterprises.length === 0 ? (
                <p className="muted">No enterprises yet.</p>
              ) : (
                <ul className="admin-pick-list">
                  {enterprises.map((ent) => (
                    <li key={ent.id} className="admin-pick-item">
                      <div>
                        <strong>{ent.name}</strong>
                        <span className="muted"> · {ent.code}</span>
                        {ent.active === false && (
                          <span className="bad"> · Suspended</span>
                        )}
                      </div>
                      <div className="admin-form admin-form-inline">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => {
                            navigateToEnterprise(ent.code);
                          }}
                        >
                          Open hub →
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => void toggleActive(ent)}
                        >
                          {ent.active === false ? "Reactivate" : "Suspend"}
                        </button>
                        <label>
                          Bootstrap manager
                          <input
                            type="email"
                            value={inviteEmail[ent.id] ?? ""}
                            onChange={(e) =>
                              setInviteEmail((prev) => ({
                                ...prev,
                                [ent.id]: e.target.value,
                              }))
                            }
                            placeholder="manager@tenant.demo"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void submitInvite(ent.id)}
                        >
                          Send invite
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}

export function PlatformPage({ config }: Props) {
  return (
    <AccessClaimsProvider
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
    >
      <PlatformShell config={config} />
    </AccessClaimsProvider>
  );
}
