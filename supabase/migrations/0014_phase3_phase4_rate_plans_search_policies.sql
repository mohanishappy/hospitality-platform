-- Phase 3 (FR-C1–C3): rate plans, LOS tiers, promotions.
-- Phase 4 (FR-V3, V4, V1, V2): inventory blocks, booking policies, search + calendar RPCs.
-- Replaces public.room_type_availability_quote (adds optional rate_plan_code, promotion_code).
-- Replaces public.create_reservation_idempotent (adds same + booking policy / block-aware availability).

-- ---------------------------------------------------------------------------
-- Hotel booking policies (FR-V4)
-- ---------------------------------------------------------------------------
alter table inventory.hotel
  add column if not exists booking_min_los int not null default 1;

alter table inventory.hotel
  add column if not exists booking_max_los int;

alter table inventory.hotel
  add column if not exists booking_closed_arrival_dow smallint[] not null default '{}';

alter table inventory.hotel
  add column if not exists booking_closed_departure_dow smallint[] not null default '{}';

alter table inventory.hotel
  add column if not exists booking_timezone text not null default 'UTC';

alter table inventory.hotel
  add column if not exists booking_same_day_cutoff_time time;

alter table inventory.hotel drop constraint if exists hotel_booking_min_los_pos;

alter table inventory.hotel
  add constraint hotel_booking_min_los_pos check (booking_min_los >= 1);

alter table inventory.hotel drop constraint if exists hotel_booking_max_los_ge_min;

alter table inventory.hotel
  add constraint hotel_booking_max_los_ge_min check (
    booking_max_los is null or booking_max_los >= booking_min_los
  );

-- ---------------------------------------------------------------------------
-- Rate plans + LOS tiers (FR-C1, FR-C2)
-- ---------------------------------------------------------------------------
create table if not exists inventory.rate_plan (
  id uuid primary key default gen_random_uuid (),
  chain_id uuid not null references inventory.chain (id) on delete cascade,
  hotel_id uuid references inventory.hotel (id) on delete cascade,
  room_type_id uuid references inventory.room_type (id) on delete cascade,
  code text not null,
  label text,
  priority int not null default 0,
  valid_from date not null,
  valid_to date,
  nightly_rate_cents int,
  created_at timestamptz not null default now (),
  constraint rate_plan_valid_dates check (valid_to is null or valid_to >= valid_from),
  constraint rate_plan_scope check (
    room_type_id is null
    or hotel_id is not null
  )
);

create unique index if not exists rate_plan_chain_code_lower_idx
  on inventory.rate_plan (chain_id, lower(code));

create index if not exists rate_plan_chain_lookup_idx
  on inventory.rate_plan (chain_id, hotel_id, room_type_id, valid_from);

create table if not exists inventory.rate_plan_los_tier (
  id uuid primary key default gen_random_uuid (),
  rate_plan_id uuid not null references inventory.rate_plan (id) on delete cascade,
  min_nights int not null,
  max_nights int,
  nightly_rate_cents int not null,
  constraint rate_plan_los_tier_min check (min_nights >= 1),
  constraint rate_plan_los_tier_max check (
    max_nights is null or max_nights >= min_nights
  ),
  unique (rate_plan_id, min_nights)
);

-- ---------------------------------------------------------------------------
-- Promotions / coupons (FR-C3)
-- ---------------------------------------------------------------------------
create table if not exists inventory.promotion (
  id uuid primary key default gen_random_uuid (),
  chain_id uuid not null references inventory.chain (id) on delete cascade,
  code text not null,
  label text,
  active boolean not null default true,
  discount_percent_bps int not null default 0,
  discount_amount_cents bigint not null default 0,
  min_los int not null default 1,
  valid_from date not null,
  valid_to date,
  blackout_dates date[] not null default '{}',
  created_at timestamptz not null default now (),
  constraint promotion_pct_range check (
    discount_percent_bps >= 0 and discount_percent_bps <= 10000
  ),
  constraint promotion_amt_nonneg check (discount_amount_cents >= 0),
  constraint promotion_min_los check (min_los >= 1),
  constraint promotion_valid_dates check (valid_to is null or valid_to >= valid_from)
);

