-- Restore Supabase's standard schema grants. Tables created by our db-push
-- migrations did not inherit the project's default privileges, so every API
-- request died with "permission denied for table <x>" before RLS even ran
-- (observed live 2026-07-06: anon on events, authenticated on profiles).
-- This mirrors a stock Supabase project: broad table grants to the API roles,
-- with RLS (already enabled on every table) doing the actual row gating.

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public
  to anon, authenticated, service_role;
grant all privileges on all sequences in schema public
  to anon, authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

-- and make sure future tables/functions from later migrations get the same
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
