-- Staff invite flow + DB-driven roles (Phase 9B).

alter table inventory.staff_member
  add column if not exists status text not null default 'active',
  add column if not exists intended_role text not null default 'front_desk';

alter table inventory.staff_member
  drop constraint if exists staff_member_status_check;

alter table inventory.staff_member
  add constraint staff_member_status_check
  check (status in ('pending', 'active', 'disabled'));

alter table inventory.staff_member
  drop constraint if exists staff_member_intended_role_check;

alter table inventory.staff_member
  add constraint staff_member_intended_role_check
  check (intended_role in ('manager', 'front_desk', 'read_only'));

alter table inventory.staff_member
  alter column auth0_sub drop not null;

alter table inventory.staff_member
  drop constraint if exists staff_member_enterprise_sub_uq;

create unique index if not exists staff_member_enterprise_sub_uq
  on inventory.staff_member (enterprise_id, auth0_sub)
  where auth0_sub is not null;

create table if not exists inventory.staff_invite (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references inventory.staff_member (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references inventory.staff_member (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_invite_staff_member_id_idx
  on inventory.staff_invite (staff_member_id);

grant select, insert, update, delete on table inventory.staff_invite to service_role;

-- Backfill demo rows for DB-driven claims (Action lookup by email).
update inventory.staff_member
set
  status = 'active',
  intended_role = 'manager',
  active = true
where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

update inventory.staff_member
set
  status = 'active',
  intended_role = 'front_desk',
  active = true
where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
