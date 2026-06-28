import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchHotels,
  fetchMyChains,
  getReservation,
  listReservations,
  patchReservationNotes,
  patchReservationStatus,
  type CancellationReason,
  type ChainSummary,
  type HotelSummary,
  type ReservationDetail,
  type ReservationListItem,
} from "../api/gateway";
import { useAccessClaims } from "../hooks/useAccessClaims";
import { useGatewayToken } from "../hooks/useGatewayToken";
import { formatMoney } from "../lib/format";
import { formatHotelLabel, hotelOptionLabel } from "../lib/hotelLabel";

type Props = {
  gatewayUrl: string;
  audience: string;
  /** Guest-facing title and simplified filters. */
  guestMode?: boolean;
  /** Brand path — sets active chain for booking-scoped API calls. */
  chainCode?: string;
  /** Initial chain filter: chain UUID or "all". */
  defaultChainFilter?: "all" | string;
};

const CANCEL_REASONS: { value: CancellationReason; label: string }[] = [
  { value: "guest_request", label: "Guest request" },
  { value: "no_show", label: "No show" },
  { value: "duplicate", label: "Duplicate" },
  { value: "rate_dispute", label: "Rate dispute" },
  { value: "other", label: "Other" },
];

function statusClass(status: ReservationDetail["status"]): string {
  if (status === "confirmed") return "ok";
  if (status === "cancelled") return "bad";
  return "muted";
}

