-- Phase 10B: realistic BAR, tax, fees, and unit counts for demo catalog (idempotent).
-- Safe to re-run; overwrites commercial fields to known demo values.

update inventory.room_type rt
set
  base_rate_cents = v.base_rate_cents,
  tax_rate_bps = v.tax_rate_bps,
  fee_fixed_cents = v.fee_fixed_cents,
  units_total = v.units_total
from inventory.hotel h
join inventory.chain c on c.id = h.chain_id
join (
  values
    -- chain, hotel, room, base_cents, tax_bps, fee_cents, units
    ('DEMO', 'DEMO-H1', 'STD-QN', 10000, 850, 0, 8),
    ('DEMO', 'DEMO-H1', 'KING', 12000, 850, 0, 6),
    ('DEMO', 'DEMO-H1', 'JR-STE', 18000, 850, 0, 4),
    ('DEMO', 'DEMO-H2', 'STD-QN', 9500, 850, 0, 10),
    ('DEMO', 'DEMO-H2', 'DBL-TWN', 11000, 850, 0, 6),
    ('HBR', 'HBR-SEA-WF', 'HV-KING', 18900, 1010, 0, 12),
    ('HBR', 'HBR-SEA-WF', 'WF-QQ', 15900, 1010, 0, 8),
    ('HBR', 'HBR-SEA-WF', 'EXE-STE', 28900, 1010, 0, 3),
    ('HBR', 'HBR-PDX-PL', 'KING', 14900, 850, 0, 10),
    ('HBR', 'HBR-PDX-PL', 'STUDIO-K', 12900, 850, 0, 8),
    ('NWE', 'NWE-BEL', 'STUDIO-Q', 9900, 850, 0, 14),
    ('NWE', 'NWE-BEL', '1BR-STE', 13900, 850, 0, 6),
    ('NWE', 'NWE-TAC', 'STUDIO-Q', 8900, 850, 0, 12),
    ('NWE', 'NWE-TAC', 'ACC-QN', 8900, 850, 0, 4),
    ('VCB', 'VCB-PDX-OT', 'CLASSIC-Q', 17900, 850, 0, 6),
    ('VCB', 'VCB-PDX-OT', 'TERR-KING', 21900, 850, 3500, 4),
    ('VCB', 'VCB-PDX-OT', 'LOFT-STE', 29900, 850, 3500, 2)
) as v (
  chain_code,
  hotel_code,
  room_code,
  base_rate_cents,
  tax_rate_bps,
  fee_fixed_cents,
  units_total
) on c.code = v.chain_code
  and h.code = v.hotel_code
  and rt.code = v.room_code
where rt.hotel_id = h.id
  and rt.chain_id = c.id;
