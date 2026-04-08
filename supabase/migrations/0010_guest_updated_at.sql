-- Touch guest row when contact fields are patched (API also bumps reservation.updated_at).

alter table reservations.guest
  add column if not exists updated_at timestamptz not null default now();

