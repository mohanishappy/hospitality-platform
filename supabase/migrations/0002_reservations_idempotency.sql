-- Stub reservation rows + idempotency ledger (chain-scoped keys). RPC keeps create + ledger atomic.

create table if not exists reservations.reservation_stub (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references inventory.chain (id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists reservations.idempotency_ledger (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references inventory.chain (id) on delete restrict,
  idempotency_key text not null,
  reservation_id uuid not null references reservations.reservation_stub (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (chain_id, idempotency_key)
);

create index if not exists idempotency_ledger_chain_key_idx on reservations.idempotency_ledger (chain_id, idempotency_key);

-- Called from Workers via PostgREST RPC (service_role). Handles races with unique_violation.
create or replace function public.create_reservation_idempotent (p_chain_id uuid, p_idempotency_key text)
returns uuid
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_existing uuid;
  v_reservation_id uuid;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    raise exception 'idempotency_key required' using errcode = '22023';
  end if;

  select il.reservation_id
    into v_existing
  from reservations.idempotency_ledger il
  where il.chain_id = p_chain_id
    and il.idempotency_key = p_idempotency_key;

  if v_existing is not null then
    return v_existing;
  end if;

  begin
    insert into reservations.reservation_stub (chain_id)
    values (p_chain_id)
    returning id into v_reservation_id;

    insert into reservations.idempotency_ledger (chain_id, idempotency_key, reservation_id)
    values (p_chain_id, p_idempotency_key, v_reservation_id);

    return v_reservation_id;
  exception
    when unique_violation then
      select il.reservation_id
        into v_reservation_id
      from reservations.idempotency_ledger il
      where il.chain_id = p_chain_id
        and il.idempotency_key = p_idempotency_key;
      if v_reservation_id is null then
        raise;
      end if;
      return v_reservation_id;
  end;
end;
$$;

revoke all on function public.create_reservation_idempotent (uuid, text) from public;
grant execute on function public.create_reservation_idempotent (uuid, text) to service_role;
