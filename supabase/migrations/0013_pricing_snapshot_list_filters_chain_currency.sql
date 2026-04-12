-- Phase 1–2: list filters (indexes), chain default_currency, reservation pricing_snapshot + itemized fees on create.

-- Replace 10-arg RPC with 11-arg (optional expected total); PostgREST targets one signature.
drop function if exists public.create_reservation_idempotent (
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
);

-- FR-C6: default currency at chain level (room_type.currency still overrides per quote when set).
alter table inventory.chain
  add column if not exists default_currency text not null default 'USD';

alter table inventory.chain drop constraint if exists chain_default_currency_nonempty;

alter table inventory.chain
  add constraint chain_default_currency_nonempty check (length(trim(default_currency)) > 0);

-- List filters (FR-R8)
create index if not exists reservation_stub_chain_status_idx
  on reservations.reservation_stub (chain_id, status);

create index if not exists reservation_stub_chain_hotel_idx
  on reservations.reservation_stub (chain_id, hotel_id);

create index if not exists reservation_stub_chain_dates_idx
  on reservations.reservation_stub (chain_id, check_in, check_out);

-- Persist quote at booking (FR-C5, FR-C4)
alter table reservations.reservation_stub
  add column if not exists pricing_snapshot jsonb;

-- Booking: compute pricing (same rules as room_type_availability_quote), optional expected-total check, store snapshot.
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
  p_guest_phone text default null,
  p_expected_total_cents bigint default null
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
  v_units int;
  v_allow int;
  v_cap int;
  v_max_occ bigint;
  v_base int;
  v_tax_bps int;
  v_fee int;
  v_nights int;
  v_subtotal bigint;
  v_tax bigint;
  v_total bigint;
  v_curr text;
  v_snapshot jsonb;
  v_fees jsonb;
begin
  if v_key is null or length(v_key) = 0 then raise exception 'idempotency_key required' using errcode = '22023'; end if;
  if v_fn is null or length(v_fn) = 0 then raise exception 'guest.first_name required' using errcode = '22023'; end if;
  if v_ln is null or length(v_ln) = 0 then raise exception 'guest.last_name required' using errcode = '22023'; end if;
  if v_em is null or length(v_em) = 0 then raise exception 'guest.email required' using errcode = '22023'; end if;
  if p_check_out is null or p_check_in is null or p_check_out <= p_check_in then
    raise exception 'check_in and check_out must be dates with check_out > check_in' using errcode = '22023';
  end if;

  select h.chain_id into v_hotel_chain
  from inventory.hotel h
  where h.id = p_hotel_id;

  if v_hotel_chain is null then raise exception 'hotel not found' using errcode = '22023'; end if;
  if v_hotel_chain <> p_chain_id then raise exception 'hotel does not belong to this chain' using errcode = '22023'; end if;

  select
    rt.hotel_id,
    rt.chain_id,
    rt.units_total,
    coalesce(rt.overbooking_allowance, 0),
    rt.base_rate_cents,
    coalesce(rt.tax_rate_bps, 0),
    coalesce(rt.fee_fixed_cents, 0),
    coalesce(nullif(trim(rt.currency), ''), c.default_currency, 'USD')
  into v_rt_hotel, v_rt_chain, v_units, v_allow, v_base, v_tax_bps, v_fee, v_curr
  from inventory.room_type rt
  join inventory.chain c on c.id = rt.chain_id
  where rt.id = p_room_type_id;

  if v_rt_hotel is null then raise exception 'room_type not found' using errcode = '22023'; end if;
  if v_rt_chain <> p_chain_id or v_rt_hotel <> p_hotel_id then
    raise exception 'room_type does not belong to this hotel/chain' using errcode = '22023';
  end if;

  if v_units is null or v_units < 1 then v_units := 1; end if;
  v_cap := v_units + v_allow;
  v_nights := (p_check_out - p_check_in);

  v_subtotal := null;
  v_tax := 0;
  if v_base is not null then
    v_subtotal := v_base::bigint * v_nights;
    v_tax := round(v_subtotal * v_tax_bps / 10000.0)::bigint;
  end if;
  v_total := coalesce(v_subtotal, 0::bigint) + v_tax + v_fee::bigint;

  if v_fee > 0 then
    v_fees := jsonb_build_array(
      jsonb_build_object(
        'code', 'fixed',
        'label', 'Fixed service fee',
        'amount_cents', v_fee
      )
    );
  else
    v_fees := '[]'::jsonb;
  end if;

  v_snapshot := jsonb_build_object(
    'currency', v_curr,
    'room_subtotal_cents', v_subtotal,
    'tax_rate_bps', v_tax_bps,
    'tax_cents', v_tax,
    'fee_line_items', v_fees,
    'total_cents', v_total,
    'nights', v_nights,
    'rounding', 'integer_cents_half_up'
  );

  if p_expected_total_cents is not null and p_expected_total_cents <> v_total then
    raise exception 'PRICE_MISMATCH: total_cents does not match expected_total_cents' using errcode = '22023';
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

  select coalesce(max(sub.cnt), 0::bigint)
  into v_max_occ
  from (
    select count(r.id)::bigint as cnt
    from generate_series(
      p_check_in::timestamp,
      (p_check_out - 1)::timestamp,
      interval '1 day'
    ) gs (dt)
    left join reservations.reservation_stub r
      on r.room_type_id = p_room_type_id and r.chain_id = p_chain_id
     and r.status in ('pending', 'confirmed')
     and r.hotel_id is not null
     and r.check_in is not null
     and r.check_out is not null
     and r.check_in <= (gs.dt::date)
     and r.check_out > (gs.dt::date)
    group by (gs.dt::date)
  ) sub;

  if v_max_occ >= v_cap then
    raise exception 'No availability for this room type for the requested dates' using errcode = '22023';
  end if;

  begin
    insert into reservations.reservation_stub (
      chain_id,
      hotel_id,
      room_type_id,
      check_in,
      check_out,
      status,
      pricing_snapshot
    )
    values (
      p_chain_id,
      p_hotel_id,
      p_room_type_id,
      p_check_in,
      p_check_out,
      'pending',
      v_snapshot
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
      if v_reservation_id is null then raise; end if;
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
  text,
  bigint
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
  text,
  bigint
) to service_role;

-- Keep 10-arg calls working (phone default null, expected default null)
-- PostgreSQL allows omitting trailing defaults.
