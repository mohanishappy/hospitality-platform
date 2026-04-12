-- Date-only stays, hotel/room linkage, normalized guest. Extends reservation_stub; replaces RPC.

create table if not exists reservations.guest (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reservations.reservation_stub (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  constraint guest_one_per_reservation unique (reservation_id)
);

create index if not exists guest_reservation_id_idx on reservations.guest (reservation_id);

alter table reservations.reservation_stub
  add column if not exists hotel_id uuid references inventory.hotel (id) on delete restrict;

alter table reservations.reservation_stub
  add column if not exists room_type_id uuid references inventory.room_type (id) on delete restrict;

alter table reservations.reservation_stub
  add column if not exists check_in date;

alter table reservations.reservation_stub
  add column if not exists check_out date;

-- Legacy stub rows may have NULL hotel/dates; new bookings must be complete when hotel_id is set.
alter table reservations.reservation_stub drop constraint if exists reservation_dates_valid_ck;

alter table reservations.reservation_stub
  add constraint reservation_dates_valid_ck check (
    hotel_id is null
    or (
      room_type_id is not null
      and check_in is not null
      and check_out is not null
      and check_out > check_in
    )
  );

create index if not exists reservation_stub_booking_window_idx
  on reservations.reservation_stub (chain_id, check_in)
  where hotel_id is not null;

grant select, insert, update, delete on table reservations.guest to service_role;

-- Replace idempotent create (full booking). Old signature removed.
drop function if exists public.create_reservation_idempotent (uuid, text);

-- OR REPLACE: safe when remote already has this signature (manual SQL / replay).
create or replace function public.create_reservation_idempotent (
  p_chain_id uuid,
  p_idempotency_key text,
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_first_name text,
  p_guest_last_name text,
  p_guest_email text,
  p_guest_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_key text := trim(p_idempotency_key);
  v_existing uuid;
  v_reservation_id uuid;
  v_fn text := trim(p_guest_first_name);
  v_ln text := trim(p_guest_last_name);
  v_em text := trim(p_guest_email);
  v_phone text := nullif(trim(coalesce(p_guest_phone, '')), '');
  v_hotel_chain uuid;
  v_rt_hotel uuid;
  v_rt_chain uuid;
begin
  if v_key is null or length(v_key) = 0 then
    raise exception 'idempotency_key required' using errcode = '22023';
  end if;

  if v_fn is null or length(v_fn) = 0 then
    raise exception 'guest.first_name required' using errcode = '22023';
  end if;

  if v_ln is null or length(v_ln) = 0 then
    raise exception 'guest.last_name required' using errcode = '22023';
  end if;

  if v_em is null or length(v_em) = 0 then
    raise exception 'guest.email required' using errcode = '22023';
  end if;

  if p_check_out is null or p_check_in is null or p_check_out <= p_check_in then
    raise exception 'check_in and check_out must be dates with check_out > check_in' using errcode = '22023';
  end if;

  select h.chain_id into v_hotel_chain
  from inventory.hotel h
  where h.id = p_hotel_id;

  if v_hotel_chain is null then
    raise exception 'hotel not found' using errcode = '22023';
  end if;

  if v_hotel_chain <> p_chain_id then
    raise exception 'hotel does not belong to this chain' using errcode = '22023';
  end if;

  select rt.hotel_id, rt.chain_id into v_rt_hotel, v_rt_chain
  from inventory.room_type rt
  where rt.id = p_room_type_id;

  if v_rt_hotel is null then
    raise exception 'room_type not found' using errcode = '22023';
  end if;

  if v_rt_chain <> p_chain_id or v_rt_hotel <> p_hotel_id then
    raise exception 'room_type does not belong to this hotel/chain' using errcode = '22023';
  end if;

  select il.reservation_id
    into v_existing
  from reservations.idempotency_ledger il
  where il.chain_id = p_chain_id
    and il.idempotency_key = v_key;

  if v_existing is not null then
    return jsonb_build_object(
      'reservation_id', v_existing::text,
      'created', false
    );
  end if;

  begin
    insert into reservations.reservation_stub (
      chain_id,
      hotel_id,
      room_type_id,
      check_in,
      check_out,
      status
    )
    values (
      p_chain_id,
      p_hotel_id,
      p_room_type_id,
      p_check_in,
      p_check_out,
      'pending'
    )
    returning id into v_reservation_id;

    insert into reservations.guest (
      reservation_id,
      first_name,
      last_name,
      email,
      phone
    )
    values (
      v_reservation_id,
      v_fn,
      v_ln,
      v_em,
      v_phone
    );

    insert into reservations.idempotency_ledger (chain_id, idempotency_key, reservation_id)
    values (p_chain_id, v_key, v_reservation_id);

    return jsonb_build_object(
      'reservation_id', v_reservation_id::text,
      'created', true
    );
  exception
    when unique_violation then
      select il.reservation_id
        into v_reservation_id
      from reservations.idempotency_ledger il
      where il.chain_id = p_chain_id
        and il.idempotency_key = v_key;
      if v_reservation_id is null then
        raise;
      end if;
      return jsonb_build_object(
        'reservation_id', v_reservation_id::text,
        'created', false
      );
  end;
end;
$$;

revoke all on function public.create_reservation_idempotent (
  uuid,
  text,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.create_reservation_idempotent (
  uuid,
  text,
  uuid,
  uuid,
  date,
  date,
  text,
  text,
  text,
  text
) to service_role;

