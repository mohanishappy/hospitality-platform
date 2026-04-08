-- Allowed lifecycle: pending → confirmed | cancelled; confirmed → cancelled.

alter table reservations.reservation_stub
  add column if not exists updated_at timestamptz not null default now();

alter table reservations.reservation_stub
  drop constraint if exists reservation_status_valid_ck;

alter table reservations.reservation_stub
  add constraint reservation_status_valid_ck check (
    status in ('pending', 'confirmed', 'cancelled')
  );

