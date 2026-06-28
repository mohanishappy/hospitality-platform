import { useCallback, useEffect, useState } from "react";
import {
  createAdminHotel,
  createAdminRoomType,
  GatewayError,
  getAdminHotel,
  listAdminHotels,
  listAdminRoomTypes,
  patchAdminHotel,
  patchAdminRoomType,
  type AdminHotel,
  type AdminRoomType,
  type ChainSummary,
} from "../../api/gateway";
import { useGatewayToken } from "../../hooks/useGatewayToken";

type Props = {
  gatewayUrl: string;
  audience: string;
  chains: ChainSummary[];
};

function parseDowList(raw: string): number[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/[,\s]+/).filter(Boolean);
  const out: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    out.push(n);
  }
  return out;
}

function formatDowList(values: number[] | null | undefined): string {
  if (!values?.length) return "";
  return values.join(", ");
}

function formatCutoffTime(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 5);
}

function centsToDisplay(cents: number | null | undefined): string {
  if (cents == null) return "";
  return String(cents);
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  if (!Number.isInteger(n)) return undefined;
  return n;
}

export function AdminPropertiesTab({ gatewayUrl, audience, chains }: Props) {
  const getToken = useGatewayToken(audience);

  const [chainId, setChainId] = useState("");
  const [hotels, setHotels] = useState<AdminHotel[]>([]);
  const [hotelId, setHotelId] = useState("");
  const [hotel, setHotel] = useState<AdminHotel | null>(null);
  const [roomTypes, setRoomTypes] = useState<AdminRoomType[]>([]);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newHotelCode, setNewHotelCode] = useState("");
  const [newHotelName, setNewHotelName] = useState("");

  const [hotelName, setHotelName] = useState("");
  const [hotelCode, setHotelCode] = useState("");
  const [minLos, setMinLos] = useState("");
  const [maxLos, setMaxLos] = useState("");
  const [timezone, setTimezone] = useState("");
  const [ctaDow, setCtaDow] = useState("");
  const [ctdDow, setCtdDow] = useState("");
  const [cutoff, setCutoff] = useState("");

  const [newRtCode, setNewRtCode] = useState("");
  const [newRtName, setNewRtName] = useState("");
  const [newRtCapacity, setNewRtCapacity] = useState("2");
  const [newRtUnits, setNewRtUnits] = useState("5");
  const [newRtBar, setNewRtBar] = useState("");
  const [newRtTax, setNewRtTax] = useState("850");
  const [newRtFee, setNewRtFee] = useState("0");

  const [editRtName, setEditRtName] = useState("");
  const [editRtCode, setEditRtCode] = useState("");
  const [editRtCapacity, setEditRtCapacity] = useState("");
  const [editRtUnits, setEditRtUnits] = useState("");
  const [editRtBar, setEditRtBar] = useState("");
  const [editRtTax, setEditRtTax] = useState("");
  const [editRtFee, setEditRtFee] = useState("");
  const [editRtOverbook, setEditRtOverbook] = useState("");

  useEffect(() => {
    if (chains.length > 0 && !chainId) {
      setChainId(chains[0]!.id);
    }
  }, [chainId, chains]);

  const loadHotels = useCallback(async () => {
    if (!chainId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const data = await listAdminHotels(gatewayUrl, token, chainId);
      setHotels(data.hotels ?? []);
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to load hotels"
      );
    } finally {
      setLoading(false);
    }
  }, [chainId, gatewayUrl, getToken]);

  const loadHotelDetail = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const [hotelRes, rtRes] = await Promise.all([
          getAdminHotel(gatewayUrl, token, id),
          listAdminRoomTypes(gatewayUrl, token, id),
        ]);
        const h = hotelRes.hotel;
        setHotel(h);
        setHotelName(h.name);
        setHotelCode(h.code);
        setMinLos(h.booking_min_los != null ? String(h.booking_min_los) : "");
        setMaxLos(h.booking_max_los != null ? String(h.booking_max_los) : "");
        setTimezone(h.booking_timezone ?? "");
        setCtaDow(formatDowList(h.booking_closed_arrival_dow));
        setCtdDow(formatDowList(h.booking_closed_departure_dow));
        setCutoff(formatCutoffTime(h.booking_same_day_cutoff_time));
        setRoomTypes(rtRes.room_types ?? []);
        setEditingRoomId(null);
      } catch (err: unknown) {
        setError(
          err instanceof GatewayError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load hotel"
        );
      } finally {
        setLoading(false);
      }
    },
    [gatewayUrl, getToken]
  );

  useEffect(() => {
    setHotelId("");
    setHotel(null);
    setRoomTypes([]);
    if (chainId) void loadHotels();
  }, [chainId, loadHotels]);

  useEffect(() => {
    if (hotelId) void loadHotelDetail(hotelId);
    else {
      setHotel(null);
      setRoomTypes([]);
    }
  }, [hotelId, loadHotelDetail]);

  const startEditRoom = (rt: AdminRoomType) => {
    setEditingRoomId(rt.id);
    setEditRtName(rt.name);
    setEditRtCode(rt.code);
    setEditRtCapacity(String(rt.capacity));
    setEditRtUnits(String(rt.units_total));
    setEditRtBar(centsToDisplay(rt.base_rate_cents));
    setEditRtTax(String(rt.tax_rate_bps));
    setEditRtFee(String(rt.fee_fixed_cents));
    setEditRtOverbook(String(rt.overbooking_allowance));
  };

  const submitNewHotel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chainId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await createAdminHotel(gatewayUrl, token, chainId, {
        code: newHotelCode.trim().toUpperCase(),
        name: newHotelName.trim(),
      });
      setNewHotelCode("");
      setNewHotelName("");
      await loadHotels();
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Create hotel failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const saveHotel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotelId) return;
    const cta = parseDowList(ctaDow);
    const ctd = parseDowList(ctdDow);
    if (cta === null || ctd === null) {
      setError("Closed days must be 0–6 (Sun=0), comma-separated");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      const body: Parameters<typeof patchAdminHotel>[3] = {
        name: hotelName.trim(),
        code: hotelCode.trim().toUpperCase(),
        booking_closed_arrival_dow: cta,
        booking_closed_departure_dow: ctd,
      };
      const min = parseOptionalInt(minLos);
      const max = parseOptionalInt(maxLos);
      if (minLos.trim() && min !== undefined) body.booking_min_los = min;
      if (maxLos.trim() && max !== undefined) body.booking_max_los = max;
      if (timezone.trim()) body.booking_timezone = timezone.trim();
      if (cutoff.trim()) body.booking_same_day_cutoff_time = cutoff.trim();
      await patchAdminHotel(gatewayUrl, token, hotelId, body);
      await loadHotelDetail(hotelId);
    } catch (err: unknown) {
      setError(err instanceof GatewayError ? err.message : "Save hotel failed");
    } finally {
      setBusy(false);
    }
  };

  const submitNewRoomType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hotelId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await createAdminRoomType(gatewayUrl, token, hotelId, {
        code: newRtCode.trim().toUpperCase(),
        name: newRtName.trim(),
        capacity: parseOptionalInt(newRtCapacity) ?? 2,
        units_total: parseOptionalInt(newRtUnits) ?? 5,
        base_rate_cents: parseOptionalInt(newRtBar) ?? 0,
        tax_rate_bps: parseOptionalInt(newRtTax) ?? 0,
        fee_fixed_cents: parseOptionalInt(newRtFee) ?? 0,
        overbooking_allowance: 0,
      });
      setNewRtCode("");
      setNewRtName("");
      await loadHotelDetail(hotelId);
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Create room type failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const saveRoomType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoomId || !hotelId) return;
    setBusy(true);
    setError(null);
    try {
      const token = await getToken();
      await patchAdminRoomType(gatewayUrl, token, editingRoomId, {
        name: editRtName.trim(),
        code: editRtCode.trim().toUpperCase(),
        capacity: parseOptionalInt(editRtCapacity),
        units_total: parseOptionalInt(editRtUnits),
        base_rate_cents: parseOptionalInt(editRtBar),
        tax_rate_bps: parseOptionalInt(editRtTax),
        fee_fixed_cents: parseOptionalInt(editRtFee),
        overbooking_allowance: parseOptionalInt(editRtOverbook),
      });
      setEditingRoomId(null);
      await loadHotelDetail(hotelId);
    } catch (err: unknown) {
      setError(
        err instanceof GatewayError ? err.message : "Save room type failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const selectedChain = chains.find((c) => c.id === chainId);

  return (
    <div className="admin-tab">
      <section className="panel panel-wide">
        <h2 className="section-title">Properties</h2>
        <p className="muted">
          Manage hotels and room types per brand. Public search may take up to
          ~60s to reflect changes (gateway cache).
        </p>
        {chains.length === 0 ? (
          <p className="muted">
            No brands yet — create one on the <strong>Brands</strong> tab first.
          </p>
        ) : (
          <label className="admin-inline-field">
            Brand
            <select
              value={chainId}
              onChange={(e) => {
                setChainId(e.target.value);
                setHotelId("");
              }}
            >
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name} ({chain.code})
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {error && (
        <section className="panel panel-wide">
          <p className="error">{error}</p>
        </section>
      )}

      {chainId && (
        <>
          <section className="panel panel-wide">
            <h3 className="subsection-title">Hotels — {selectedChain?.code}</h3>
            {loading && !hotelId && <p className="muted">Loading hotels…</p>}
            {hotels.length === 0 && !loading && (
              <p className="muted">No hotels for this brand yet.</p>
            )}
            {hotels.length > 0 && (
              <ul className="admin-pick-list">
                {hotels.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className={
                        hotelId === h.id
                          ? "admin-pick-item active"
                          : "admin-pick-item"
                      }
                      onClick={() => setHotelId(h.id)}
                    >
                      <strong>{h.name}</strong>
                      <span className="muted">{h.code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="admin-form admin-form-inline" onSubmit={submitNewHotel}>
              <label>
                New hotel code
                <input
                  value={newHotelCode}
                  onChange={(e) =>
                    setNewHotelCode(e.target.value.toUpperCase())
                  }
                  required
                  placeholder="ADM-H1"
                />
              </label>
              <label>
                Name
                <input
                  value={newHotelName}
                  onChange={(e) => setNewHotelName(e.target.value)}
                  required
                />
              </label>
              <button type="submit" disabled={busy}>
                Add hotel
              </button>
            </form>
          </section>

          {hotel && (
            <>
              <section className="panel panel-wide">
                <h3 className="subsection-title">Hotel settings</h3>
                <form className="admin-form" onSubmit={saveHotel}>
                  <label>
                    Name
                    <input
                      value={hotelName}
                      onChange={(e) => setHotelName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Code
                    <input
                      value={hotelCode}
                      onChange={(e) =>
                        setHotelCode(e.target.value.toUpperCase())
                      }
                      required
                    />
                  </label>
                  <label>
                    Min LOS (nights)
                    <input
                      value={minLos}
                      onChange={(e) => setMinLos(e.target.value)}
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Max LOS (nights)
                    <input
                      value={maxLos}
                      onChange={(e) => setMaxLos(e.target.value)}
                      inputMode="numeric"
                      placeholder="Optional"
                    />
                  </label>
                  <label>
                    Timezone
                    <input
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="America/Los_Angeles"
                    />
                  </label>
                  <label>
                    Closed to arrival (DOW 0=Sun)
                    <input
                      value={ctaDow}
                      onChange={(e) => setCtaDow(e.target.value)}
                      placeholder="e.g. 0, 6"
                    />
                  </label>
                  <label>
                    Closed to departure (DOW)
                    <input
                      value={ctdDow}
                      onChange={(e) => setCtdDow(e.target.value)}
                      placeholder="e.g. 5"
                    />
                  </label>
                  <label>
                    Same-day cutoff (HH:MM)
                    <input
                      value={cutoff}
                      onChange={(e) => setCutoff(e.target.value)}
                      placeholder="15:00"
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Save hotel
                  </button>
                </form>
              </section>

              <section className="panel panel-wide">
                <h3 className="subsection-title">Room types</h3>
                {roomTypes.length === 0 && (
                  <p className="muted">No room types yet.</p>
                )}
                <ul className="staff-list">
                  {roomTypes.map((rt) => (
                    <li key={rt.id} className="staff-row">
                      <div className="staff-row-main">
                        <strong>
                          {rt.name} ({rt.code})
                        </strong>
                        <span className="staff-meta muted">
                          {rt.units_total} units · BAR{" "}
                          {rt.base_rate_cents != null
                            ? `$${(rt.base_rate_cents / 100).toFixed(2)}`
                            : "—"}{" "}
                          · tax {rt.tax_rate_bps} bps
                        </span>
                      </div>
                      <div className="staff-row-actions">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => startEditRoom(rt)}
                        >
                          Edit
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                {editingRoomId && (
                  <form className="admin-form staff-edit-grants" onSubmit={saveRoomType}>
                    <h4 className="subsection-title">Edit room type</h4>
                    <label>
                      Name
                      <input
                        value={editRtName}
                        onChange={(e) => setEditRtName(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      Code
                      <input
                        value={editRtCode}
                        onChange={(e) =>
                          setEditRtCode(e.target.value.toUpperCase())
                        }
                        required
                      />
                    </label>
                    <label>
                      Capacity
                      <input
                        value={editRtCapacity}
                        onChange={(e) => setEditRtCapacity(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      Units total
                      <input
                        value={editRtUnits}
                        onChange={(e) => setEditRtUnits(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      BAR (cents/night)
                      <input
                        value={editRtBar}
                        onChange={(e) => setEditRtBar(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      Tax (basis points)
                      <input
                        value={editRtTax}
                        onChange={(e) => setEditRtTax(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      Fixed fee (cents/stay)
                      <input
                        value={editRtFee}
                        onChange={(e) => setEditRtFee(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label>
                      Overbooking allowance
                      <input
                        value={editRtOverbook}
                        onChange={(e) => setEditRtOverbook(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <div className="staff-edit-actions">
                      <button type="submit" disabled={busy}>
                        Save room type
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditingRoomId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                <form
                  className="admin-form admin-form-inline"
                  onSubmit={submitNewRoomType}
                >
                  <h4 className="subsection-title">Add room type</h4>
                  <label>
                    Code
                    <input
                      value={newRtCode}
                      onChange={(e) => setNewRtCode(e.target.value.toUpperCase())}
                      required
                    />
                  </label>
                  <label>
                    Name
                    <input
                      value={newRtName}
                      onChange={(e) => setNewRtName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Capacity
                    <input
                      value={newRtCapacity}
                      onChange={(e) => setNewRtCapacity(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    Units
                    <input
                      value={newRtUnits}
                      onChange={(e) => setNewRtUnits(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    BAR (cents)
                    <input
                      value={newRtBar}
                      onChange={(e) => setNewRtBar(e.target.value)}
                      inputMode="numeric"
                      placeholder="12500"
                    />
                  </label>
                  <label>
                    Tax bps
                    <input
                      value={newRtTax}
                      onChange={(e) => setNewRtTax(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <label>
                    Fee (cents)
                    <input
                      value={newRtFee}
                      onChange={(e) => setNewRtFee(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>
                  <button type="submit" disabled={busy}>
                    Add room type
                  </button>
                </form>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
