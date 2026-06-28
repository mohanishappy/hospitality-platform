const NS = "https://hospitality.app/claims";

export function parseChainIdsFromPayload(
  payload: Record<string, unknown>
): string[] | null {
  const raw = payload[`${NS}/chain_ids`] ?? payload.chain_ids;
  if (raw === undefined || raw === null) return null;
  if (Array.isArray(raw)) {
    const ids = raw.map((v) => String(v).trim()).filter(Boolean);
    return ids.length > 0 ? ids : null;
  }
  if (typeof raw === "string" && raw.trim()) {
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return ids.length > 0 ? ids : null;
  }
  return null;
}

export function parseEnterpriseIdFromPayload(
  payload: Record<string, unknown>
): string | null {
  const raw = payload[`${NS}/enterprise_id`] ?? payload.enterprise_id;
  if (raw === undefined || raw === null) return null;
  return String(raw).trim() || null;
}

export function parseActiveChainIdFromPayload(
  payload: Record<string, unknown>
): string | null {
  const raw = payload[`${NS}/chain_id`] ?? payload.chain_id;
  if (raw === undefined || raw === null) return null;
  return String(raw).trim() || null;
}
