-- Phase 5 (FR-V5): soft holds with TTL — count toward nightly capacity until expired or released.
-- FR-R11: reservation row_version for optimistic concurrency (ETag on GET; If-Match on PATCH).

-- ---------------------------------------------------------------------------
-- Soft holds (temporary inventory locks)
-- ---------------------------------------------------------------------------
create table if not exists inventory.soft_hold (
  id uuid primary key default gen_random_uuid (),
  chain_id uuid not null references inventory.chain (id) on delete cascade,
  hotel_id uuid not null references inventory.hotel (id) on delete cascade,
  room_type_id uuid not null references inventory.room_type (id) on delete cascade,
  check_in date not null,
  check_out date not null,
  units_held int not null default 1,
  expires_at timestamptz not null,
  created_at timestamptz not null default now (),
  constraint soft_hold_dates check (check_out > check_in),
  constraint soft_hold_units_pos check (units_held >= 1)
);

create index if not exists soft_hold_rt_chain_expires_idx
  on inventory.soft_hold (room_type_id, chain_id, expires_at);

create index if not exists soft_hold_chain_created_idx
  on inventory.soft_hold (chain_id, created_at desc);

-- Active holds overlapping a calendar night (half-open stay [check_in, check_out)).
create or replace function inventory.nightly_soft_hold_units (
  p_room_type_id uuid,
  p_chain_id uuid,
  p_night date
) returns int
language sql
stable
security definer
set search_path = public, reservations, inventory
as $$
  select coalesce(sum(h.units_held), 0)::int
  from inventory.soft_hold h
  where h.room_type_id = p_room_type_id
    and h.chain_id = p_chain_id
    and h.expires_at > now ()
    and h.check_in <= p_night
    and h.check_out > p_night;
$$;

create or replace function inventory.stay_is_bookable (
  p_room_type_id uuid,
  p_chain_id uuid,
  p_check_in date,
  p_check_out date,
  p_base_cap int
) returns boolean
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  d date;
  occ bigint;
  holds int;
  blk int;
  eff int;
  used bigint;
begin
  if p_base_cap < 1 then
    return false;
  end if;
  for d in
    select gs.dt::date
    from generate_series(
      p_check_in::timestamp,
      (p_check_out - 1)::timestamp,
      interval '1 day'
    ) gs (dt)
  loop
    occ := inventory.nightly_res_occ(p_room_type_id, p_chain_id, d);
    holds := inventory.nightly_soft_hold_units(p_room_type_id, p_chain_id, d);
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, p_base_cap - blk);
    used := occ + holds::bigint;
    if eff < 1 or used >= eff then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote: include holds in remaining-units loop
