import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useRef } from "react";

export function useAuthReady() {
  const { isLoading, isAuthenticated, error } = useAuth0();
  return { ready: !isLoading, isAuthenticated, error };
}

/** Stable token getter — safe to omit from effect dependency arrays. */
export function useGatewayToken(audience: string) {
  const { getAccessTokenSilently, isAuthenticated } = useAuth0();
  const authRef = useRef({ getAccessTokenSilently, isAuthenticated, audience });
  authRef.current = { getAccessTokenSilently, isAuthenticated, audience };

  return useCallback(async () => {
    const auth = authRef.current;
    if (!auth.isAuthenticated) {
      throw new Error("Not signed in");
    }
    return auth.getAccessTokenSilently({
      authorizationParams: {
        audience: auth.audience,
        scope: "openid profile email",
      },
      cacheMode: "on",
    });
  }, []);
}
