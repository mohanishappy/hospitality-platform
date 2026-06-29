import { useAuth0 } from "@auth0/auth0-react";
import { motion } from "framer-motion";
import { Calendar, CheckCircle2, Copy, RotateCcw, Search, Tag } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createReservation,
  createSoftHold,
  fetchAvailability,
  fetchHotels,
  fetchSearch,
  releaseSoftHold,
  type AvailabilityQuote,
  type BookingAuth,
  type HotelSummary,
  type InventorySearchHit,
  type ReservationDetail,
  type SoftHoldResult,
} from "../api/gateway";
import { BookingStepper } from "@/components/booking/BookingStepper";
import { SearchResultCards } from "@/components/booking/SearchResultCards";
import { TripSummary } from "@/components/booking/TripSummary";
import { ErrorAlert } from "@/components/shared/ErrorAlert";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useGatewayToken } from "../hooks/useGatewayToken";
import { defaultStayDates, formatMoney } from "../lib/format";
import { useToast } from "@/providers/ToastProvider";

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
      softHold: SoftHoldResult;
      idempotencyKey: string;
      promotionCode: string;
      ratePlanCode: string | null;
    }
  | {
      name: "done";
      hit: InventorySearchHit;
      reservation: ReservationDetail;
      idempotentReplay: boolean;
    };

