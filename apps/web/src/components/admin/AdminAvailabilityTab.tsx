import { useCallback, useEffect, useState } from "react";
import {
  createAdminBlock,
  deleteAdminBlock,
  fetchCalendar,
  GatewayError,
  listAdminBlocks,
  listAdminHotels,
  listAdminRoomTypes,
  type AdminHotel,
  type AdminInventoryBlock,
  type AdminRoomType,
  type ChainSummary,
} from "../../api/gateway";
import { useGatewayToken } from "../../hooks/useGatewayToken";

type Props = {
  gatewayUrl: string;
  audience: string;
  chains: ChainSummary[];
};

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

export function AdminAvailabilityTab({ gatewayUrl, audience, chains }: Props) {
  const getToken = useGatewayToken(audience);
  const [chainId, setChainId] = useState("");
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [roomTypes, setRoomTypes] = useState<AdminRoomType[]>([]);
  const [roomTypeId, setRoomTypeId] = useState("");
  const [blocks, setBlocks] = useState<AdminInventoryBlock[]>([]);
  const [calendarNote, setCalendarNote] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [unitsReduced, setUnitsReduced] = useState("1");
  const [blockLabel, setBlockLabel] = useState("");

  useEffect(() => {
    if (chains.length > 0 && !chainId) setChainId(chains[0]!.id);
  }, [chainId, chains]);

  useEffect(() => {
    if (!chainId) {
      setHotels([]);
      setHotelId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const data = await listAdminHotels(gatewayUrl, token, chainId);
        if (cancelled) return;
        const list = data.hotels ?? [];
        setHotels(list);
        setHotelId(list[0]?.id ?? "");
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof GatewayError ? err.message : "Failed to load hotels"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, gatewayUrl, getToken]);

  useEffect(() => {
    if (!hotelId) {
      setRoomTypes([]);
      setRoomTypeId("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const data = await listAdminRoomTypes(gatewayUrl, token, hotelId);
        if (cancelled) return;
        const list = data.room_types ?? [];
        setRoomTypes(list);
        setRoomTypeId(list[0]?.id ?? "");
      } catch {
        if (!cancelled) {
          setRoomTypes([]);
          setRoomTypeId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hotelId, gatewayUrl, getToken]);

  const loadBlocks = useCallback(async () => {
    if (!roomTypeId || !hotelId) return;
    const chainCode = chains.find((c) => c.id === chainId)?.code;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await listAdminBlocks(gatewayUrl, token, roomTypeId);
      setBlocks(data.blocks ?? []);
      const { from, to } = monthRange();
      const cal = await fetchCalendar(
        gatewayUrl,
        token,
        { hotelId, roomTypeId, from, to },
        chainCode
      );
      const days = cal.days?.length ?? 0;
      setCalendarNote(
        days > 0
          ? `Calendar preview: ${days} days (${from} → ${to}). Remaining units reflect blocks after cache TTL.`
          : null
      );
    } catch (err: unknown) {
      setBlocks([]);
      setCalendarNote(null);
      setError(
        err instanceof GatewayError ? err.message : "Failed to load blocks"
      );
    } finally {
      setLoading(false);
    }
  }, [chainId, chains, gatewayUrl, getToken, hotelId, roomTypeId]);

  useEffect(() => {
    if (roomTypeId && hotelId) void loadBlocks();
    else setBlocks([]);
  }, [roomTypeId, hotelId, loadBlocks]);

  const submitBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomTypeId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await createAdminBlock(gatewayUrl, token, roomTypeId, {
        start_date: startDate,
        end_date: endDate,
        units_reduced: Number(unitsReduced) || 1,
        label: blockLabel.trim() || undefined,
      });
      setStartDate("");
      setEndDate("");
      setBlockLabel("");
      await loadBlocks();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Create block failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const removeBlock = async (blockId: string) => {
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await deleteAdminBlock(gatewayUrl, token, blockId);
      await loadBlocks();
    } catch (err: unknown) {
      setError(err instanceof GatewayError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-tab">
      <section className="panel panel-wide">
        <h2 className="section-title">Availability</h2>
        <p className="muted">
          Inventory blocks reduce sellable units on affected nights. Booking
          policies (min/max LOS, CTA/CTD) are edited under{" "}
          <strong>Properties</strong> → hotel settings.
        </p>
        {chains.length === 0 ? (
          <p className="muted">Create a brand and property first.</p>
        ) : (
          <div className="admin-form admin-form-inline">
            <label>
              Brand
              <select value={chainId} onChange={(e) => setChainId(e.target.value)}>
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hotel
              <select
                value={hotelId}
                onChange={(e) => setHotelId(e.target.value)}
                disabled={hotels.length === 0}
              >
                <option value="">Select hotel</option>
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Room type
              <select
                value={roomTypeId}
                onChange={(e) => setRoomTypeId(e.target.value)}
                disabled={roomTypes.length === 0}
              >
                <option value="">Select room type</option>
                {roomTypes.map((rt) => (
                  <option key={rt.id} value={rt.id}>
                    {rt.name} ({rt.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      {error && (
        <section className="panel panel-wide">
          <p className="error">{error}</p>
        </section>
      )}

      {roomTypeId && (
        <>
          <section className="panel panel-wide">
            <h3 className="subsection-title">Inventory blocks</h3>
            {loading && <p className="muted">Loading…</p>}
            {calendarNote && <p className="muted">{calendarNote}</p>}
            {blocks.length === 0 && !loading && (
              <p className="muted">No blocks for this room type.</p>
            )}
            <ul className="staff-list">
              {blocks.map((block) => (
                <li key={block.id} className="staff-row">
                  <div className="staff-row-main">
                    <strong>
                      −{block.units_reduced} units · {block.start_date} →{" "}
                      {block.end_date}
                    </strong>
                    <span className="staff-meta muted">
                      {block.label ?? "No label"}
                    </span>
                  </div>
                  <div className="staff-row-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void removeBlock(block.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel panel-wide">
            <form className="admin-form" onSubmit={submitBlock}>
              <h3 className="subsection-title">Add block</h3>
              <label>
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </label>
              <label>
                End date (exclusive)
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </label>
              <label>
                Units reduced
                <input
                  value={unitsReduced}
                  onChange={(e) => setUnitsReduced(e.target.value)}
                  inputMode="numeric"
                  required
                />
              </label>
              <label>
                Label (optional)
                <input
                  value={blockLabel}
                  onChange={(e) => setBlockLabel(e.target.value)}
                />
              </label>
              <button type="submit" disabled={busy}>
                Add block
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
