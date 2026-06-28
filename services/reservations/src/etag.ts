import { problem } from "./problem";

export function weakEtag(rowVersion: number): string {
  return `W/"${rowVersion}"`;
}

export function normalizeRowVersion(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  return null;
}

/**
 * Strip one If-Match token to a comparable version string (digits).
 */
function etagTokenValue(token: string): string | null {
  let t = token.trim();
  if (t === "") return null;
  if (t === "*") return "*";
  if (t.toUpperCase().startsWith("W/")) {
    t = t.slice(2).trim();
  }
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    t = t.slice(1, -1);
  } else if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    t = t.slice(1, -1);
  }
  if (t === "*") return "*";
  if (/^\d+$/.test(t)) return t;
  return null;
}

/**
 * Optional optimistic concurrency: no header → ok. Malformed → 400. No match → 412.
 */
export function ifMatchPreconditionResponse(
  rowVersion: number,
  ifMatchHeader: string | undefined
): Response | null {
  if (ifMatchHeader === undefined) {
    return null;
  }
  const trimmed = ifMatchHeader.trim();
  if (trimmed === "") {
    return null;
  }
  const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return problem(400, "Bad Request", "Invalid If-Match header");
  }
  let sawStarOnly = true;
  let anyComparable = false;
  for (const p of parts) {
    const v = etagTokenValue(p);
    if (v === null) {
      return problem(400, "Bad Request", "Invalid If-Match header");
    }
    if (v === "*") {
      continue;
    }
    sawStarOnly = false;
    anyComparable = true;
    if (v === String(rowVersion)) {
      return null;
    }
  }
  if (sawStarOnly) {
    return null;
  }
  if (!anyComparable) {
    return problem(400, "Bad Request", "Invalid If-Match header");
  }
  return problem(
    412,
    "Precondition Failed",
    "If-Match does not match current reservation version"
  );
}