function HoldExpiryNotice({ expiresAt }: { expiresAt: string }) {
  const [remainingSec, setRemainingSec] = useState(() =>
    Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
  );

  useEffect(() => {
    const tick = () => {
      setRemainingSec(
        Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000))
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (remainingSec <= 0) {
    return (
      <ErrorAlert message="Your hold has expired. Start over and select the room again." />
    );
  }

  const minutes = Math.floor(remainingSec / 60);
  const seconds = remainingSec % 60;
  const label =
    minutes > 0
      ? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
      : `${seconds}s`;
  const urgent = remainingSec < 120;

  return (
    <Badge variant={urgent ? "destructive" : "warning"} className="gap-1">
      Room held — complete within {label}
    </Badge>
  );
}

function QuoteBreakdown({ quote }: { quote: AvailabilityQuote }) {
  const pricing = quote.pricing;
  if (!pricing?.total_cents) {
    return <p className="text-sm text-muted-foreground">Pricing unavailable.</p>;
  }

  const currency = pricing.currency ?? "USD";
  const rows: { label: string; value: string; accent?: boolean }[] = [];

  if (pricing.rate_plan_code) {
    rows.push({ label: "Rate plan", value: pricing.rate_plan_code });
  }
  if (pricing.promotion_code) {
    rows.push({ label: "Promotion", value: pricing.promotion_code });
  }
  if (pricing.nightly_rate_cents != null) {
    rows.push({
      label: "Nightly rate",
      value: formatMoney(pricing.nightly_rate_cents, currency),
    });
  }
  if (pricing.room_subtotal_cents != null) {
    rows.push({
      label: "Room subtotal",
      value: formatMoney(pricing.room_subtotal_cents, currency),
    });
  }
  if ((pricing.discount_cents ?? 0) > 0) {
    rows.push({
      label: "Discount",
      value: `-${formatMoney(pricing.discount_cents!, currency)}`,
    });
  }
  for (const fee of pricing.fee_line_items ?? []) {
    if ((fee.amount_cents ?? 0) > 0) {
      rows.push({
        label: fee.label ?? fee.code ?? "Fee",
        value: formatMoney(fee.amount_cents!, currency),
      });
    }
  }
  if ((pricing.tax_cents ?? 0) > 0) {
    rows.push({
      label: "Tax",
      value: formatMoney(pricing.tax_cents!, currency),
    });
  }
  if (
    (pricing.fee_line_items ?? []).length === 0 &&
    (pricing.fee_fixed_cents ?? 0) > 0
  ) {
    rows.push({
      label: "Fees",
      value: formatMoney(pricing.fee_fixed_cents!, currency),
    });
  }

  return (
    <dl className="space-y-2 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
      <Separator />
      <div className="flex justify-between gap-4 font-display text-lg font-semibold">
        <dt>Total</dt>
        <dd>{formatMoney(pricing.total_cents, currency)}</dd>
      </div>
    </dl>
  );
}

export function BookingPanel({ gatewayUrl, audience, chainCode }: Props) {
  const { isAuthenticated, user } = useAuth0();
  const { toast } = useToast();
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
  const [promotionCode, setPromotionCode] = useState("");
  const [hotelFilterId, setHotelFilterId] = useState("");
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const activeHoldRef = useRef<SoftHoldResult | null>(null);

  const releaseActiveHold = useCallback(async () => {
    const hold = activeHoldRef.current;
    if (!hold) return;
    activeHoldRef.current = null;
    try {
      const auth = await resolveAuth();
      await releaseSoftHold(gatewayUrl, auth, hold.hold_id);
    } catch {
      /* best-effort */
    }
  }, [gatewayUrl, resolveAuth]);

  useEffect(() => () => void releaseActiveHold(), [releaseActiveHold]);

  useEffect(() => {
    if (!user) return;
    setEmail((c) => c || user.email || "");
    setFirstName(
      (c) => c || user.given_name || splitDisplayName(user.name).first
    );
    setLastName(
      (c) => c || user.family_name || splitDisplayName(user.name).last
    );
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const auth = await resolveAuth();
        const data = await fetchHotels(gatewayUrl, auth, chainCode);
        if (!cancelled) setHotels(data.hotels ?? []);
      } catch {
        if (!cancelled) setHotels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainCode, gatewayUrl, resolveAuth]);

  const resetBooking = useCallback(() => {
    void releaseActiveHold();
    setPhase({ name: "search" });
    setError(null);
    setBusy(false);
  }, [releaseActiveHold]);

  const runSearch = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const auth = await resolveAuth();
      const promo = promotionCode.trim();
      const data = await fetchSearch(gatewayUrl, auth, {
        checkIn,
        checkOut,
        hotelIds: hotelFilterId ? [hotelFilterId] : undefined,
        promotionCode: promo || undefined,
      });
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
  }, [checkIn, checkOut, gatewayUrl, hotelFilterId, promotionCode, resolveAuth]);

  const selectHit = useCallback(
    async (hit: InventorySearchHit) => {
      if (!hit.bookable) return;
      setBusy(true);
      setError(null);
      const promo = promotionCode.trim();
      const ratePlanCode = hit.pricing?.rate_plan_code?.trim() || undefined;
      try {
        const auth = await resolveAuth();
        const data = await fetchAvailability(gatewayUrl, auth, {
          hotelId: hit.hotel_id,
          roomTypeId: hit.room_type_id,
          checkIn: hit.check_in,
          checkOut: hit.check_out,
          promotionCode: promo || undefined,
          ratePlanCode,
        });
        const quote = data.availability;
        if (!quote.bookable) {
          setError("This room is no longer bookable for those dates.");
          return;
        }
        const holdData = await createSoftHold(gatewayUrl, auth, {
          hotelId: hit.hotel_id,
          roomTypeId: hit.room_type_id,
          checkIn: hit.check_in,
          checkOut: hit.check_out,
        });
        activeHoldRef.current = holdData.soft_hold;
        setPhase({
          name: "book",
          hit,
          quote,
          softHold: holdData.soft_hold,
          idempotencyKey: crypto.randomUUID(),
          promotionCode: promo,
          ratePlanCode:
            quote.pricing?.rate_plan_code?.trim() ?? ratePlanCode ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Quote failed");
      } finally {
        setBusy(false);
      }
    },
    [gatewayUrl, promotionCode, resolveAuth]
  );

  const submitBooking = useCallback(async () => {
    if (phase.name !== "book") return;
    if (Date.parse(phase.softHold.expires_at) <= Date.now()) {
      setError("Your hold has expired. Start over and select the room again.");
      return;
    }
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
          rate_plan_code: phase.ratePlanCode ?? undefined,
          promotion_code: phase.promotionCode || undefined,
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
      toast("Reservation confirmed!", "success");
      await releaseActiveHold();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBusy(false);
    }
  }, [
    email,
    firstName,
    gatewayUrl,
    lastName,
    phase,
    releaseActiveHold,
    resolveAuth,
    toast,
  ]);

  const stepId = phase.name;

  if (phase.name === "done") {
    const snap = phase.reservation.pricing_snapshot;
    const currency = snap?.currency ?? "USD";
    const guest = phase.reservation.guest;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="space-y-6"
      >
        <BookingStepper current="done" />
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-success/20 to-primary/10 px-6 py-8 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
            <h2 className="mt-4 font-display text-3xl font-semibold">
              Reservation confirmed
            </h2>
            {phase.idempotentReplay && (
              <p className="mt-2 text-sm text-muted-foreground">
                This booking was replayed from a previous request.
              </p>
            )}
          </div>
          <CardContent className="space-y-4 p-6">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Confirmation</dt>
                <dd className="mt-0.5 flex items-center gap-2 font-mono text-xs">
                  {phase.reservation.id}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Copy confirmation ID"
                    onClick={() => {
                      void navigator.clipboard.writeText(phase.reservation.id);
                      toast("Copied to clipboard");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5 capitalize text-success">
                  {phase.reservation.status}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hotel</dt>
                <dd className="mt-0.5 font-medium">{phase.hit.hotel_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Room</dt>
                <dd className="mt-0.5">{phase.hit.room_type_name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Stay</dt>
                <dd className="mt-0.5">
                  {phase.reservation.check_in} → {phase.reservation.check_out}
                </dd>
              </div>
              {guest && (
                <div>
                  <dt className="text-muted-foreground">Guest</dt>
                  <dd className="mt-0.5">
                    {guest.first_name} {guest.last_name} · {guest.email}
                  </dd>
                </div>
              )}
              {snap?.total_cents != null && (
                <div>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="mt-0.5 font-display text-lg font-semibold">
                    {formatMoney(snap.total_cents, currency)}
                  </dd>
                </div>
              )}
            </dl>
            <Button type="button" onClick={resetBooking}>
              <RotateCcw className="h-4 w-4" />
              Book another stay
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <BookingStepper current={stepId} />
        {phase.name !== "search" && (
          <Button type="button" variant="secondary" size="sm" onClick={resetBooking}>
            Start over
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-primary" />
            Search availability
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(phase.name === "search" || phase.name === "results") && (
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void runSearch();
              }}
            >
              <Field>
                <FieldLabel htmlFor="check-in">Check-in</FieldLabel>
                <Input
                  id="check-in"
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="check-out">Check-out</FieldLabel>
                <Input
                  id="check-out"
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  required
                />
              </Field>
              {hotels.length > 1 && (
                <Field>
                  <FieldLabel htmlFor="hotel-filter">Hotel</FieldLabel>
                  <Select
                    id="hotel-filter"
                    value={hotelFilterId}
                    onChange={(e) => setHotelFilterId(e.target.value)}
                  >
                    <option value="">All hotels</option>
                    {hotels.map((hotel) => (
                      <option key={hotel.id} value={hotel.id}>
                        {hotel.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="promo">Promo code</FieldLabel>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="promo"
                    className="pl-9"
                    type="text"
                    value={promotionCode}
                    onChange={(e) =>
                      setPromotionCode(e.target.value.toUpperCase())
                    }
                    placeholder="Optional"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </Field>
              <Button
                type="submit"
                disabled={busy}
                className="sm:col-span-2 lg:col-span-1"
              >
                <Calendar className="h-4 w-4" />
                {busy && phase.name === "search" ? "Searching…" : "Search"}
              </Button>
            </form>
          )}

          {error && <ErrorAlert message={error} />}

          {phase.name === "results" && phase.hits.length === 0 && !busy && (
            <EmptyState
              title="No rooms available"
              description="Try different dates, another hotel, or remove the promo code."
            />
          )}

          {phase.name === "results" && phase.hits.length > 0 && (
            <SearchResultCards
              hits={phase.hits}
              busy={busy}
              onSelect={(hit) => void selectHit(hit)}
            />
          )}

          {phase.name === "book" && (
            <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
              <div className="space-y-6">
                <div>
                  <p className="font-display text-xl font-semibold">
                    {phase.hit.hotel_name}
                  </p>
                  <p className="text-muted-foreground">{phase.hit.room_type_name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {phase.hit.check_in} → {phase.hit.check_out} ({phase.hit.nights}{" "}
                    night{phase.hit.nights === 1 ? "" : "s"})
                  </p>
                </div>

                <QuoteBreakdown quote={phase.quote} />
                <HoldExpiryNotice expiresAt={phase.softHold.expires_at} />

                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitBooking();
                  }}
                >
                  <h3 className="font-display text-lg font-semibold">Guest details</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="first-name">First name</FieldLabel>
                      <Input
                        id="first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        autoComplete="given-name"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="last-name">Last name</FieldLabel>
                      <Input
                        id="last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                        required
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="guest-email">Email</FieldLabel>
                      <Input
                        id="guest-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                      />
                    </Field>
                  </div>
                  {user?.email && isAuthenticated && (
                    <p className="text-sm text-muted-foreground">
                      Signed in as {user.email} — this booking appears under{" "}
                      <strong>My reservations</strong>.
                    </p>
                  )}
                  {!isAuthenticated && (
                    <p className="text-sm text-muted-foreground">
                      Sign in with the same email after booking to manage your stay.
                    </p>
                  )}
                  <Button type="submit" disabled={busy} size="lg">
                    {busy ? "Booking…" : "Confirm booking"}
                  </Button>
                </form>
              </div>

              <div className="hidden lg:block">
                <TripSummary hit={phase.hit} quote={phase.quote} className="sticky top-28" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {phase.name === "book" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-glass/95 p-4 backdrop-blur-xl lg:hidden">
          <TripSummary hit={phase.hit} quote={phase.quote} />
        </div>
      )}
    </div>
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
