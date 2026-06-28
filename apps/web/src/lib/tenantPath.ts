const CHAIN_PATH_RE = /^\/c\/([A-Za-z0-9_-]+)\/?$/;
const ENTERPRISE_PATH_RE = /^\/e\/([A-Za-z0-9_-]+)\/?$/;
const ENTERPRISE_ADMIN_RE = /^\/e\/([A-Za-z0-9_-]+)\/admin(?:\/([a-z]+))?\/?$/;
const INVITE_ACCEPT_PATH = /^\/invite\/accept\/?$/;

export type EnterpriseAdminTab =
  | "staff"
  | "brands"
  | "properties"
  | "rates"
  | "availability";

/** Parse tenant code from `/c/:chainCode` (case preserved for display; API uses uppercase). */
export function parseChainCodeFromPath(pathname: string): string | null {
  const match = CHAIN_PATH_RE.exec(pathname);
  return match?.[1] ?? null;
}

export function parseEnterpriseCodeFromPath(pathname: string): string | null {
  if (ENTERPRISE_ADMIN_RE.test(pathname)) return null;
  const match = ENTERPRISE_PATH_RE.exec(pathname);
  return match?.[1] ?? null;
}

export function parseEnterpriseAdminFromPath(pathname: string): {
  enterpriseCode: string;
  tab: EnterpriseAdminTab;
} | null {
  const match = ENTERPRISE_ADMIN_RE.exec(pathname);
  if (!match?.[1]) return null;
  const tabRaw = match[2]?.toLowerCase();
  let tab: EnterpriseAdminTab = "staff";
  if (tabRaw === "brands") tab = "brands";
  else if (tabRaw === "properties") tab = "properties";
  else if (tabRaw === "rates") tab = "rates";
  else if (tabRaw === "availability") tab = "availability";
  return { enterpriseCode: match[1], tab };
}

export function enterpriseAdminPath(
  code: string,
  tab: EnterpriseAdminTab = "staff"
): string {
  const base = `/e/${encodeURIComponent(code.trim())}/admin`;
  return tab === "staff" ? base : `${base}/${tab}`;
}

export function isInviteAcceptPath(pathname: string): boolean {
  return INVITE_ACCEPT_PATH.test(pathname);
}

export function parseInviteTokenFromSearch(search: string): string {
  return new URLSearchParams(search).get("token")?.trim() ?? "";
}

export function chainPath(code: string): string {
  return `/c/${encodeURIComponent(code.trim())}`;
}

export function enterprisePath(code: string): string {
  return `/e/${encodeURIComponent(code.trim())}`;
}
