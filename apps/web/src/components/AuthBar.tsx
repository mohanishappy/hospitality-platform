import { useAuth0 } from "@auth0/auth0-react";

type Props = {
  audience: string;
};

export function AuthBar({ audience }: Props) {
  const { isAuthenticated, isLoading, user, loginWithRedirect, logout } =
    useAuth0();

  if (isLoading) {
    return <div className="auth-bar muted">Checking session…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-bar">
        <p>Sign in to load hotels for your chain.</p>
        <button type="button" onClick={() => loginWithRedirect()}>
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="auth-bar">
      <div>
        <strong>{user?.name ?? user?.email ?? "Signed in"}</strong>
        <span className="muted"> · audience {audience}</span>
      </div>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          logout({ logoutParams: { returnTo: window.location.origin } })
        }
      >
        Log out
      </button>
    </div>
  );
}
