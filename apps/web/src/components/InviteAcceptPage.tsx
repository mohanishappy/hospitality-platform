import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { acceptStaffInvite, GatewayError } from "../api/gateway";
import { AuthBar } from "./AuthBar";
import { SiteFooter } from "./SiteFooter";
import type { AppConfig } from "../config";

type Props = {
  config: AppConfig;
  token: string;
};

type Phase = "idle" | "accepting" | "done" | "error";

export function InviteAcceptPage({ config, token }: Props) {
  const { isAuthenticated, isLoading, getAccessTokenSilently } = useAuth0();
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !token.trim()) return;
    if (phase !== "idle") return;

    let cancelled = false;
    setPhase("accepting");
    (async () => {
      try {
        const accessToken = await getAccessTokenSilently({
          authorizationParams: { audience: config.auth0Audience },
        });
        const result = await acceptStaffInvite(
          config.gatewayUrl,
          accessToken,
          token.trim()
        );
        if (!cancelled) {
          setPhase("done");
          setMessage(result.message ?? "Invite accepted.");
        }
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setMessage(
            err instanceof GatewayError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Could not accept invite"
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    config.auth0Audience,
    config.gatewayUrl,
    getAccessTokenSilently,
    isAuthenticated,
    isLoading,
    phase,
    token,
  ]);

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header-inner">
          <span className="brand-mark">Hospitality</span>
          <AuthBar audience={config.auth0Audience} />
        </div>
      </header>

      <main className="site-main">
        <section className="panel panel-wide">
          <h1>Accept staff invite</h1>
          {!token.trim() && (
            <p className="error">Missing invite token in the link.</p>
          )}

          {token.trim() && isLoading && <p className="muted">Loading…</p>}

          {token.trim() && !isLoading && !isAuthenticated && (
            <>
              <p className="lede">
                Sign in with the email address that received the invite, then
                we will link your account.
              </p>
              <AuthBar audience={config.auth0Audience} />
            </>
          )}

          {token.trim() && isAuthenticated && phase === "accepting" && (
            <p className="muted">Accepting invite…</p>
          )}

          {phase === "done" && (
            <>
              <p className="success">{message}</p>
              <p className="lede">
                Sign out and sign in again so your access token includes your
                new enterprise role.
              </p>
              <AuthBar audience={config.auth0Audience} />
            </>
          )}

          {phase === "error" && (
            <>
              <p className="error">{message}</p>
              <p className="lede">
                Confirm you signed in with the invited email, or ask your
                manager for a new link.
              </p>
              <AuthBar audience={config.auth0Audience} />
            </>
          )}
        </section>
      </main>

      <SiteFooter gatewayUrl={config.gatewayUrl} />
    </div>
  );
}
