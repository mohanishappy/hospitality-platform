import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchReadiness,
  type HealthResponse,
  type ReadinessResponse,
} from "../api/gateway";
import { Badge } from "@/components/ui/badge";

type Props = {
  gatewayUrl: string;
  compact?: boolean;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse; ready: ReadinessResponse }
  | { kind: "error"; message: string };

export function HealthPanel({ gatewayUrl, compact = false }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [health, ready] = await Promise.all([
          fetchHealth(gatewayUrl),
          fetchReadiness(gatewayUrl),
        ]);
        if (!cancelled) {
          setState({ kind: "ok", health, ready });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Request failed",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl]);

  if (compact) {
    if (state.kind === "loading") {
      return (
        <p className="text-center text-xs text-muted-foreground">
          Checking service status…
        </p>
      );
    }
    if (state.kind === "error") {
      return (
        <div className="flex justify-center">
          <Badge variant="destructive">Booking service unavailable</Badge>
        </div>
      );
    }
    const ok = state.health.ok && state.ready.ok;
    return (
      <div className="flex justify-center">
        <Badge variant={ok ? "success" : "destructive"}>
          {ok ? "All systems operational" : "Some services unavailable"}
        </Badge>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <h2 className="font-display text-xl font-semibold">Gateway health</h2>
      <p className="mt-1 break-all text-xs text-muted-foreground">{gatewayUrl}</p>
      {state.kind === "loading" && (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      )}
      {state.kind === "error" && (
        <p className="mt-4 text-sm text-destructive">
          Could not reach gateway: {state.message}
        </p>
      )}
      {state.kind === "ok" && (
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4 border-t border-border pt-2">
            <dt className="font-medium">/health</dt>
            <dd>
              <Badge variant={state.health.ok ? "success" : "destructive"}>
                {state.health.ok ? "ok" : "degraded"}
              </Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-border pt-2">
            <dt className="font-medium">/health/ready</dt>
            <dd>
              <Badge variant={state.ready.ok ? "success" : "destructive"}>
                {state.ready.ok ? "ready" : "not ready"}
              </Badge>
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
