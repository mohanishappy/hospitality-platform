import { useCallback, useEffect, useState } from "react";
import { chainPath, parseChainCodeFromPath } from "../lib/chainPath";

export function useChainPath(): {
  chainCode: string | null;
  navigateToChain: (code: string) => void;
} {
  const [chainCode, setChainCode] = useState(() =>
    parseChainCodeFromPath(window.location.pathname)
  );

  useEffect(() => {
    const sync = () => {
      setChainCode(parseChainCodeFromPath(window.location.pathname));
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
  }, []);

  return { chainCode, navigateToChain };
}