create unique index if not exists promotion_chain_code_lower_idx
  on inventory.promotion (chain_id, lower(code));

-- ---------------------------------------------------------------------------
-- Inventory blocks — reduce sellable units on nights (FR-V3)
-- ---------------------------------------------------------------------------
create table if not exists inventory.inventory_block (
  id uuid primary key default gen_random_uuid (),
  chain_id uuid not null references inventory.chain (id) on delete cascade,
  hotel_id uuid not null references inventory.hotel (id) on delete cascade,
  room_type_id uuid not null references inventory.room_type (id) on delete cascade,
  units_reduced int not null,
  start_date date not null,
  end_date date not null,
  label text,
  constraint inventory_block_units_pos check (units_reduced > 0),
  constraint inventory_block_dates check (end_date > start_date)
);

create index if not exists inventory_block_rt_nights_idx
  on inventory.inventory_block (room_type_id, chain_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- Nightly occupancy / blocks (shared by quote, create, calendar, search)
-- ---------------------------------------------------------------------------
create or replace function inventory.nightly_res_occ (
  p_room_type_id uuid,
  p_chain_id uuid,
  p_night date
) returns bigint
language sql
stable
security definer
set search_path = public, reservations, inventory
as $$
  select count(r.id)::bigint
  from reservations.reservation_stub r
  where r.room_type_id = p_room_type_id
    and r.chain_id = p_chain_id
    and r.status in ('pending', 'confirmed')
    and r.hotel_id is not null
    and r.check_in is not null
    and r.check_out is not null
    and r.check_in <= p_night
    and r.check_out > p_night;
$$;

create or replace function inventory.nightly_block_units (
  p_room_type_id uuid,
  p_chain_id uuid,
  p_night date
) returns int
language sql
stable
security definer
set search_path = public, reservations, inventory
as $$
  select coalesce(sum(b.units_reduced), 0)::int
  from inventory.inventory_block b
  where b.room_type_id = p_room_type_id
    and b.chain_id = p_chain_id
    and b.start_date <= p_night
    and b.end_date > p_night;
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
  blk int;
  eff int;
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
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, p_base_cap - blk);
    if eff < 1 or occ >= eff then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- FR-V4: min/max LOS, CTA/CTD by weekday (0=Sun .. 6=Sat in hotel local calendar), same-day cutoff.
create or replace function inventory.validate_booking_policies (
  p_hotel_id uuid,
  p_check_in date,
  p_check_out date
) returns void
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  h record;
  v_nights int;
  v_tz text;
  v_local_now timestamp;
  v_local_today date;
  v_dow_arr smallint;
  v_dow_dep smallint;
begin
  select
    booking_min_los,
    booking_max_los,
    booking_closed_arrival_dow,
    booking_closed_departure_dow,
    booking_timezone,
    booking_same_day_cutoff_time
  into h
  from inventory.hotel
  where id = p_hotel_id;

  if h is null then
    raise exception 'hotel not found' using errcode = '22023';
  end if;

  v_nights := (p_check_out - p_check_in);
  if v_nights < h.booking_min_los then
    raise exception 'stay shorter than hotel minimum length of stay' using errcode = '22023';
  end if;
  if h.booking_max_los is not null and v_nights > h.booking_max_los then
    raise exception 'stay longer than hotel maximum length of stay' using errcode = '22023';
  end if;

  v_tz := coalesce(nullif(trim(h.booking_timezone), ''), 'UTC');

  v_dow_arr := (
    extract(
      dow
      from (
        (p_check_in::text || ' 12:00:00')::timestamp without time zone at time zone v_tz
      )
    )
  )::smallint;

  if coalesce(array_length(h.booking_closed_arrival_dow, 1), 0) > 0
 and v_dow_arr = any (h.booking_closed_arrival_dow) then
    raise exception 'arrival not allowed on this weekday for this hotel' using errcode = '22023';
  end if;

  v_dow_dep := (
    extract(
      dow
      from (
        (p_check_out::text || ' 12:00:00')::timestamp without time zone at time zone v_tz
      )
    )
  )::smallint;

  if coalesce(array_length(h.booking_closed_departure_dow, 1), 0) > 0
     and v_dow_dep = any (h.booking_closed_departure_dow) then
    raise exception 'departure not allowed on this weekday for this hotel' using errcode = '22023';
  end if;

  v_local_now := (now() at time zone v_tz);
  v_local_today := v_local_now::date;

  if p_check_in = v_local_today and h.booking_same_day_cutoff_time is not null then
    if (v_local_now::time) >= h.booking_same_day_cutoff_time then
      raise exception 'same-day booking after hotel cutoff time' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- Unified pricing (BAR + rate plan + LOS tier + promotion). Returns JSON for quote/snapshot.