-- ---------------------------------------------------------------------------
create or replace function public.room_type_availability_quote (
  p_chain_id uuid,
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_rate_plan_code text default null,
  p_promotion_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_hotel_chain uuid;
  v_rt_hotel uuid;
  v_rt_chain uuid;
  v_units int;
  v_allow int;
  v_cap int;
  v_nights int;
  v_max_occ bigint;
  v_max_used bigint;
  v_min_rem bigint;
  d date;
  occ bigint;
  holds int;
  blk int;
  eff int;
  rem bigint;
  used bigint;
  v_bookable boolean;
  v_pricing jsonb;
begin
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

  perform inventory.validate_booking_policies(p_hotel_id, p_check_in, p_check_out);

  select
    rt.hotel_id,
    rt.chain_id,
    rt.units_total,
    coalesce(rt.overbooking_allowance, 0)
  into v_rt_hotel, v_rt_chain, v_units, v_allow
  from inventory.room_type rt
  where rt.id = p_room_type_id;

  if v_rt_hotel is null then
    raise exception 'room_type not found' using errcode = '22023';
  end if;
  if v_rt_chain <> p_chain_id or v_rt_hotel <> p_hotel_id then
    raise exception 'room_type does not belong to this hotel/chain' using errcode = '22023';
  end if;

  if v_units is null or v_units < 1 then
    v_units := 1;
  end if;
  v_cap := v_units + v_allow;
  v_nights := (p_check_out - p_check_in);

  v_max_occ := 0;
  v_max_used := 0;
  v_min_rem := null;
  for d in
    select gs.dt::date
    from generate_series(
      p_check_in::timestamp,
      (p_check_out - 1)::timestamp,
      interval '1 day'
    ) gs (dt)
  loop
    occ := inventory.nightly_res_occ(p_room_type_id, p_chain_id, d);
    holds := inventory.nightly_soft_hold_units(p_room_type_id, p_chain_id, d);
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, v_cap - blk);
    used := occ + holds::bigint;
    rem := eff::bigint - used;
    if occ > v_max_occ then
      v_max_occ := occ;
    end if;
    if used > v_max_used then
      v_max_used := used;
    end if;
    if v_min_rem is null or rem < v_min_rem then
      v_min_rem := rem;
    end if;
  end loop;

  if v_min_rem is null then
    v_min_rem := 0;
  end if;

  v_bookable := inventory.stay_is_bookable(
    p_room_type_id,
    p_chain_id,
    p_check_in,
    p_check_out,
    v_cap
  );

  v_pricing := inventory.compute_stay_pricing(
    p_chain_id,
    p_hotel_id,
    p_room_type_id,
    p_check_in,
    p_check_out,
    p_rate_plan_code,
    p_promotion_code
  );

  return jsonb_build_object(
    'room_type_id', p_room_type_id::text,
    'hotel_id', p_hotel_id::text,
    'check_in', p_check_in::text,
    'check_out', p_check_out::text,
    'nights', v_nights,
    'units_total', v_units,
    'overbooking_allowance', v_allow,
    'sellable_capacity', v_cap,
    'max_night_occupancy', v_max_occ,
    'max_night_including_holds', v_max_used,
    'remaining_units_on_tightest_night', greatest(v_min_rem, 0),
    'bookable', v_bookable,
    'pricing', jsonb_build_object(
      'currency', v_pricing->'currency',
      'base_rate_cents_per_night', v_pricing->'base_rate_cents_per_night',
      'nightly_rate_cents', v_pricing->'nightly_rate_cents',
      'nights', v_pricing->'nights',
      'room_subtotal_cents', v_pricing->'room_subtotal_cents',
      'discount_cents', v_pricing->'discount_cents',
      'tax_rate_bps', v_pricing->'tax_rate_bps',
      'tax_cents', v_pricing->'tax_cents',
      'fee_fixed_cents', v_pricing->'fee_fixed_cents',
      'fee_line_items', v_pricing->'fee_line_items',
      'total_cents', v_pricing->'total_cents',
      'rate_plan_code', v_pricing->'rate_plan_code',
      'promotion_code', v_pricing->'promotion_code'
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Calendar: per-day soft holds
-- ---------------------------------------------------------------------------
create or replace function public.room_type_availability_calendar (
  p_chain_id uuid,
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_from date,
  p_to date
) returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_hotel_chain uuid;
  v_rt_hotel uuid;
  v_rt_chain uuid;
  v_units int;
  v_allow int;
  v_cap int;
  d date;
  occ bigint;
  holds int;
  blk int;
  eff int;
  rem bigint;
  v_arr jsonb := '[]'::jsonb;
begin
  if p_to is null or p_from is null or p_to <= p_from then
    raise exception 'p_to must be after p_from (half-open range [p_from, p_to))' using errcode = '22023';
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

  select rt.hotel_id, rt.chain_id, rt.units_total, coalesce(rt.overbooking_allowance, 0)
  into v_rt_hotel, v_rt_chain, v_units, v_allow
  from inventory.room_type rt
  where rt.id = p_room_type_id;

  if v_rt_hotel is null then
    raise exception 'room_type not found' using errcode = '22023';
  end if;
  if v_rt_chain <> p_chain_id or v_rt_hotel <> p_hotel_id then
    raise exception 'room_type does not belong to this hotel/chain' using errcode = '22023';
  end if;

  if v_units is null or v_units < 1 then
    v_units := 1;
  end if;
  v_cap := v_units + v_allow;

  for d in
    select gs.dt::date
    from generate_series(
      p_from::timestamp,
      (p_to - 1)::timestamp,
      interval '1 day'
    ) gs (dt)
  loop
    occ := inventory.nightly_res_occ(p_room_type_id, p_chain_id, d);
    holds := inventory.nightly_soft_hold_units(p_room_type_id, p_chain_id, d);
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, v_cap - blk);
    rem := eff::bigint - occ - holds::bigint;
    v_arr := v_arr || jsonb_build_array(
      jsonb_build_object(
        'date', d::text,
        'occupancy', occ,
        'soft_hold_units', holds,
        'units_blocked', blk,
        'sellable_capacity', eff,
        'remaining_units', greatest(rem, 0),
        'bookable', rem > 0
      )
    );
  end loop;

  return v_arr;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: create / release soft hold
-- ---------------------------------------------------------------------------
create or replace function public.create_soft_hold (
  p_chain_id uuid,
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_ttl_seconds int default 900,
  p_units_held int default 1
) returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_hotel_chain uuid;
  v_rt_hotel uuid;
  v_rt_chain uuid;
  v_units int;
  v_allow int;
  v_cap int;
  v_ttl int;
  d date;
  occ bigint;
  holds int;
  blk int;
  eff int;
  used bigint;
  v_id uuid;
  v_exp timestamptz;
begin
  if p_check_out is null or p_check_in is null or p_check_out <= p_check_in then
    raise exception 'check_in and check_out must be dates with check_out > check_in' using errcode = '22023';
  end if;

  v_ttl := coalesce(p_ttl_seconds, 900);
  if v_ttl < 60 then
    raise exception 'ttl_seconds must be at least 60' using errcode = '22023';
  end if;
  if v_ttl > 86400 then
    raise exception 'ttl_seconds must not exceed 86400 (24 hours)' using errcode = '22023';
  end if;

  if p_units_held is null or p_units_held < 1 then
    raise exception 'units_held must be at least 1' using errcode = '22023';
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

  perform inventory.validate_booking_policies(p_hotel_id, p_check_in, p_check_out);

  select
    rt.hotel_id,
    rt.chain_id,
    rt.units_total,
    coalesce(rt.overbooking_allowance, 0)
  into v_rt_hotel, v_rt_chain, v_units, v_allow
  from inventory.room_type rt
  where rt.id = p_room_type_id;

  if v_rt_hotel is null then
    raise exception 'room_type not found' using errcode = '22023';
  end if;
  if v_rt_chain <> p_chain_id or v_rt_hotel <> p_hotel_id then
    raise exception 'room_type does not belong to this hotel/chain' using errcode = '22023';
  end if;

  if v_units is null or v_units < 1 then
    v_units := 1;
  end if;
  v_cap := v_units + v_allow;

  for d in
    select gs.dt::date
    from generate_series(
      p_check_in::timestamp,
      (p_check_out - 1)::timestamp,
      interval '1 day'
    ) gs (dt)
  loop
    occ := inventory.nightly_res_occ(p_room_type_id, p_chain_id, d);
    holds := inventory.nightly_soft_hold_units(p_room_type_id, p_chain_id, d);
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, v_cap - blk);
    used := occ + holds::bigint + p_units_held::bigint;
    if eff < 1 or used > eff then
      raise exception 'No capacity for soft hold on requested dates' using errcode = '22023';
    end if;
  end loop;

  v_exp := now () + make_interval(secs => v_ttl);

  insert into inventory.soft_hold (
    chain_id,
    hotel_id,
    room_type_id,
    check_in,
    check_out,
    units_held,
    expires_at
  )
  values (
    p_chain_id,
    p_hotel_id,
    p_room_type_id,
    p_check_in,
    p_check_out,
    p_units_held,
    v_exp
  )
  returning id into v_id;

  return jsonb_build_object(
    'hold_id', v_id::text,
    'expires_at', to_jsonb(v_exp)
  );
