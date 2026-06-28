import { useEffect, useState } from "react";
import {
  fetchHealth,
  fetchReadiness,
  type HealthResponse,
  type ReadinessResponse,
} from "../api/gateway";

type Props = {
  gatewayUrl: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; health: HealthResponse; ready: ReadinessResponse }
  | { kind: "error"; message: string };

export function HealthPanel({ gatewayUrl }: Props) {
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

  return (
    <section className="panel">
      <h2>Gateway health</h2>
      <p className="muted endpoint">{gatewayUrl}</p>

      {state.kind === "loading" && <p>Loading…</p>}

      {state.kind === "error" && (
        <p className="error">Could not reach gateway: {state.message}</p>
      )}

      {state.kind === "ok" && (
        <dl className="kv">
          <div>
            <dt>/health</dt>
            <dd className={state.health.ok ? "ok" : "bad"}>
              {state.health.ok ? "ok" : "degraded"}
            </dd>
          </div>
          <div>
            <dt>/health/ready</dt>
            <dd className={state.ready.ok ? "ok" : "bad"}>
              {state.ready.ok ? "ready" : "not ready"}
            </dd>
          </div>
          {state.ready.checks &&
            Object.entries(state.ready.checks).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd className={value ? "ok" : "bad"}>{value ? "pass" : "fail"}</dd>
              </div>
            ))}
        </dl>
      )}
    </section>
  );
}
