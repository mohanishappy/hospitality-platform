create schema if not exists inventory;
create schema if not exists reservations;

create table if not exists inventory.chain (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists inventory.hotel (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references inventory.chain (id) on delete restrict,
  name text not null,
  code text not null,
  created_at timestamptz not null default now(),
  unique (chain_id, code)
);

create table if not exists inventory.room_type (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references inventory.chain (id) on delete restrict,
  hotel_id uuid not null references inventory.hotel (id) on delete cascade,
  name text not null,
  code text not null,
  capacity int not null default 2,
  unique (hotel_id, code)
);

-- Demo seed (remove or parameterize for production)
insert into inventory.chain (id, name, code)
values ('00000000-0000-0000-0000-000000000001', 'Demo Chain', 'DEMO')
on conflict (code) do nothing;

insert into inventory.hotel (chain_id, name, code)
values (
  '00000000-0000-0000-0000-000000000001',
  'Demo Hotel',
  'DEMO-H1'
)
on conflict (chain_id, code) do nothing;
