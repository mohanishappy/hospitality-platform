import { useAuth0 } from "@auth0/auth0-react";

type Props = {
  audience: string;
};

export function AuthBar({ audience: _audience }: Props) {
  const { isAuthenticated, isLoading, error, user, loginWithRedirect, logout } =
    useAuth0();

  const returnTo = window.location.pathname + window.location.search;

  if (isLoading) {
    return <div className="auth-bar auth-bar-compact muted">…</div>;
  }

  if (error) {
    return (
      <div className="auth-bar auth-bar-compact">
        <button
          type="button"
          className="secondary"
          onClick={() => loginWithRedirect({ appState: { returnTo } })}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-bar auth-bar-compact">
        <button
          type="button"
          className="secondary"
          onClick={() => loginWithRedirect({ appState: { returnTo } })}
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="auth-bar auth-bar-compact">
      <span className="auth-bar-user">
        {user?.name ?? user?.email ?? "Account"}
      </span>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          logout({ logoutParams: { returnTo: window.location.origin + returnTo } })
        }
      >
        Sign out
      </button>
    </div>
  );
}
