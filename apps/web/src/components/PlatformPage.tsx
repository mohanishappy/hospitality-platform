import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Building2, Plus } from "lucide-react";
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
import { useToast } from "@/providers/ToastProvider";
import { AuthBar } from "./AuthBar";
import { OpsShell } from "./layout/OpsShell";
import { PageHeader } from "./layout/PageHeader";
import { ErrorAlert } from "./shared/ErrorAlert";
import { SuccessAlert } from "./shared/ErrorAlert";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldLabel } from "./ui/label";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";

type Props = {
  config: AppConfig;
};

function PlatformShell({ config }: Props) {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth0();
  const { ready } = useAuthReady();
  const getToken = useGatewayToken(config.auth0Audience);
  const { roles, loading: claimsLoading } = useAccessClaims();
  const { navigateToEnterprise } = useTenantPath();
  const { toast } = useToast();

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
      toast("Enterprise created", "success");
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
      setSuccess(
        ent.active === false ? "Enterprise reactivated." : "Enterprise suspended."
      );
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
      const msg = `Invite created for ${email}. Share: ${data.invite.accept_url}`;
      setSuccess(msg);
      toast("Invite link created", "success");
      void navigator.clipboard.writeText(data.invite.accept_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <OpsShell
      brandName="Platform"
      brandHref="/"
      audience={config.auth0Audience}
      gatewayUrl={config.gatewayUrl}
      badge="Ops"
    >
      {loading && (
        <p className="text-sm text-muted-foreground">Checking access…</p>
      )}

      {!loading && !isAuthenticated && (
        <Card>
          <CardContent className="space-y-4 p-8">
            <PageHeader
              title="Platform Portal"
              description="Sign in with a platform operator account."
            />
            <AuthBar audience={config.auth0Audience} />
          </CardContent>
        </Card>
      )}

      {!loading && isAuthenticated && !isOperator && (
        <Card>
          <CardContent className="space-y-4 p-8">
            <PageHeader title="Platform access required" />
            <ErrorAlert message="Your account does not have the platform_operator role." />
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Signed in as</dt>
                <dd>{user?.email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Token roles</dt>
                <dd>{formatRolesLabel(roles)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {!loading && isAuthenticated && isOperator && (
        <>
          <PageHeader
            eyebrow="Platform ops"
            title="Enterprises"
            description="Onboard hotel groups and invite the first all-chain manager."
          />

          {error && <ErrorAlert message={error} />}
          {success && <SuccessAlert message={success} />}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Plus className="h-5 w-5" />
                Create enterprise
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid max-w-lg gap-4 sm:grid-cols-2"
                onSubmit={(e) => void submitCreate(e)}
              >
                <Field>
                  <FieldLabel htmlFor="ent-name">Name</FieldLabel>
                  <Input
                    id="ent-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="ent-code">Code</FieldLabel>
                  <Input
                    id="ent-code"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    placeholder="ACME"
                    required
                  />
                </Field>
                <Button type="submit" disabled={busy} className="sm:col-span-2 sm:w-fit">
                  Create enterprise
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="h-5 w-5" />
                All enterprises
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {enterprises.length === 0 ? (
                <p className="text-sm text-muted-foreground">No enterprises yet.</p>
              ) : (
                enterprises.map((ent) => (
                  <div
                    key={ent.id}
                    className="rounded-xl border border-border bg-card/50 p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{ent.name}</strong>
                      <span className="text-sm text-muted-foreground">· {ent.code}</span>
                      {ent.active === false && (
                        <Badge variant="destructive">Suspended</Badge>
                      )}
                    </div>
                    <Separator className="my-4" />
                    <div className="flex flex-wrap items-end gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => navigateToEnterprise(ent.code)}
                      >
                        Open hub →
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void toggleActive(ent)}
                      >
                        {ent.active === false ? "Reactivate" : "Suspend"}
                      </Button>
                      <Field className="min-w-[14rem] flex-1">
                        <FieldLabel htmlFor={`invite-${ent.id}`}>
                          Bootstrap manager
                        </FieldLabel>
                        <Input
                          id={`invite-${ent.id}`}
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
                      </Field>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => void submitInvite(ent.id)}
                      >
                        Send invite
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </OpsShell>
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
