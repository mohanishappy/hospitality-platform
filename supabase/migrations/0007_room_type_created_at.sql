-- Align room_type with chain/hotel (audit column). Safe on existing rows.

alter table inventory.room_type
  add column if not exists created_at timestamptz not null default now();

