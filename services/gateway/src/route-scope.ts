/** Routes that may proceed with zero resolved brand UUIDs (admin / invite / claims). */
export function allowsEmptyChainScope(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" && path === "/v1/inventory/me/chains") return true;
  if (path.startsWith("/v1/inventory/admin/staff")) return true;
  if (path.startsWith("/v1/inventory/admin/")) return true;
  if (m === "POST" && path === "/v1/inventory/invites/accept") return true;
  if (path.startsWith("/v1/inventory/platform/")) return true;
  return false;
}

export function isActionClaimsRoute(method: string, path: string): boolean {
  return (
    method.toUpperCase() === "GET" &&
    path === "/v1/inventory/internal/staff/claims"
  );
}
