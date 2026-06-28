import type { MiddlewareHandler } from "hono";
import type { GatewayEnv, GatewayVariables } from "./types";

/** Normalize path for metrics (strip trailing slash). */
export function metricPath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export type RequestLogEntry = {
  service: "gateway";
  request_id: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
};

export function buildRequestLogEntry(
  requestId: string,
  method: string,
  path: string,
  status: number,
  durationMs: number
): RequestLogEntry {
  return {
    service: "gateway",
    request_id: requestId,
    method: method.toUpperCase(),
    path: metricPath(path),
    status,
    duration_ms: durationMs,
  };
}

/** Structured request log + optional Workers Analytics Engine data point (FR-O2 / Phase 7D). */
export const withRequestMetrics: MiddlewareHandler<{
  Bindings: GatewayEnv;
  Variables: GatewayVariables;
}> = async (c, next) => {
  const start = Date.now();
  await next();
  const duration_ms = Date.now() - start;
  const status = c.res.status;
  const requestId = c.get("requestId") ?? "";
  const entry = buildRequestLogEntry(
    requestId,
    c.req.method,
    c.req.path,
    status,
    duration_ms
  );
  console.log(JSON.stringify(entry));

  const analytics = c.env.ANALYTICS;
  if (analytics) {
    try {
      analytics.writeDataPoint({
        indexes: [entry.path],
        doubles: [duration_ms, status],
        blobs: [entry.method],
      });
    } catch {
      /* metrics must not break responses */
    }
  }
};