end;
$$;

create or replace function public.release_soft_hold (
  p_chain_id uuid,
  p_hold_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_deleted int;
begin
  delete from inventory.soft_hold h
  where h.id = p_hold_id
    and h.chain_id = p_chain_id;
  get diagnostics v_deleted = row_count;
  if v_deleted < 1 then
    raise exception 'hold not found' using errcode = '22023';
  end if;
  return jsonb_build_object('released', true);
end;
$$;

revoke all on function public.create_soft_hold (
  uuid,
  uuid,
  uuid,
  date,
  date,
  int,
  int
) from public;

grant execute on function public.create_soft_hold (
  uuid,
  uuid,
  uuid,
  date,
  date,
  int,
  int
) to service_role;

revoke all on function public.release_soft_hold (uuid, uuid) from public;

grant execute on function public.release_soft_hold (uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- FR-R11: optimistic concurrency on reservation_stub
-- ---------------------------------------------------------------------------
alter table reservations.reservation_stub
  add column if not exists row_version bigint not null default 1;

update reservations.reservation_stub
set row_version = 1
where row_version is null;

-- Bump on every reservation_stub UPDATE (status, timestamps, etc.). Guest PATCH also touches
-- reservation_stub.updated_at, so row_version stays in sync (FR-R11).
create or replace function reservations.bump_reservation_row_version ()
returns trigger
language plpgsql
security definer
set search_path = public, reservations
as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists reservation_stub_row_version_bump on reservations.reservation_stub;

create trigger reservation_stub_row_version_bump
  before update on reservations.reservation_stub
  for each row
  execute function reservations.bump_reservation_row_version ();

alter default privileges for role postgres in schema inventory
grant all on tables to service_role;

alter default privileges for role postgres in schema inventory
grant all on sequences to service_role;
