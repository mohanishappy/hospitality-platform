export type HealthResponse = {
  ok: boolean;
  service: string;
};

export type ReadinessResponse = HealthResponse & {
  checks?: Record<string, boolean>;
};

export type HotelSummary = {
  id: string;
  name: string;
  code: string;
  chain_id: string;
};

export type HotelsResponse = {
  hotels: HotelSummary[];
};

export class GatewayError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
  }
}

export async function gatewayFetch<T>(
  gatewayUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${gatewayUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === "object" && body !== null && "title" in body
          ? String((body as { title: unknown }).title)
          : res.statusText;
    throw new GatewayError(res.status, detail || `HTTP ${res.status}`);
  }

  return body as T;
}

export function fetchHealth(gatewayUrl: string) {
  return gatewayFetch<HealthResponse>(gatewayUrl, "/health");
}

export function fetchReadiness(gatewayUrl: string) {
  return gatewayFetch<ReadinessResponse>(gatewayUrl, "/health/ready");
}

export function fetchHotels(gatewayUrl: string, accessToken: string) {
  return gatewayFetch<HotelsResponse>(gatewayUrl, "/v1/inventory/hotels", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
