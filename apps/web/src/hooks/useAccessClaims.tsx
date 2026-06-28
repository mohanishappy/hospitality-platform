import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchMyChains, GatewayError } from "../api/gateway";
import { decodeJwtPayload, parseRolesFromPayload } from "../lib/claims";
import {
  parseActiveChainIdFromPayload,
  parseChainIdsFromPayload,
  parseEnterpriseIdFromPayload,
} from "../lib/enterpriseClaims";
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
  chainIds: string[] | undefined;
  enterpriseId: string | undefined;
  activeChainId: string | undefined;
  loading: boolean;
  can: (permission: Permission) => boolean;
  isManager: boolean;
  isGuestOnly: boolean;
  isMultiChain: boolean;
  /** Set when enterprise scope lookup fails (e.g. staff not provisioned in DB). */
  accessWarning: string | null;
};

const AccessClaimsContext = createContext<AccessClaimsValue>({
  roles: undefined,
  permissions: undefined,
  chainIds: undefined,
  enterpriseId: undefined,
  activeChainId: undefined,
  loading: true,
  can: () => true,
  isManager: false,
  isGuestOnly: false,
  isMultiChain: false,
  accessWarning: null,
});

export function AccessClaimsProvider({
  audience,
  gatewayUrl,
  children,
}: {
  audience: string;
  gatewayUrl: string;
  children: ReactNode;
}) {
  const value = useAccessClaimsState(audience, gatewayUrl);
  return (
    <AccessClaimsContext.Provider value={value}>
      {children}
    </AccessClaimsContext.Provider>
  );
}

export function useAccessClaims() {
  return useContext(AccessClaimsContext);
}

function useAccessClaimsState(
  audience: string,
  gatewayUrl: string
): AccessClaimsValue {
  const { ready, isAuthenticated } = useAuthReady();
  const getToken = useGatewayToken(audience);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [roles, setRoles] = useState<string[] | null | undefined>(undefined);
  const [chainIds, setChainIds] = useState<string[] | undefined>(undefined);
  const [enterpriseId, setEnterpriseId] = useState<string | undefined>(
    undefined
  );
  const [activeChainId, setActiveChainId] = useState<string | undefined>(
    undefined
  );
  const [resolvingChains, setResolvingChains] = useState(false);
  const [accessWarning, setAccessWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!isAuthenticated) {
      setRoles(undefined);
      setChainIds(undefined);
      setEnterpriseId(undefined);
      setActiveChainId(undefined);
      setResolvingChains(false);
      setAccessWarning(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const payload = decodeJwtPayload(token);
        if (cancelled) return;

        const parsedRoles = parseRolesFromPayload(payload);
        const idsFromToken = parseChainIdsFromPayload(payload);
        const active = parseActiveChainIdFromPayload(payload);
        const entId = parseEnterpriseIdFromPayload(payload) ?? undefined;

        setRoles(parsedRoles);
        setEnterpriseId(entId);
        setActiveChainId(active ?? undefined);
        setAccessWarning(null);

        if (idsFromToken?.length) {
          setChainIds(idsFromToken);
          setResolvingChains(false);
          return;
        }

        if (entId) {
          setResolvingChains(true);
          try {
            const data = await fetchMyChains(gatewayUrl, token);
            const ids = (data.chains ?? []).map((c) => c.id).filter(Boolean);
            if (!cancelled) {
              setChainIds(ids.length > 0 ? ids : undefined);
              if (ids.length === 0 && !isGuestOnlyRole(parsedRoles)) {
                setAccessWarning(
                  "No brand access for this account. Ask a manager to send you a staff invite, or accept a pending invite link."
                );
              }
            }
          } catch (err) {
            if (!cancelled) {
              setChainIds(undefined);
              if (err instanceof GatewayError && err.status === 403) {
                setAccessWarning(
                  err.message ||
                    "Staff account not provisioned or disabled. Accept your invite link or ask a manager for access."
                );
              }
            }
          } finally {
            if (!cancelled) setResolvingChains(false);
          }
          return;
        }

        setChainIds(active ? [active] : undefined);
        setResolvingChains(false);
      } catch {
        if (!cancelled) {
          setRoles(undefined);
          setChainIds(undefined);
          setEnterpriseId(undefined);
          setActiveChainId(undefined);
          setResolvingChains(false);
          setAccessWarning(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, isAuthenticated, ready]);

  const permissions = useMemo(
    () => (roles === undefined ? undefined : effectivePermissions(roles)),
    [roles]
  );

  const loading =
    isAuthenticated && ready && (roles === undefined || resolvingChains);
  const effectiveChainIds =
    chainIds ?? (activeChainId ? [activeChainId] : undefined);

  return {
    roles,
    permissions,
    chainIds: effectiveChainIds,
    enterpriseId,
    activeChainId,
    loading,
    can: (permission: Permission) => canAccess(permissions, permission),
    isManager: hasManagerRole(roles ?? null),
    isGuestOnly: isGuestOnlyRole(roles),
    isMultiChain: (effectiveChainIds?.length ?? 0) > 1,
    accessWarning,
  };
}
