import { useAuth0 } from "@auth0/auth0-react";
import { LogIn, LogOut, User } from "lucide-react";
import { stashPostLogoutReturn } from "../lib/authReturn";
import { Button } from "@/components/ui/button";

type Props = {
  audience: string;
  chainCode?: string;
};

export function AuthBar({ audience, chainCode }: Props) {
  const { isAuthenticated, isLoading, error, user, loginWithRedirect, logout } =
    useAuth0();

  const returnTo = window.location.pathname + window.location.search;

  const login = () =>
    loginWithRedirect({
      appState: { returnTo },
      authorizationParams: {
        audience,
        scope: "openid profile email",
        ...(chainCode?.trim()
          ? { chain_code: chainCode.trim().toUpperCase() }
          : {}),
      },
    });

  if (isLoading) {
    return (
      <span className="text-sm text-muted-foreground" aria-live="polite">
        …
      </span>
    );
  }

  if (error || !isAuthenticated) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => login()}>
        <LogIn className="h-4 w-4" />
        Sign in
      </Button>
    );
  }

  const displayName = user?.name ?? user?.email ?? "Account";

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[10rem] truncate text-sm text-muted-foreground sm:inline">
        <User className="mr-1 inline h-3.5 w-3.5" aria-hidden />
        {displayName}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          stashPostLogoutReturn(returnTo);
          logout({ logoutParams: { returnTo: window.location.origin } });
        }}
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </div>
  );
}