create or replace function inventory.compute_stay_pricing (
  p_chain_id uuid,
  p_hotel_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_rate_plan_code text,
  p_promotion_code text
) returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_base int;
  v_tax_bps int;
  v_fee int;
  v_curr text;
  v_nights int;
  v_nightly int;
  v_plan record;
  v_tier_nightly int;
  v_tier_min int;
  v_room_sub bigint;
  v_disc_pct int;
  v_disc_amt bigint;
  v_discount bigint;
  v_room_net bigint;
  v_tax bigint;
  v_total bigint;
  v_fees jsonb;
  v_promo record;
  v_promo_code text;
  v_plan_code text;
  v_blackout_hit boolean;
begin
  v_nights := (p_check_out - p_check_in);

  select
    coalesce(rt.base_rate_cents, 0),
    coalesce(rt.tax_rate_bps, 0),
    coalesce(rt.fee_fixed_cents, 0),
    coalesce(nullif(trim(rt.currency), ''), c.default_currency, 'USD')
  into v_base, v_tax_bps, v_fee, v_curr
  from inventory.room_type rt
  join inventory.chain c on c.id = rt.chain_id
  where rt.id = p_room_type_id
    and rt.chain_id = p_chain_id
    and rt.hotel_id = p_hotel_id;

  if v_curr is null then
    raise exception 'room_type not found' using errcode = '22023';
  end if;

  v_nightly := v_base;

  select rp.*
  into v_plan
  from inventory.rate_plan rp
  where rp.chain_id = p_chain_id
    and rp.valid_from <= (p_check_out - 1)
    and (rp.valid_to is null or rp.valid_to >= p_check_in)
    and (rp.hotel_id is null or rp.hotel_id = p_hotel_id)
    and (rp.room_type_id is null or rp.room_type_id = p_room_type_id)
    and (
      p_rate_plan_code is null
      or length(trim(p_rate_plan_code)) = 0
      or lower(rp.code) = lower(trim(p_rate_plan_code))
    )
  order by rp.priority desc, rp.valid_from desc
  limit 1;

  if p_rate_plan_code is not null
     and length(trim(p_rate_plan_code)) > 0
     and v_plan.id is null then
    raise exception 'rate_plan not found or not valid for this stay' using errcode = '22023';
  end if;

  v_plan_code := null;
  v_tier_min := null;

  if v_plan.id is not null then
    v_plan_code := v_plan.code;
    select t.nightly_rate_cents, t.min_nights
    into v_tier_nightly, v_tier_min
    from inventory.rate_plan_los_tier t
    where t.rate_plan_id = v_plan.id
      and t.min_nights <= v_nights
      and (t.max_nights is null or t.max_nights >= v_nights)
    order by t.min_nights desc
    limit 1;

    if v_tier_nightly is not null then
      v_nightly := v_tier_nightly;
    elsif v_plan.nightly_rate_cents is not null then
      v_nightly := v_plan.nightly_rate_cents;
    end if;
  end if;

  v_room_sub := v_nightly::bigint * v_nights;

  v_discount := 0;
  v_promo_code := null;

  if p_promotion_code is not null and length(trim(p_promotion_code)) > 0 then
    select pr.*
    into v_promo
    from inventory.promotion pr
    where pr.chain_id = p_chain_id
      and pr.active
      and lower(pr.code) = lower(trim(p_promotion_code))
      and pr.valid_from <= p_check_in
      and (pr.valid_to is null or pr.valid_to >= (p_check_out - 1))
      and pr.min_los <= v_nights
    limit 1;

    if v_promo.id is null then
      raise exception 'promotion not found or not valid for this stay' using errcode = '22023';
    end if;

    select exists (
      select 1
      from generate_series(
        p_check_in::timestamp,
        (p_check_out - 1)::timestamp,
        interval '1 day'
      ) gs (dt)
      where (gs.dt::date) = any (v_promo.blackout_dates)
    )
    into v_blackout_hit;

    if v_blackout_hit then
      raise exception 'promotion blocked for these stay dates' using errcode = '22023';
    end if;

    v_promo_code := v_promo.code;
    v_disc_pct := v_promo.discount_percent_bps;
    v_disc_amt := v_promo.discount_amount_cents;
    v_discount := least(
      v_room_sub,
      (round(v_room_sub * v_disc_pct / 10000.0))::bigint + v_disc_amt
    );
  end if;

  v_room_net := greatest(0::bigint, v_room_sub - v_discount);
  v_tax := round(v_room_net * v_tax_bps / 10000.0)::bigint;
  v_total := v_room_net + v_tax + v_fee::bigint;

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

  return jsonb_build_object(
    'currency', v_curr,
    'base_rate_cents_per_night', v_base,
    'nightly_rate_cents', v_nightly,
    'nights', v_nights,
    'room_subtotal_cents', v_room_sub,
    'discount_cents', v_discount,
    'room_net_before_tax_cents', v_room_net,
    'tax_rate_bps', v_tax_bps,
    'tax_cents', v_tax,
    'fee_fixed_cents', v_fee,
    'fee_line_items', v_fees,
    'total_cents', v_total,
    'rate_plan_code', v_plan_code,
    'los_tier_min_nights', v_tier_min,
    'promotion_code', v_promo_code,
    'rounding', 'integer_cents_half_up'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Quote RPC (replaces 5-arg)
-- ---------------------------------------------------------------------------
drop function if exists public.room_type_availability_quote (
  uuid,
  uuid,
  uuid,
  date,
  date
);

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
  v_min_rem bigint;
  d date;
  occ bigint;
  blk int;
  eff int;
  rem bigint;
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
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, v_cap - blk);
    rem := eff::bigint - occ;
    if occ > v_max_occ then
      v_max_occ := occ;
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

