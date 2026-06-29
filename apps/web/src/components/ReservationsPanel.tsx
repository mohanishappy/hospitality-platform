import { useAuth0 } from "@auth0/auth0-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
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
import { StatusBadge } from "./shared/StatusBadge";
import { EmptyState } from "./shared/EmptyState";
import { ErrorAlert } from "./shared/ErrorAlert";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldLabel } from "./ui/label";
import { Select } from "./ui/select";
import { Separator } from "./ui/separator";
import { Textarea } from "./ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  gatewayUrl: string;
  audience: string;
  guestMode?: boolean;
  chainCode?: string;
  defaultChainFilter?: "all" | string;
};

const CANCEL_REASONS: { value: CancellationReason; label: string }[] = [
  { value: "guest_request", label: "Guest request" },
  { value: "no_show", label: "No show" },
  { value: "duplicate", label: "Duplicate" },
  { value: "rate_dispute", label: "Rate dispute" },
  { value: "other", label: "Other" },
];

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
    void (async () => {
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
  }, [gatewayUrl, isAuthenticated, isMultiChain, chainIds]);

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
    void (async () => {
      try {
        const token = await getTokenRef.current();
        const data = await fetchHotels(gatewayUrl, token, chainCode);
        if (!cancelled) setHotels(data.hotels ?? []);
      } catch {
        /* optional */
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

  if (!isAuthenticated) return null;

  const title = guestMode ? "My reservations" : "Reservations";

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => void loadList(0, false)}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          {isMultiChain && (
            <Field className="min-w-[10rem]">
              <FieldLabel htmlFor="chain-filter">Brand</FieldLabel>
              <Select
                id="chain-filter"
                value={chainFilter}
                onChange={(e) => setChainFilter(e.target.value)}
              >
                <option value="">All brands</option>
                {chains.map((chain) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field className="min-w-[10rem]">
            <FieldLabel htmlFor="status-filter">Status</FieldLabel>
            <Select
              id="status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </Field>
          {!guestMode && (
            <Field className="min-w-[10rem]">
              <FieldLabel htmlFor="hotel-filter">Hotel</FieldLabel>
              <Select
                id="hotel-filter"
                value={hotelFilter}
                onChange={(e) => setHotelFilter(e.target.value)}
              >
                <option value="">All hotels</option>
                {hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotelOptionLabel(hotel, showChainLabels)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button type="button" disabled={busy} onClick={() => void loadList(0, false)}>
            Apply filters
          </Button>
        </div>

        {error && <ErrorAlert message={error} />}

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div>
            {rows.length === 0 && !busy && (
              <EmptyState
                title={guestMode ? "No stays yet" : "No matches"}
                description={
                  guestMode
                    ? "No upcoming or past stays on this account yet."
                    : "No reservations match these filters."
                }
              />
            )}
            {rows.length > 0 && (
              <ul className="flex list-none flex-col gap-2 p-0">
                {rows.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition-all",
                        selectedId === row.id
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border bg-card/50 hover:border-primary/30"
                      )}
                      onClick={() => void loadDetail(row.id)}
                    >
                      <span className="min-w-0">
                        <strong className="block font-medium">
                          {row.check_in} → {row.check_out}
                        </strong>
                        <span className="text-sm text-muted-foreground">
                          {formatHotelLabel(row.hotel_id, hotelMap, showChainLabels)}
                        </span>
                      </span>
                      <StatusBadge status={row.status} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {hasMore && (
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                disabled={busy}
                onClick={() => void loadList(offset + 20, true)}
              >
                Load more
              </Button>
            )}
          </div>

          {detail && (
            <Card className="border-primary/20 bg-card/80">
              <CardHeader>
                <CardTitle className="text-lg">Reservation detail</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">ID</dt>
                    <dd className="font-mono text-xs">{detail.id}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd>
                      <StatusBadge status={detail.status} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Stay</dt>
                    <dd>
                      {detail.check_in} → {detail.check_out}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Hotel</dt>
                    <dd className="text-right">
                      {formatHotelLabel(detail.hotel_id, hotelMap, showChainLabels)}
                    </dd>
                  </div>
                  {detail.guest && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Guest</dt>
                      <dd className="text-right">
                        {detail.guest.first_name} {detail.guest.last_name} ·{" "}
                        {detail.guest.email}
                      </dd>
                    </div>
                  )}
                  {detail.pricing_snapshot?.total_cents != null && (
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="font-display font-semibold">
                        {formatMoney(
                          detail.pricing_snapshot.total_cents,
                          detail.pricing_snapshot.currency ?? "USD"
                        )}
                      </dd>
                    </div>
                  )}
                </dl>

                <Separator />

                <div className="flex flex-wrap items-end gap-3">
                  {detail.status === "pending" && can("reservations:confirm") && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void runStatusPatch("confirmed")}
                    >
                      Confirm
                    </Button>
                  )}
                  {(detail.status === "pending" ||
                    detail.status === "confirmed") &&
                    can("reservations:cancel") && (
                    <>
                      <Field>
                        <FieldLabel htmlFor="cancel-reason">Cancel reason</FieldLabel>
                        <Select
                          id="cancel-reason"
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
                        </Select>
                      </Field>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void runStatusPatch("cancelled")}
                      >
                        Cancel reservation
                      </Button>
                    </>
                  )}
                </div>

                {can("reservations:notes") && (
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveNotes();
                    }}
                  >
                    <h4 className="font-display font-semibold">Notes</h4>
                    <Field>
                      <FieldLabel htmlFor="guest-note">Guest note</FieldLabel>
                      <Textarea
                        id="guest-note"
                        value={guestNote}
                        onChange={(e) => setGuestNote(e.target.value)}
                        rows={2}
                      />
                    </Field>
                    {isManager && (
                      <Field>
                        <FieldLabel htmlFor="internal-note">Internal note</FieldLabel>
                        <Textarea
                          id="internal-note"
                          value={internalNote}
                          onChange={(e) => setInternalNote(e.target.value)}
                          rows={2}
                        />
                      </Field>
                    )}
                    {!isManager && (
                      <p className="text-sm text-muted-foreground">
                        Internal notes require the <code>manager</code> role.
                      </p>
                    )}
                    <Button type="submit" disabled={busy}>
                      Save notes
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
