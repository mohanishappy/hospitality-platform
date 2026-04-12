-- Return JSON so API can use 201 on first create vs 200 on idempotent replay.
-- Normalize idempotency keys with trim() so repeats match ledger rows.

drop function if exists public.create_reservation_idempotent (uuid, text);

create or replace function public.create_reservation_idempotent (p_chain_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, reservations, inventory
as $$
declare
  v_key text := trim(p_idempotency_key);
  v_existing uuid;
  v_reservation_id uuid;
begin
  if v_key is null or length(v_key) = 0 then
    raise exception 'idempotency_key required' using errcode = '22023';
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
    insert into reservations.reservation_stub (chain_id)
    values (p_chain_id)
    returning id into v_reservation_id;

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

revoke all on function public.create_reservation_idempotent (uuid, text) from public;
grant execute on function public.create_reservation_idempotent (uuid, text) to service_role;

