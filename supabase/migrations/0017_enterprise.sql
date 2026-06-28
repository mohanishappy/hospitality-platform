-- Enterprise groups multiple chains (brands). Reservations stay chain-scoped; no schema change there.

create table if not exists inventory.enterprise (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

alter table inventory.chain
  add column if not exists enterprise_id uuid references inventory.enterprise (id) on delete restrict;

create index if not exists chain_enterprise_id_idx on inventory.chain (enterprise_id);

-- Palladium Lodging Group — demo enterprise spanning all seed brands.
insert into inventory.enterprise (id, name, code)
values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'Palladium Lodging Group',
  'PLG'
)
on conflict (code) do nothing;

update inventory.chain
set enterprise_id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
where code in ('DEMO', 'HBR', 'NWE', 'VCB')
  and enterprise_id is distinct from 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
