import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { decodeJwtPayload, parseRolesFromPayload } from "../lib/claims";
import {
  canAccess,
  effectivePermissions,
  hasManagerRole,
  isGuestOnlyRole,
  type Permission,
} from "../lib/permissions";
import { useAuthReady, useGatewayToken } from "./useGatewayToken";

type AccessClaimsValue = {
  roles: string[] | null | undefined;
  permissions: Set<Permission> | null | undefined;
  loading: boolean;
  can: (permission: Permission) => boolean;
  isManager: boolean;
  isGuestOnly: boolean;
};

const AccessClaimsContext = createContext<AccessClaimsValue>({
  roles: undefined,
  permissions: undefined,
  loading: true,
  can: () => true,
  isManager: false,
  isGuestOnly: false,
});

export function AccessClaimsProvider({
  audience,
  children,
}: {
  audience: string;
  children: ReactNode;
}) {
  const value = useAccessClaimsState(audience);
  return (
    <AccessClaimsContext.Provider value={value}>
      {children}
    </AccessClaimsContext.Provider>
  );
}

export function useAccessClaims() {
  return useContext(AccessClaimsContext);
}

function useAccessClaimsState(audience: string): AccessClaimsValue {
  const { ready, isAuthenticated } = useAuthReady();
  const getToken = useGatewayToken(audience);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [roles, setRoles] = useState<string[] | null | undefined>(undefined);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      setRoles(undefined);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const payload = decodeJwtPayload(token);
        if (!cancelled) setRoles(parseRolesFromPayload(payload));
      } catch {
        if (!cancelled) setRoles(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, ready]);

  const permissions = useMemo(
    () => (roles === undefined ? undefined : effectivePermissions(roles)),
    [roles]
  );

  const loading = isAuthenticated && ready && roles === undefined;

  return {
    roles,
    permissions,
    loading,
    can: (permission: Permission) => canAccess(permissions, permission),
    isManager: hasManagerRole(roles ?? null),
    isGuestOnly: isGuestOnlyRole(roles),
  };
}
