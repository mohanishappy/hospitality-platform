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

  useEffect(() => {
    const sync = () => {
      const path = window.location.pathname;
      setChainCode(parseChainCodeFromPath(path));
      setAdminRoute(parseEnterpriseAdminFromPath(path));
      setEnterpriseCode(parseEnterpriseAdminFromPath(path) ? null : parseEnterpriseCodeFromPath(path));
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigateToChain = useCallback((code: string) => {
    const next = chainPath(code);
    if (window.location.pathname !== next) {
      window.history.pushState({}, "", next);
    }
    setChainCode(parseChainCodeFromPath(next));
    setEnterpriseCode(null);
    setAdminRoute(null);
  }, []);

  const navigateToEnterprise = useCallback((code: string) => {
    const next = enterprisePath(code);
    if (window.location.pathname !== next) {
      window.history.pushState({}, "", next);
    }
    setEnterpriseCode(parseEnterpriseCodeFromPath(next));
    setChainCode(null);
    setAdminRoute(null);
  }, []);

  const navigateToEnterpriseAdmin = useCallback(
    (code: string, tab: EnterpriseAdminTab = "staff") => {
      const next = enterpriseAdminPath(code, tab);
      if (window.location.pathname !== next) {
        window.history.pushState({}, "", next);
      }
      setAdminRoute(parseEnterpriseAdminFromPath(next));
      setEnterpriseCode(null);
      setChainCode(null);
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
