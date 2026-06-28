const CHAIN_PATH_RE = /^\/c\/([A-Za-z0-9_-]+)\/?$/;
const ENTERPRISE_PATH_RE = /^\/e\/([A-Za-z0-9_-]+)\/?$/;

/** Parse tenant code from `/c/:chainCode` (case preserved for display; API uses uppercase). */
export function parseChainCodeFromPath(pathname: string): string | null {
  const match = CHAIN_PATH_RE.exec(pathname);
  return match?.[1] ?? null;
}

export function parseEnterpriseCodeFromPath(pathname: string): string | null {
  const match = ENTERPRISE_PATH_RE.exec(pathname);
  return match?.[1] ?? null;
}

export function chainPath(code: string): string {
  return `/c/${encodeURIComponent(code.trim())}`;
}

export function enterprisePath(code: string): string {
  return `/e/${encodeURIComponent(code.trim())}`;
}
