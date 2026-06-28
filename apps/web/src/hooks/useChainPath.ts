import { useCallback, useEffect, useState } from "react";
import {
  chainPath,
  enterprisePath,
  enterpriseAdminPath,
  parseChainCodeFromPath,
  parseEnterpriseAdminFromPath,
  parseEnterpriseCodeFromPath,
  type EnterpriseAdminTab,
} from "../lib/tenantPath";

function syncPathState(path: string): {
  chainCode: string | null;
  enterpriseCode: string | null;
  adminRoute: ReturnType<typeof parseEnterpriseAdminFromPath>;
} {
  const adminRoute = parseEnterpriseAdminFromPath(path);
  return {
    chainCode: parseChainCodeFromPath(path),
    adminRoute,
    enterpriseCode: adminRoute ? null : parseEnterpriseCodeFromPath(path),
  };
}

/** pushState + popstate so every useTenantPath() instance re-syncs from the URL. */
function pushPath(next: string) {
  if (window.location.pathname !== next) {
    window.history.pushState({}, "", next);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function useTenantPath(): {
  chainCode: string | null;
  enterpriseCode: string | null;
  adminRoute: { enterpriseCode: string; tab: EnterpriseAdminTab } | null;
  navigateToChain: (code: string) => void;
  navigateToEnterprise: (code: string) => void;
  navigateToEnterpriseAdmin: (code: string, tab?: EnterpriseAdminTab) => void;
} {
  const [chainCode, setChainCode] = useState(() =>
    parseChainCodeFromPath(window.location.pathname)
  );
  const [enterpriseCode, setEnterpriseCode] = useState(() =>
    parseEnterpriseCodeFromPath(window.location.pathname)
  );
  const [adminRoute, setAdminRoute] = useState(() =>
    parseEnterpriseAdminFromPath(window.location.pathname)
  );

  const applyPath = useCallback((path: string) => {
    const next = syncPathState(path);
    setChainCode(next.chainCode);
    setAdminRoute(next.adminRoute);
    setEnterpriseCode(next.enterpriseCode);
  }, []);

  useEffect(() => {
    const sync = () => applyPath(window.location.pathname);
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [applyPath]);

  const navigateToChain = useCallback((code: string) => {
    pushPath(chainPath(code));
  }, []);

  const navigateToEnterprise = useCallback((code: string) => {
    pushPath(enterprisePath(code));
  }, []);

  const navigateToEnterpriseAdmin = useCallback(
    (code: string, tab: EnterpriseAdminTab = "staff") => {
      pushPath(enterpriseAdminPath(code, tab));
    },
    []
  );

  return {
    chainCode,
    enterpriseCode,
    adminRoute,
    navigateToChain,
    navigateToEnterprise,
    navigateToEnterpriseAdmin,
  };
}

/** @deprecated Use useTenantPath */
export function useChainPath() {
  const { chainCode, navigateToChain } = useTenantPath();
  return { chainCode, navigateToChain };
}
