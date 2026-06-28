import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createReservation,
  fetchAvailability,
  fetchSearch,
  type AvailabilityQuote,
  type BookingAuth,
  type InventorySearchHit,
  type ReservationDetail,
} from "../api/gateway";
import { useGatewayToken } from "../hooks/useGatewayToken";
import { defaultStayDates, formatMoney } from "../lib/format";

type Props = {
  gatewayUrl: string;
  audience: string;
  chainCode: string;
};

type Phase =
  | { name: "search" }
  | {
      name: "results";
      checkIn: string;
      checkOut: string;
      hits: InventorySearchHit[];
    }
  | {
      name: "book";
      hit: InventorySearchHit;
      quote: AvailabilityQuote;
      idempotencyKey: string;
    }
  | {
      name: "done";
      hit: InventorySearchHit;
      reservation: ReservationDetail;
      idempotentReplay: boolean;
    };

function QuoteBreakdown({ quote }: { quote: AvailabilityQuote }) {
  const pricing = quote.pricing;
  if (!pricing?.total_cents) {
    return <p className="muted">Pricing unavailable.</p>;
  }

  const currency = pricing.currency ?? "USD";

  return (
    <dl className="quote-breakdown">
      {pricing.nightly_rate_cents != null && (
        <div>
          <dt>Nightly rate</dt>
          <dd>{formatMoney(pricing.nightly_rate_cents, currency)}</dd>
        </div>
      )}
      {pricing.room_subtotal_cents != null && (
        <div>
          <dt>Room subtotal</dt>
          <dd>{formatMoney(pricing.room_subtotal_cents, currency)}</dd>
        </div>
      )}
      {(pricing.discount_cents ?? 0) > 0 && (
        <div>
          <dt>Promotion</dt>
          <dd>-{formatMoney(pricing.discount_cents!, currency)}</dd>
        </div>
      )}
      {(pricing.tax_cents ?? 0) > 0 && (
        <div>
          <dt>Tax</dt>
          <dd>{formatMoney(pricing.tax_cents!, currency)}</dd>
        </div>
      )}
      {(pricing.fee_fixed_cents ?? 0) > 0 && (
        <div>
          <dt>Fees</dt>
          <dd>{formatMoney(pricing.fee_fixed_cents!, currency)}</dd>
        </div>
      )}
      <div className="quote-total">
        <dt>Total</dt>
        <dd>{formatMoney(pricing.total_cents, currency)}</dd>
      </div>
    </dl>
  );
}

