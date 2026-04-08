-- Realistic catalog seed (idempotent). Safe to re-run.
-- Tenancy: each row is scoped by chain_id; **chain** is the tenant (no separate tenant table).

-- ---------------------------------------------------------------------------
-- Chains (tenants). Stable UUIDs for Auth0 custom claim setup.
-- Demo chain already exists from 0001 (code DEMO, id 00000000-...-001).
-- ---------------------------------------------------------------------------
insert into inventory.chain (id, name, code)
values
  (
    'a1111111-1111-4111-8111-111111111111',
    'Harborline Hotels',
    'HBR'
  ),
  (
    'a2222222-2222-4222-8222-222222222222',
    'Northwind Extended Stay',
    'NWE'
  ),
  (
    'a3333333-3333-4333-8333-333333333333',
    'Velvet Court Boutique',
    'VCB'
  )
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Hotels
-- ---------------------------------------------------------------------------
insert into inventory.hotel (chain_id, name, code)
select c.id, v.name, v.code
from (values
  ('DEMO', 'Demo Hotel Midtown', 'DEMO-H2'),
  ('HBR', 'Harborline Seattle Waterfront', 'HBR-SEA-WF'),
  ('HBR', 'Harborline Portland Pearl', 'HBR-PDX-PL'),
  ('NWE', 'Northwind Suites Bellevue', 'NWE-BEL'),
  ('NWE', 'Northwind Suites Tacoma Dome', 'NWE-TAC'),
  ('VCB', 'Velvet Court Old Town', 'VCB-PDX-OT')
) as v (chain_code, name, code)
join inventory.chain c on c.code = v.chain_code
on conflict (chain_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Room types (per hotel)
-- ---------------------------------------------------------------------------
insert into inventory.room_type (chain_id, hotel_id, name, code, capacity)
select h.chain_id, h.id, rt.name, rt.code, rt.capacity
from inventory.hotel h
join inventory.chain c on c.id = h.chain_id
join (values
  ('DEMO', 'DEMO-H1', 'Standard Queen', 'STD-QN', 2),
  ('DEMO', 'DEMO-H1', 'King', 'KING', 2),
  ('DEMO', 'DEMO-H1', 'Junior Suite', 'JR-STE', 3),
  ('DEMO', 'DEMO-H2', 'Standard Queen', 'STD-QN', 2),
  ('DEMO', 'DEMO-H2', 'Twin Doubles', 'DBL-TWN', 4),
  ('HBR', 'HBR-SEA-WF', 'Harbor View King', 'HV-KING', 2),
  ('HBR', 'HBR-SEA-WF', 'Waterfront Double Queen', 'WF-QQ', 4),
  ('HBR', 'HBR-SEA-WF', 'Executive Suite', 'EXE-STE', 4),
  ('HBR', 'HBR-PDX-PL', 'Pearl King', 'KING', 2),
  ('HBR', 'HBR-PDX-PL', 'Studio King', 'STUDIO-K', 2),
  ('NWE', 'NWE-BEL', 'Studio Queen', 'STUDIO-Q', 2),
  ('NWE', 'NWE-BEL', 'One-Bedroom Suite', '1BR-STE', 4),
  ('NWE', 'NWE-TAC', 'Studio Queen', 'STUDIO-Q', 2),
  ('NWE', 'NWE-TAC', 'Accessible Queen', 'ACC-QN', 2),
  ('VCB', 'VCB-PDX-OT', 'Classic Queen', 'CLASSIC-Q', 2),
  ('VCB', 'VCB-PDX-OT', 'Terrace King', 'TERR-KING', 2),
  ('VCB', 'VCB-PDX-OT', 'Loft Suite', 'LOFT-STE', 4)
) as rt (chain_code, hotel_code, name, code, capacity)
  on c.code = rt.chain_code and h.code = rt.hotel_code
on conflict (hotel_id, code) do nothing;

