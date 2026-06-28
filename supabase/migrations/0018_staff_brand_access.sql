-- Staff brand access (admin-portal source of truth). Auth0 supplies identity + coarse roles only.

create table if not exists inventory.staff_member (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references inventory.enterprise (id) on delete cascade,
  auth0_sub text not null,
  email text not null,
  display_name text,
  /** When true, staff may access every chain in the enterprise (corporate / manager). */
  all_chains boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_member_enterprise_sub_uq unique (enterprise_id, auth0_sub),
  constraint staff_member_enterprise_email_uq unique (enterprise_id, email)
);

create index if not exists staff_member_enterprise_id_idx
  on inventory.staff_member (enterprise_id);

create table if not exists inventory.staff_chain_grant (
  staff_member_id uuid not null references inventory.staff_member (id) on delete cascade,
  chain_id uuid not null references inventory.chain (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (staff_member_id, chain_id)
);

create index if not exists staff_chain_grant_chain_id_idx
  on inventory.staff_chain_grant (chain_id);

-- M2M integrations (Auth0 client_credentials) — same grant model as staff.
create table if not exists inventory.integration_client (
  id uuid primary key default gen_random_uuid(),
  enterprise_id uuid not null references inventory.enterprise (id) on delete cascade,
  auth0_client_id text not null unique,
  name text not null,
  all_chains boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists inventory.integration_chain_grant (
  integration_client_id uuid not null references inventory.integration_client (id) on delete cascade,
  chain_id uuid not null references inventory.chain (id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (integration_client_id, chain_id)
);

grant select, insert, update, delete on table inventory.staff_member to service_role;
grant select, insert, update, delete on table inventory.staff_chain_grant to service_role;
grant select, insert, update, delete on table inventory.integration_client to service_role;
grant select, insert, update, delete on table inventory.integration_chain_grant to service_role;

-- Demo: corporate manager (all PLG brands). Replace auth0_sub with your JWT `sub` after first login.
insert into inventory.staff_member (
  id,
  enterprise_id,
  auth0_sub,
  email,
  display_name,
  all_chains
)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'seed|plg-manager',
  'manager@plg.demo',
  'PLG Corporate Manager',
  true
)
on conflict (enterprise_id, auth0_sub) do nothing;

-- Demo: Harborline-only front desk. Update auth0_sub to match your Auth0 user `sub`.
insert into inventory.staff_member (
  id,
  enterprise_id,
  auth0_sub,
  email,
  display_name,
  all_chains
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'seed|hbr-front-desk',
  'frontdesk@hbr.demo',
  'Harborline Front Desk',
  false
)
on conflict (enterprise_id, auth0_sub) do nothing;

insert into inventory.staff_chain_grant (staff_member_id, chain_id)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'a1111111-1111-4111-8111-111111111111'
)
on conflict do nothing;