export function BookingPanel({ gatewayUrl, audience, chainCode }: Props) {
  const { isAuthenticated, user } = useAuth0();
  const getToken = useGatewayToken(audience);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const resolveAuth = useCallback(async (): Promise<BookingAuth> => {
    if (isAuthenticated) {
      return {
        kind: "token",
        accessToken: await getTokenRef.current(),
        chainCode,
      };
    }
    return { kind: "chain", chainCode };
  }, [chainCode, isAuthenticated]);
  const defaults = useMemo(() => defaultStayDates(), []);

  const [phase, setPhase] = useState<Phase>({ name: "search" });
  const [checkIn, setCheckIn] = useState(defaults.checkIn);
  const [checkOut, setCheckOut] = useState(defaults.checkOut);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!user) return;
    setEmail((current) => current || user.email || "");
    setFirstName(
      (current) => current || user.given_name || splitDisplayName(user.name).first
    );
    setLastName(
      (current) => current || user.family_name || splitDisplayName(user.name).last
    );
  }, [user]);

  const resetBooking = useCallback(() => {
    setPhase({ name: "search" });
    setError(null);
    setBusy(false);
  }, []);

  const runSearch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const auth = await resolveAuth();
      const data = await fetchSearch(gatewayUrl, auth, { checkIn, checkOut });
      setPhase({
        name: "results",
        checkIn,
        checkOut,
        hits: data.results ?? [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }, [checkIn, checkOut, gatewayUrl, resolveAuth]);

  const selectHit = useCallback(
    async (hit: InventorySearchHit) => {
      if (!hit.bookable) return;
      setBusy(true);
      setError(null);
      try {
        const auth = await resolveAuth();
        const data = await fetchAvailability(gatewayUrl, auth, {
          hotelId: hit.hotel_id,
          roomTypeId: hit.room_type_id,
          checkIn: hit.check_in,
          checkOut: hit.check_out,
        });
        const quote = data.availability;
        if (!quote.bookable) {
          setError("This room is no longer bookable for those dates.");
          return;
        }
        setPhase({
          name: "book",
          hit,
          quote,
          idempotencyKey: crypto.randomUUID(),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Quote failed");
      } finally {
        setBusy(false);
      }
    },
    [gatewayUrl, resolveAuth]
  );

  const submitBooking = useCallback(async () => {
    if (phase.name !== "book") return;
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError("Guest first name, last name, and email are required.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const auth = await resolveAuth();
      const total = phase.quote.pricing?.total_cents;
      const data = await createReservation(
        gatewayUrl,
        auth,
        phase.idempotencyKey,
        {
          hotel_id: phase.hit.hotel_id,
          room_type_id: phase.hit.room_type_id,
          check_in: phase.hit.check_in,
          check_out: phase.hit.check_out,
          expected_total_cents: total,
          guest: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            email: email.trim(),
          },
        }
      );
      setPhase({
        name: "done",
        hit: phase.hit,
        reservation: data.reservation,
        idempotentReplay: data.idempotent_replay,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }, [email, firstName, gatewayUrl, lastName, phase, resolveAuth]);

  if (phase.name === "done") {
    const snap = phase.reservation.pricing_snapshot;
    const currency = snap?.currency ?? "USD";
    const guest = phase.reservation.guest;

    return (
      <section className="panel panel-wide confirmation">
        <h2>Reservation confirmed</h2>
        {phase.idempotentReplay && (
          <p className="muted">This booking was replayed from a previous request.</p>
        )}
        <dl className="kv">
          <div>
            <dt>Confirmation</dt>
            <dd>
              <code>{phase.reservation.id}</code>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="ok">{phase.reservation.status}</dd>
          </div>
          <div>
            <dt>Hotel</dt>
            <dd>{phase.hit.hotel_name}</dd>
          </div>
          <div>
            <dt>Room</dt>
            <dd>{phase.hit.room_type_name}</dd>
          </div>
          <div>
            <dt>Stay</dt>
            <dd>
              {phase.reservation.check_in} → {phase.reservation.check_out}
            </dd>
          </div>
          {guest && (
            <div>
              <dt>Guest</dt>
              <dd>
                {guest.first_name} {guest.last_name} · {guest.email}
              </dd>
            </div>
          )}
          {snap?.total_cents != null && (
            <div>
              <dt>Total</dt>
              <dd>{formatMoney(snap.total_cents, currency)}</dd>
            </div>
          )}
        </dl>
        <div className="actions">
          <button type="button" onClick={resetBooking}>
            Book another stay
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel-wide">
      <div className="panel-head">
        <h2>Find your stay</h2>
        {phase.name !== "search" && (
          <button type="button" className="secondary" onClick={resetBooking}>
            Start over
          </button>
        )}
      </div>

      {(phase.name === "search" || phase.name === "results") && (
        <form
          className="booking-search"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <label>
            Check-in
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              required
            />
          </label>
          <label>
            Check-out
            <input
              type="date"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy && phase.name === "search" ? "Searching…" : "Search"}
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {phase.name === "results" && (
        <>
          {phase.hits.length === 0 && (
            <p className="muted">No bookable room types for those dates.</p>
          )}
          {phase.hits.length > 0 && (
            <ul className="search-results">
              {phase.hits.map((hit) => (
                <li key={`${hit.hotel_id}-${hit.room_type_id}`}>
                  <div>
                    <strong>{hit.hotel_name}</strong>
                    <span className="muted"> · {hit.room_type_name}</span>
                    <div className="muted">
                      {hit.nights} night{hit.nights === 1 ? "" : "s"} ·{" "}
                      {hit.bookable ? (
                        hit.pricing?.total_cents != null ? (
                          formatMoney(
                            hit.pricing.total_cents,
                            hit.pricing.currency ?? "USD"
                          )
                        ) : (
                          "Price on request"
                        )
                      ) : (
                        <span className="bad">Not bookable</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!hit.bookable || busy}
                    onClick={() => void selectHit(hit)}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {phase.name === "book" && (
        <div className="booking-checkout">
          <p>
            <strong>{phase.hit.hotel_name}</strong>
            <span className="muted"> · {phase.hit.room_type_name}</span>
          </p>
          <p className="muted">
            {phase.hit.check_in} → {phase.hit.check_out} ({phase.hit.nights}{" "}
            night{phase.hit.nights === 1 ? "" : "s"})
          </p>

          <QuoteBreakdown quote={phase.quote} />

          <form
            className="guest-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submitBooking();
            }}
          >
            <h3>Guest details</h3>
            <div className="guest-fields">
              <label>
                First name
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  required
                />
              </label>
              <label>
                Last name
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  required
                />
              </label>
              <label className="guest-email">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
              {user?.email && isAuthenticated && (
                <p className="muted notes-hint">
                  Signed in as {user.email} — this booking will appear under{" "}
                  <strong>My reservations</strong>.
                </p>
              )}
              {!isAuthenticated && (
                <p className="muted notes-hint">
                  Sign in with the same email after booking to view or manage
                  your stay online.
                </p>
              )}
            </div>
            <button type="submit" disabled={busy}>
              {busy ? "Booking…" : "Confirm booking"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function splitDisplayName(name: string | undefined): {
  first: string;
  last: string;
} {
  const trimmed = name?.trim();
  if (!trimmed) return { first: "", last: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}
