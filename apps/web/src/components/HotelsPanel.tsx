import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useState } from "react";
import { fetchHotels, type HotelSummary } from "../api/gateway";

type Props = {
  gatewayUrl: string;
  audience: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; hotels: HotelSummary[] }
  | { kind: "error"; message: string };

export function HotelsPanel({ gatewayUrl, audience }: Props) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  const loadHotels = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const token = await getAccessTokenSilently({
        authorizationParams: { audience },
      });
      const data = await fetchHotels(gatewayUrl, token);
      setState({ kind: "ok", hotels: data.hotels ?? [] });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Request failed",
      });
    }
  }, [audience, gatewayUrl, getAccessTokenSilently]);

  useEffect(() => {
    if (!isAuthenticated) {
      setState({ kind: "idle" });
      return;
    }
    void loadHotels();
  }, [isAuthenticated, loadHotels]);

  if (!isAuthenticated) {
    return (
      <section className="panel">
        <h2>Hotels</h2>
        <p className="muted">Log in to list hotels for your chain.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Hotels</h2>
        <button type="button" className="secondary" onClick={() => void loadHotels()}>
          Refresh
        </button>
      </div>

      {state.kind === "loading" && <p>Loading hotels…</p>}

      {state.kind === "error" && (
        <p className="error">
          {state.message}
          <br />
          <span className="muted">
            Ensure your token includes claim{" "}
            <code>https://hospitality.app/claims/chain_id</code> (Auth0 Action).
          </span>
        </p>
      )}

      {state.kind === "ok" && state.hotels.length === 0 && (
        <p className="muted">No hotels found for this chain.</p>
      )}

      {state.kind === "ok" && state.hotels.length > 0 && (
        <ul className="hotel-list">
          {state.hotels.map((hotel) => (
            <li key={hotel.id}>
              <strong>{hotel.name}</strong>
              <span className="muted"> · {hotel.code}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
