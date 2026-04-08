-- PostgREST (Data API) uses the JWT role. Workers use the service_role key.
-- Custom schemas often need explicit grants; without them the API can 500 even when SQL Editor works.

grant usage on schema inventory to service_role;
grant all privileges on all tables in schema inventory to service_role;
grant all privileges on all sequences in schema inventory to service_role;

grant usage on schema reservations to service_role;
grant all privileges on all tables in schema reservations to service_role;
grant all privileges on all sequences in schema reservations to service_role;

alter default privileges for role postgres in schema inventory
grant all on tables to service_role;
alter default privileges for role postgres in schema inventory
grant all on sequences to service_role;

alter default privileges for role postgres in schema reservations
grant all on tables to service_role;
alter default privileges for role postgres in schema reservations
grant all on sequences to service_role;

