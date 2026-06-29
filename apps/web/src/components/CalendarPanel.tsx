import { useAuth0 } from "@auth0/auth0-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCalendar,
  fetchHotels,
  fetchRoomTypes,
  type CalendarDay,
  type HotelSummary,
  type RoomTypeSummary,
} from "../api/gateway";
import { useAccessClaims } from "../hooks/useAccessClaims";
import { useGatewayToken } from "../hooks/useGatewayToken";
import { calendarGridCells, monthRange } from "../lib/format";
import { hotelOptionLabel } from "../lib/hotelLabel";
import { ErrorAlert } from "./shared/ErrorAlert";
import { EmptyState } from "./shared/EmptyState";
import { PanelSkeleton } from "./shared/LoadingBlock";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Field, FieldLabel } from "./ui/label";
import { Select } from "./ui/select";
import { cn } from "@/lib/utils";

type Props = {
  gatewayUrl: string;
  audience: string;
  chainCode?: string;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function CalendarPanel({ gatewayUrl, audience, chainCode }: Props) {
  const { isAuthenticated } = useAuth0();
  const { isMultiChain } = useAccessClaims();
  const getToken = useGatewayToken(audience);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [hotels, setHotels] = useState<HotelSummary[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomTypeSummary[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [roomTypeId, setRoomTypeId] = useState("");
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => monthRange(viewYear, viewMonth),
    [viewMonth, viewYear]
  );
  const gridCells = useMemo(
    () => calendarGridCells(viewYear, viewMonth),
    [viewMonth, viewYear]
  );
  const dayMap = useMemo(() => {
    const map = new Map<string, CalendarDay>();
    for (const day of days) map.set(day.date, day);
    return map;
  }, [days]);

  const selectedHotelId =
    hotelId && hotels.some((h) => h.id === hotelId)
      ? hotelId
      : (hotels[0]?.id ?? "");
  const selectedRoomTypeId =
    roomTypeId && roomTypes.some((rt) => rt.id === roomTypeId)
      ? roomTypeId
      : (roomTypes[0]?.id ?? "");

  useEffect(() => {
    if (!isAuthenticated) {
      setHotels([]);
      setRoomTypes([]);
      setHotelId("");
      setRoomTypeId("");
      setDays([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const token = await getTokenRef.current();
        const data = await fetchHotels(gatewayUrl, token, chainCode);
        if (cancelled) return;
        const list = data.hotels ?? [];
        setHotels(list);
        setHotelId((prev) =>
          prev && list.some((h) => h.id === prev) ? prev : (list[0]?.id ?? "")
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load hotels");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chainCode, gatewayUrl, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || !selectedHotelId) {
      setRoomTypes([]);
      setRoomTypeId("");
      return;
    }

    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const token = await getTokenRef.current();
        const data = await fetchRoomTypes(
          gatewayUrl,
          token,
          selectedHotelId,
          chainCode
        );
        if (cancelled) return;
        const list = data.room_types ?? [];
        setRoomTypes(list);
        setRoomTypeId((prev) =>
          prev && list.some((rt) => rt.id === prev)
            ? prev
            : (list[0]?.id ?? "")
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load room types");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gatewayUrl, isAuthenticated, selectedHotelId, chainCode]);

  useEffect(() => {
    if (!isAuthenticated || !selectedHotelId || !selectedRoomTypeId) {
      setDays([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        const token = await getTokenRef.current();
        const data = await fetchCalendar(
          gatewayUrl,
          token,
          {
            hotelId: selectedHotelId,
            roomTypeId: selectedRoomTypeId,
            from: range.from,
            to: range.to,
          },
          chainCode
        );
        if (!cancelled) setDays(data.days ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load calendar");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    gatewayUrl,
    isAuthenticated,
    range.from,
    range.to,
    selectedHotelId,
    selectedRoomTypeId,
    chainCode,
  ]);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  if (!isAuthenticated) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Availability</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-semibold">
            {range.label}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-4">
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="cal-hotel">Hotel</FieldLabel>
            <Select
              id="cal-hotel"
              value={selectedHotelId}
              onChange={(e) => setHotelId(e.target.value)}
              disabled={hotels.length === 0}
            >
              {hotels.length === 0 ? (
                <option value="">No hotels</option>
              ) : (
                hotels.map((hotel) => (
                  <option key={hotel.id} value={hotel.id}>
                    {hotelOptionLabel(hotel, isMultiChain && !chainCode)}
                  </option>
                ))
              )}
            </Select>
          </Field>
          <Field className="min-w-[12rem] flex-1">
            <FieldLabel htmlFor="cal-room">Room type</FieldLabel>
            <Select
              id="cal-room"
              value={selectedRoomTypeId}
              onChange={(e) => setRoomTypeId(e.target.value)}
              disabled={roomTypes.length === 0 || !selectedHotelId}
            >
              {!selectedHotelId || roomTypes.length === 0 ? (
                <option value="">
                  {!selectedHotelId ? "Select a hotel" : "No room types"}
                </option>
              ) : (
                roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} ({rt.code})
                  </option>
                ))
              )}
            </Select>
          </Field>
        </div>

        {hotels.length === 0 && !error && !busy && (
          <EmptyState title="No hotels" description="No hotels available for your chain." />
        )}
        {selectedHotelId && roomTypes.length === 0 && !error && !busy && (
          <EmptyState title="No room types" description="No room types for this hotel." />
        )}

        {error && <ErrorAlert message={error} />}
        {busy && <PanelSkeleton rows={2} />}

        {!busy && (
          <>
            <div
              className="grid grid-cols-7 gap-1.5 sm:gap-2"
              aria-label={`Calendar for ${range.label}`}
            >
              {WEEKDAYS.map((name) => (
                <div
                  key={name}
                  className="pb-1 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground"
                >
                  {name}
                </div>
              ))}
              {gridCells.map((cell, index) => {
                if (!cell) {
                  return <div key={`pad-${index}`} className="min-h-[3.5rem]" />;
                }
                const key = dayKey(cell);
                const day = dayMap.get(key);
                const bookable = day?.bookable ?? false;
                const remaining = day?.remaining_units;

                return (
                  <div
                    key={key}
                    className={cn(
                      "flex min-h-[3.5rem] flex-col gap-0.5 rounded-lg border p-1.5 text-xs transition-colors sm:p-2",
                      bookable
                        ? "border-success/40 bg-success/10"
                        : "border-border bg-card/40 opacity-80"
                    )}
                    title={
                      day
                        ? `${key}: ${remaining ?? "?"} remaining`
                        : key
                    }
                  >
                    <span className="font-bold">{cell.getDate()}</span>
                    {day && (
                      <span className="text-muted-foreground">
                        {remaining ?? "—"} left
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="success">Bookable</Badge>
              <Badge variant="secondary">Sold out / blocked</Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
