import { useAuth0 } from "@auth0/auth0-react";
import { useEffect, useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { acceptStaffInvite, GatewayError } from "../api/gateway";
import { GuestShell } from "./layout/GuestShell";
import { PageHeader } from "./layout/PageHeader";
import { ErrorAlert } from "./shared/ErrorAlert";
import { SuccessAlert } from "./shared/ErrorAlert";
import { AuthBar } from "./AuthBar";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
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
    void (async () => {
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
    <GuestShell
      brandName="Hospitality"
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
    >
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-6 p-8">
          <PageHeader title="Accept staff invite" />

          <ol className="flex gap-2 text-xs">
            <Badge variant={isAuthenticated ? "success" : "default"}>1. Sign in</Badge>
            <Badge variant={phase === "done" ? "success" : phase === "accepting" ? "default" : "secondary"}>
              2. Accept
            </Badge>
            <Badge variant="secondary">3. Re-login</Badge>
          </ol>

          {!token.trim() && (
            <ErrorAlert message="Missing invite token in the link." />
          )}

          {token.trim() && isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {token.trim() && !isLoading && !isAuthenticated && (
            <>
              <p className="text-muted-foreground">
                Sign in with the email address that received the invite, then we
                will link your account.
              </p>
              <AuthBar audience={config.auth0Audience} />
            </>
          )}

          {token.trim() && isAuthenticated && phase === "accepting" && (
            <p className="text-sm text-muted-foreground">Accepting invite…</p>
          )}

          {phase === "done" && (
            <>
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-12 w-12 text-success" />
                <SuccessAlert message={message ?? "Invite accepted."} />
              </div>
              <p className="text-sm text-muted-foreground">
                <Mail className="mr-1 inline h-4 w-4" />
                Sign out and sign in again so your access token includes your new
                enterprise role.
              </p>
              <AuthBar audience={config.auth0Audience} />
            </>
          )}

          {phase === "error" && (
            <>
              <ErrorAlert message={message ?? "Could not accept invite"} />
              <p className="text-sm text-muted-foreground">
                Confirm you signed in with the invited email, or ask your manager
                for a new link.
              </p>
              <AuthBar audience={config.auth0Audience} />
            </>
          )}
        </CardContent>
      </Card>
    </GuestShell>
  );
}
