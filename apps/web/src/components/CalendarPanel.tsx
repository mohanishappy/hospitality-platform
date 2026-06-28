import { useAuth0 } from "@auth0/auth0-react";
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
    (async () => {
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
    (async () => {
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
  }, [gatewayUrl, isAuthenticated, selectedHotelId]);

  useEffect(() => {
    if (!isAuthenticated || !selectedHotelId || !selectedRoomTypeId) {
      setDays([]);
      return;
    }

    let cancelled = false;
    (async () => {
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
  ]);

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <section className="panel panel-wide">
      <div className="panel-head">
        <h2>Availability</h2>
        <div className="calendar-nav">
          <button
            type="button"
            className="secondary"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
          >
            ←
          </button>
          <span className="calendar-title">{range.label}</span>
          <button
            type="button"
            className="secondary"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
          >
            →
          </button>
        </div>
      </div>

      <div className="calendar-filters">
        <label>
          Hotel
          <select
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
          </select>
        </label>
        <label>
          Room type
          <select
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
          </select>
        </label>
      </div>

      {hotels.length === 0 && !error && !busy && (
        <p className="muted">No hotels available for your chain.</p>
      )}
      {selectedHotelId && roomTypes.length === 0 && !error && !busy && (
        <p className="muted">No room types for this hotel.</p>
      )}

      {error && <p className="error">{error}</p>}
      {busy && <p className="muted">Loading calendar…</p>}

      <div className="calendar-grid" aria-label={`Calendar for ${range.label}`}>
        {WEEKDAYS.map((name) => (
          <div key={name} className="calendar-weekday">
            {name}
          </div>
        ))}
        {gridCells.map((cell, index) => {
          if (!cell) {
            return <div key={`pad-${index}`} className="calendar-cell empty" />;
          }
          const key = dayKey(cell);
          const day = dayMap.get(key);
          const bookable = day?.bookable ?? false;
          const remaining = day?.remaining_units;

          return (
            <div
              key={key}
              className={`calendar-cell ${bookable ? "bookable" : "sold-out"}`}
              title={
                day
                  ? `${key}: ${remaining ?? "?"} remaining, occupancy ${day.occupancy ?? 0}, blocked ${day.units_blocked ?? 0}, holds ${day.soft_hold_units ?? 0}`
                  : key
              }
            >
              <span className="calendar-day-num">{cell.getDate()}</span>
              {day && (
                <span className="calendar-day-meta">
                  {remaining ?? "—"} left
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="muted calendar-legend">
        Green = bookable · Gray = sold out or blocked · Hover a day for occupancy
        details.
      </p>
    </section>
  );
}