revoke all on function public.room_type_availability_quote (
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text
) from public;

grant execute on function public.room_type_availability_quote (
  uuid,
  uuid,
  uuid,
  date,
  date,
  text,
  text
) to service_role;

-- ---------------------------------------------------------------------------
-- Create reservation (13-arg)
-- ---------------------------------------------------------------------------
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
  text,
  bigint
);

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
  p_expected_total_cents bigint default null,
  p_rate_plan_code text default null,
  p_promotion_code text default null
) returns jsonb
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
  v_pricing jsonb;
  v_total bigint;
  v_snapshot jsonb;
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

  perform inventory.validate_booking_policies(p_hotel_id, p_check_in, p_check_out);

  select
    rt.hotel_id,
    rt.chain_id,
    rt.units_total,
    coalesce(rt.overbooking_allowance, 0)
  into v_rt_hotel, v_rt_chain, v_units, v_allow
  from inventory.room_type rt
  where rt.id = p_room_type_id;

  if v_rt_hotel is null then raise exception 'room_type not found' using errcode = '22023'; end if;
  if v_rt_chain <> p_chain_id or v_rt_hotel <> p_hotel_id then
    raise exception 'room_type does not belong to this hotel/chain' using errcode = '22023';
  end if;

  if v_units is null or v_units < 1 then v_units := 1; end if;
  v_cap := v_units + v_allow;

  v_pricing := inventory.compute_stay_pricing(
    p_chain_id,
    p_hotel_id,
    p_room_type_id,
    p_check_in,
    p_check_out,
    p_rate_plan_code,
    p_promotion_code
  );

  v_total := (v_pricing->>'total_cents')::bigint;

  v_snapshot := jsonb_build_object(
    'currency', v_pricing->'currency',
    'room_subtotal_cents', v_pricing->'room_subtotal_cents',
    'discount_cents', v_pricing->'discount_cents',
    'room_net_before_tax_cents', v_pricing->'room_net_before_tax_cents',
    'tax_rate_bps', v_pricing->'tax_rate_bps',
    'tax_cents', v_pricing->'tax_cents',
    'fee_line_items', v_pricing->'fee_line_items',
    'total_cents', v_pricing->'total_cents',
    'nights', v_pricing->'nights',
    'nightly_rate_cents', v_pricing->'nightly_rate_cents',
    'rate_plan_code', v_pricing->'rate_plan_code',
    'promotion_code', v_pricing->'promotion_code',
    'los_tier_min_nights', v_pricing->'los_tier_min_nights',
    'rounding', v_pricing->'rounding'
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

  if not inventory.stay_is_bookable(
    p_room_type_id,
    p_chain_id,
    p_check_in,
    p_check_out,
    v_cap
  ) then
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
  bigint,
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
  text,
  bigint,
  text,
  text
) to service_role;

