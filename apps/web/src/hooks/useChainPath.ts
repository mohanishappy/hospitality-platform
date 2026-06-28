import { useCallback, useEffect, useState } from "react";
import {
  chainPath,
  enterprisePath,
  enterpriseAdminPath,
  isPlatformPath,
  parseChainCodeFromPath,
  parseEnterpriseAdminFromPath,
  parseEnterpriseCodeFromPath,
  platformPath,
  type EnterpriseAdminTab,
} from "../lib/tenantPath";

function syncPathState(path: string): {
  chainCode: string | null;
  enterpriseCode: string | null;
  adminRoute: ReturnType<typeof parseEnterpriseAdminFromPath>;
  isPlatformPortal: boolean;
} {
  const adminRoute = parseEnterpriseAdminFromPath(path);
  return {
    chainCode: parseChainCodeFromPath(path),
    adminRoute,
    enterpriseCode: adminRoute ? null : parseEnterpriseCodeFromPath(path),
    isPlatformPortal: isPlatformPath(path),
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
  isPlatformPortal: boolean;
  navigateToChain: (code: string) => void;
  navigateToEnterprise: (code: string) => void;
  navigateToEnterpriseAdmin: (code: string, tab?: EnterpriseAdminTab) => void;
  navigateToPlatform: () => void;
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
  const [isPlatformPortal, setIsPlatformPortal] = useState(() =>
    isPlatformPath(window.location.pathname)
  );

  const applyPath = useCallback((path: string) => {
    const next = syncPathState(path);
    setChainCode(next.chainCode);
    setAdminRoute(next.adminRoute);
    setEnterpriseCode(next.enterpriseCode);
    setIsPlatformPortal(next.isPlatformPortal);
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

  const navigateToPlatform = useCallback(() => {
    pushPath(platformPath());
  }, []);

  return {
    chainCode,
    enterpriseCode,
    adminRoute,
    isPlatformPortal,
    navigateToChain,
    navigateToEnterprise,
    navigateToEnterpriseAdmin,
    navigateToPlatform,
  };
}

/** @deprecated Use useTenantPath */
export function useChainPath() {
  const { chainCode, navigateToChain } = useTenantPath();
  return { chainCode, navigateToChain };
}
