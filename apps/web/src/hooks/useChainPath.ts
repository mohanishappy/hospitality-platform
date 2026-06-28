import { useCallback, useEffect, useState } from "react";
import {
  chainPath,
  enterprisePath,
  parseChainCodeFromPath,
  parseEnterpriseCodeFromPath,
} from "../lib/tenantPath";

export function useTenantPath(): {
  chainCode: string | null;
  enterpriseCode: string | null;
  navigateToChain: (code: string) => void;
  navigateToEnterprise: (code: string) => void;
} {
  const [chainCode, setChainCode] = useState(() =>
    parseChainCodeFromPath(window.location.pathname)
  );
  const [enterpriseCode, setEnterpriseCode] = useState(() =>
    parseEnterpriseCodeFromPath(window.location.pathname)
  );

  useEffect(() => {
    const sync = () => {
      setChainCode(parseChainCodeFromPath(window.location.pathname));
      setEnterpriseCode(parseEnterpriseCodeFromPath(window.location.pathname));
    };
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
  }, []);

  const navigateToEnterprise = useCallback((code: string) => {
    const next = enterprisePath(code);
    if (window.location.pathname !== next) {
      window.history.pushState({}, "", next);
    }
    setEnterpriseCode(parseEnterpriseCodeFromPath(next));
    setChainCode(null);
  }, []);

  return { chainCode, enterpriseCode, navigateToChain, navigateToEnterprise };
}

/** @deprecated Use useTenantPath */
export function useChainPath() {
  const { chainCode, navigateToChain } = useTenantPath();
  return { chainCode, navigateToChain };
}