-- ---------------------------------------------------------------------------
-- Search (FR-V1)
-- ---------------------------------------------------------------------------
create or replace function public.inventory_search_stays (
  p_chain_id uuid,
  p_check_in date,
  p_check_out date,
  p_hotel_ids uuid[] default null,
  p_sort text default 'price',
  p_limit int default 20,
  p_rate_plan_code text default null,
  p_promotion_code text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  rec record;
  v_cap int;
  v_bookable boolean;
  v_pricing jsonb;
  v_q jsonb;
  v_arr jsonb := '[]'::jsonb;
  v_lim int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_policies_ok boolean;
  v_sort text := lower(trim(coalesce(p_sort, 'price')));
begin
  if p_check_out is null or p_check_in is null or p_check_out <= p_check_in then
    raise exception 'check_in and check_out must be dates with check_out > check_in' using errcode = '22023';
  end if;

  for rec in
    select
      rt.id as room_type_id,
      rt.hotel_id,
      rt.name as room_type_name,
      rt.units_total,
      coalesce(rt.overbooking_allowance, 0) as overbooking_allowance,
      h.name as hotel_name
    from inventory.room_type rt
    join inventory.hotel h on h.id = rt.hotel_id
    where rt.chain_id = p_chain_id
      and (p_hotel_ids is null or rt.hotel_id = any (p_hotel_ids))
    order by h.code, rt.code
  loop
    begin
      perform inventory.validate_booking_policies(
        rec.hotel_id,
        p_check_in,
        p_check_out
      );
      v_policies_ok := true;
    exception
      when sqlstate '22023' then
        v_policies_ok := false;
      when others then
        raise;
    end;

    if not v_policies_ok then
      continue;
    end if;

    if rec.units_total is null or rec.units_total < 1 then
      v_cap := 1 + rec.overbooking_allowance;
    else
      v_cap := rec.units_total + rec.overbooking_allowance;
    end if;

    v_bookable := inventory.stay_is_bookable(
      rec.room_type_id,
      p_chain_id,
      p_check_in,
      p_check_out,
      v_cap
    );

    v_pricing := inventory.compute_stay_pricing(
      p_chain_id,
      rec.hotel_id,
      rec.room_type_id,
      p_check_in,
      p_check_out,
      p_rate_plan_code,
      p_promotion_code
    );

    v_q := jsonb_build_object(
      'hotel_id', rec.hotel_id::text,
      'hotel_name', rec.hotel_name,
      'room_type_id', rec.room_type_id::text,
      'room_type_name', rec.room_type_name,
      'check_in', p_check_in::text,
      'check_out', p_check_out::text,
      'nights', (p_check_out - p_check_in),
      'bookable', v_bookable,
      'pricing', v_pricing
    );

    v_arr := v_arr || jsonb_build_array(v_q);
  end loop;

  return (
    with ordered as (
      select
        el,
        row_number() over (
          order by
            case
              when v_sort = 'bookable' then case when (el->>'bookable')::boolean then 0 else 1 end
              else 0
            end,
            (el->'pricing'->>'total_cents')::bigint nulls last
        ) as rn
      from jsonb_array_elements(v_arr) as t(el)
    )
    select coalesce(
      jsonb_agg(el order by rn),
      '[]'::jsonb
    )
    from ordered
    where rn <= v_lim
  );
end;
$$;

revoke all on function public.inventory_search_stays (
  uuid,
  date,
  date,
  uuid[],
  text,
  int,
  text,
  text
) from public;

grant execute on function public.inventory_search_stays (
  uuid,
  date,
  date,
  uuid[],
  text,
  int,
  text,
  text
) to service_role;

-- ---------------------------------------------------------------------------
-- Calendar (FR-V2)
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
    blk := inventory.nightly_block_units(p_room_type_id, p_chain_id, d);
    eff := greatest(0, v_cap - blk);
    rem := eff::bigint - occ;
    v_arr := v_arr || jsonb_build_array(
      jsonb_build_object(
        'date', d::text,
        'occupancy', occ,
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

revoke all on function public.room_type_availability_calendar (
  uuid,
  uuid,
  uuid,
  date,
  date
) from public;

grant execute on function public.room_type_availability_calendar (
  uuid,
  uuid,
  uuid,
  date,
  date
) to service_role;

-- ---------------------------------------------------------------------------
-- Demo seed (optional examples; idempotent)
-- ---------------------------------------------------------------------------
insert into inventory.rate_plan (
  chain_id,
  hotel_id,
  room_type_id,
  code,
  label,
  priority,
  valid_from,
  valid_to,
  nightly_rate_cents
)
select
  rt.chain_id,
  rt.hotel_id,
  rt.id,
  'LOS3',
  'Three-night LOS example',
  5,
  '2020-01-01'::date,
  null,
  null
from inventory.room_type rt
join inventory.hotel h on h.id = rt.hotel_id
join inventory.chain c on c.id = rt.chain_id
where c.code = 'DEMO'
  and h.code = 'DEMO-H1'
  and rt.code = 'STD-QN'
 and not exists (
    select 1
    from inventory.rate_plan rp
    where rp.chain_id = rt.chain_id
      and lower(rp.code) = 'los3'
  );

insert into inventory.rate_plan_los_tier (rate_plan_id, min_nights, max_nights, nightly_rate_cents)
select rp.id, 3, null, 9000
from inventory.rate_plan rp
join inventory.chain c on c.id = rp.chain_id
where c.code = 'DEMO'
  and lower(rp.code) = 'los3'
on conflict (rate_plan_id, min_nights) do nothing;

insert into inventory.promotion (
  chain_id,
  code,
  label,
  discount_percent_bps,
  discount_amount_cents,
  min_los,
  valid_from,
  valid_to,
  blackout_dates
)
select
  c.id,
  'SAVE5',
  '5% off demo',
  500,
  0,
  1,
  '2020-01-01'::date,
  null,
  '{}'::date[]
from inventory.chain c
where c.code = 'DEMO'
  and not exists (
    select 1
    from inventory.promotion p
    where p.chain_id = c.id
      and lower(p.code) = 'save5'
  );

alter default privileges for role postgres in schema inventory
grant all on tables to service_role;

alter default privileges for role postgres in schema inventory
grant all on sequences to service_role;