export function ReservationsPanel({
  gatewayUrl,
  audience,
  guestMode = false,
  chainCode,
  defaultChainFilter = "all",
}: Props) {
  const { isAuthenticated } = useAuth0();
  const { can, isManager, isMultiChain, chainIds } = useAccessClaims();
  const getToken = useGatewayToken(audience);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [chains, setChains] = useState<ChainSummary[]>([]);
  const [chainFilter, setChainFilter] = useState<string>(
    defaultChainFilter === "all" ? "" : defaultChainFilter
  );
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<
    "" | ReservationDetail["status"]
  >("");
  const [hotelFilter, setHotelFilter] = useState("");
  const [rows, setRows] = useState<ReservationListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [etag, setEtag] = useState<string | null>(null);

  const [guestNote, setGuestNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [cancelReason, setCancelReason] =
    useState<CancellationReason>("guest_request");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showChainLabels = isMultiChain && !chainFilter;

  const hotelMap = useMemo(() => {
    const map = new Map<string, HotelSummary>();
    for (const h of hotels) map.set(h.id, h);
    return map;
  }, [hotels]);

  useEffect(() => {
    if (defaultChainFilter === "all") {
      setChainFilter("");
      return;
    }
    setChainFilter(defaultChainFilter);
  }, [defaultChainFilter]);

  useEffect(() => {
    if (!isAuthenticated || !isMultiChain || !chainIds?.length) {
      setChains([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const data = await fetchMyChains(gatewayUrl, token);
        if (!cancelled) setChains(data.chains ?? []);
      } catch {
        if (!cancelled) setChains([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, isAuthenticated, isMultiChain]);

  const loadList = useCallback(
    async (nextOffset: number, append: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const data = await listReservations(
          gatewayUrl,
          token,
          {
            offset: nextOffset,
            status: statusFilter || undefined,
            hotelId: hotelFilter || undefined,
            chainId: chainFilter || undefined,
          },
          chainCode
        );
        setRows((prev) =>
          append
            ? [...prev, ...(data.reservations ?? [])]
            : (data.reservations ?? [])
        );
        setOffset(nextOffset);
        setHasMore(data.has_more ?? false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load list");
      } finally {
        setBusy(false);
      }
    },
    [chainCode, chainFilter, gatewayUrl, hotelFilter, statusFilter]
  );

  const loadDetail = useCallback(
    async (reservationId: string) => {
      setBusy(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const result = await getReservation(
          gatewayUrl,
          token,
          reservationId,
          chainCode
        );
        const reservation = result.body.reservation;
        setDetail(reservation);
        setEtag(result.etag);
        setGuestNote(reservation.guest_note ?? "");
        setInternalNote(reservation.internal_note ?? "");
        setSelectedId(reservationId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load detail");
      } finally {
        setBusy(false);
      }
    },
    [chainCode, gatewayUrl]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setHotels([]);
      setRows([]);
      setDetail(null);
      setSelectedId(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getTokenRef.current();
        const data = await fetchHotels(gatewayUrl, token, chainCode);
        if (!cancelled) setHotels(data.hotels ?? []);
      } catch {
        /* hotels optional for filters */
      }
      if (!cancelled) void loadList(0, false);
    })();

    return () => {
      cancelled = true;
    };
  }, [chainCode, gatewayUrl, isAuthenticated, loadList]);

  const applyDetail = (reservation: ReservationDetail, nextEtag: string | null) => {
    setDetail(reservation);
    setEtag(nextEtag);
    setGuestNote(reservation.guest_note ?? "");
    setInternalNote(reservation.internal_note ?? "");
    setRows((prev) =>
      prev.map((row) =>
        row.id === reservation.id ? { ...row, ...reservation } : row
      )
    );
  };

  const runStatusPatch = async (status: ReservationDetail["status"]) => {
    if (!detail || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const body =
        status === "cancelled"
          ? { status, cancellation_reason: cancelReason }
          : { status };
      const result = await patchReservationStatus(
        gatewayUrl,
        token,
        selectedId,
        body,
        etag,
        chainCode
      );
      applyDetail(result.body.reservation, result.etag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setBusy(false);
    }
  };

  const saveNotes = async () => {
    if (!detail || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getTokenRef.current();
      const body: { guest_note?: string | null; internal_note?: string | null } =
        { guest_note: guestNote.trim() || null };
      if (isManager) {
        body.internal_note = internalNote.trim() || null;
      }
      const result = await patchReservationNotes(
        gatewayUrl,
        token,
        selectedId,
        body,
        etag,
        chainCode
      );
      applyDetail(result.body.reservation, result.etag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Notes update failed");
    } finally {
      setBusy(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const title = guestMode ? "My reservations" : "Reservations";

  return (
    <section className="panel panel-wide reservations-panel">
      <div className="panel-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() => void loadList(0, false)}
        >
          Refresh
        </button>
      </div>

      <div className="reservations-filters">
        {isMultiChain && (
          <label>
            Brand
            <select
              value={chainFilter}
              onChange={(e) => setChainFilter(e.target.value)}
            >
              <option value="">All brands</option>
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        {!guestMode && (
          <label>
            Hotel
            <select
              value={hotelFilter}
              onChange={(e) => setHotelFilter(e.target.value)}
            >
              <option value="">All hotels</option>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotelOptionLabel(hotel, showChainLabels)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadList(0, false)}
        >
          Apply filters
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="reservations-layout">
        <div className="reservations-list-wrap">
          {rows.length === 0 && !busy && (
            <p className="muted">
              {guestMode
                ? "No upcoming or past stays on this account yet."
                : "No reservations match these filters."}
            </p>
          )}
          {rows.length > 0 && (
            <ul className="reservations-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`reservation-row${selectedId === row.id ? " selected" : ""}`}
                    onClick={() => void loadDetail(row.id)}
                  >
                    <span className="reservation-row-main">
                      <strong>
                        {row.check_in} → {row.check_out}
                      </strong>
                      <span className="muted">
                        {" "}
                        · {formatHotelLabel(row.hotel_id, hotelMap, showChainLabels)}
                      </span>
                    </span>
                    <span className={`reservation-status ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasMore && (
            <button
              type="button"
              className="secondary load-more"
              disabled={busy}
              onClick={() => void loadList(offset + 20, true)}
            >
              Load more
            </button>
          )}
        </div>

        {detail && (
          <div className="reservation-detail">
            <h3>Reservation detail</h3>
            <dl className="kv">
              <div>
                <dt>ID</dt>
                <dd>
                  <code>{detail.id}</code>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className={statusClass(detail.status)}>{detail.status}</dd>
              </div>
              <div>
                <dt>Stay</dt>
                <dd>
                  {detail.check_in} → {detail.check_out}
                </dd>
              </div>
              <div>
                <dt>Hotel</dt>
                <dd>
                  {formatHotelLabel(detail.hotel_id, hotelMap, showChainLabels)}
                </dd>
              </div>
              {detail.guest && (
                <div>
                  <dt>Guest</dt>
                  <dd>
                    {detail.guest.first_name} {detail.guest.last_name} ·{" "}
                    {detail.guest.email}
                  </dd>
                </div>
              )}
              {detail.pricing_snapshot?.total_cents != null && (
                <div>
                  <dt>Total</dt>
                  <dd>
                    {formatMoney(
                      detail.pricing_snapshot.total_cents,
                      detail.pricing_snapshot.currency ?? "USD"
                    )}
                  </dd>
                </div>
              )}
              {detail.cancelled_at && (
                <div>
                  <dt>Cancelled</dt>
                  <dd>
                    {detail.cancelled_at}
                    {detail.cancellation_reason
                      ? ` · ${detail.cancellation_reason}`
                      : ""}
                  </dd>
                </div>
              )}
            </dl>

            <div className="reservation-actions">
              {detail.status === "pending" && can("reservations:confirm") && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runStatusPatch("confirmed")}
                >
                  Confirm
                </button>
              )}
              {(detail.status === "pending" ||
                detail.status === "confirmed") &&
                can("reservations:cancel") && (
                <>
                  <label>
                    Cancel reason
                    <select
                      value={cancelReason}
                      onChange={(e) =>
                        setCancelReason(e.target.value as CancellationReason)
                      }
                    >
                      {CANCEL_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void runStatusPatch("cancelled")}
                  >
                    Cancel reservation
                  </button>
                </>
              )}
            </div>

            {can("reservations:notes") && (
            <form
              className="notes-form"
              onSubmit={(e) => {
                e.preventDefault();
                void saveNotes();
              }}
            >
              <h4>Notes</h4>
              <label>
                Guest note
                <textarea
                  value={guestNote}
                  onChange={(e) => setGuestNote(e.target.value)}
                  rows={2}
                />
              </label>
              {isManager && (
              <label>
                Internal note
                <textarea
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  rows={2}
                />
              </label>
              )}
              {!isManager && (
                <p className="muted notes-hint">
                  Internal notes require the <code>manager</code> role.
                </p>
              )}
              <button type="submit" disabled={busy}>
                Save notes
              </button>
            </form>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
