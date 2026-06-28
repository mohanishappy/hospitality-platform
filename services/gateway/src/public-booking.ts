const uuidSegment = "[0-9a-fA-F-]{36}";

const searchRe = /^\/v1\/inventory\/search$/;
const hotelsRe = /^\/v1\/inventory\/hotels$/;
const availabilityRe = new RegExp(
  `^/v1/inventory/hotels/${uuidSegment}/room-types/${uuidSegment}/availability$`
);
const createReservationRe = /^\/v1\/reservations$/;
const createSoftHoldRe = new RegExp(
  `^/v1/inventory/hotels/${uuidSegment}/room-types/${uuidSegment}/soft-holds$`
);
const releaseSoftHoldRe = new RegExp(
  `^/v1/inventory/soft-holds/${uuidSegment}$`
);
const listChainsRe = /^\/v1\/inventory\/chains$/;
const chainByCodeRe = /^\/v1\/inventory\/chains\/[^/]+$/;
const listEnterprisesRe = /^\/v1\/inventory\/enterprises$/;
const enterpriseByCodeRe = /^\/v1\/inventory\/enterprises\/[^/]+$/;
const enterpriseChainsRe = /^\/v1\/inventory\/enterprises\/[^/]+\/chains$/;

/** Routes allowed without Bearer auth when tenant is supplied via `x-chain-code`. */
export function isPublicBookingRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" && listChainsRe.test(path)) return true;
  if (m === "GET" && chainByCodeRe.test(path)) return true;
  if (m === "GET" && listEnterprisesRe.test(path)) return true;
  if (m === "GET" && enterpriseByCodeRe.test(path)) return true;
  if (m === "GET" && enterpriseChainsRe.test(path)) return true;
  if (m === "GET" && searchRe.test(path)) return true;
  if (m === "GET" && hotelsRe.test(path)) return true;
  if (m === "GET" && availabilityRe.test(path)) return true;
  if (m === "POST" && createReservationRe.test(path)) return true;
  if (m === "POST" && createSoftHoldRe.test(path)) return true;
  if (m === "DELETE" && releaseSoftHoldRe.test(path)) return true;
  return false;
}

/** Chain list/lookup does not require `x-chain-code`. */
export function isPublicChainCatalogRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return (
    m === "GET" &&
    (listChainsRe.test(path) ||
      chainByCodeRe.test(path) ||
      listEnterprisesRe.test(path) ||
      enterpriseByCodeRe.test(path) ||
      enterpriseChainsRe.test(path))
  );
}

export function readChainCode(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): string | null {
  const fromHeader = c.req.header("x-chain-code")?.trim();
  if (fromHeader) return fromHeader.toUpperCase();
  const fromQuery = c.req.query("chain_code")?.trim();
  if (fromQuery) return fromQuery.toUpperCase();
  return null;
}
