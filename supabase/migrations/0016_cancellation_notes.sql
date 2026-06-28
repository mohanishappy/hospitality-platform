-- Phase 6 (FR-R9, FR-R10): cancellation metadata and reservation notes.

alter table reservations.reservation_stub
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists internal_note text,
  add column if not exists guest_note text;

-- Backfill cancelled_at for rows already in cancelled status.
update reservations.reservation_stub
set
  cancelled_at = coalesce(cancelled_at, updated_at)
where
  status = 'cancelled'
  and cancelled_at is null;

alter table reservations.reservation_stub
  drop constraint if exists reservation_stub_cancellation_reason_check;

alter table reservations.reservation_stub
  add constraint reservation_stub_cancellation_reason_check check (
    cancellation_reason is null
    or cancellation_reason in (
      'guest_request',
      'no_show',
      'duplicate',
      'rate_dispute',
      'other'
    )
  );

alter table reservations.reservation_stub
  drop constraint if exists reservation_stub_cancelled_metadata_check;

alter table reservations.reservation_stub
  add constraint reservation_stub_cancelled_metadata_check check (
    (
      status = 'cancelled'
      and cancelled_at is not null
    )
    or (
      status <> 'cancelled'
      and cancelled_at is null
      and cancellation_reason is null
    )
  );
