-- Phase 9E/9G: platform operators + enterprise suspend flag.

alter table inventory.enterprise
  add column if not exists active boolean not null default true;

update inventory.enterprise
set active = true
where active is distinct from true;

create table if not exists inventory.platform_operator (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  auth0_sub text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_operator_email_unique unique (email),
  constraint platform_operator_auth0_sub_unique unique (auth0_sub)
);

create index if not exists platform_operator_email_lower_idx
  on inventory.platform_operator (lower(email));

comment on table inventory.platform_operator is
  'Internal ops users; Post Login Action adds platform_operator role when email matches.';

-- Bootstrap: insert into inventory.platform_operator (email) values ('ops@yourcompany.com');
