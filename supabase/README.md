# Supabase

Source of truth for everything — users/events/venues *and* chat (channels/messages on Supabase Realtime, PLAN.md §5).

## Setup

1. Create the project at supabase.com (or `pnpm dlx supabase init && pnpm dlx supabase start` for local).
2. Link: `pnpm dlx supabase link --project-ref <ref>`
3. Push migrations: `pnpm dlx supabase db push`
4. Enable extensions in Dashboard → Database → Extensions if not already: `postgis`, `pg_cron`.

## Layout

- `migrations/` — ordered SQL migrations (schema, RLS, RPCs, cron jobs)
- `seed.sql` — dev seed data (a few Austin venues + test events)
- `venues_import.sql` — generated Austin venue layer (PLAN.md §6). Regenerate
  with `node scripts/import-venues.mjs`; apply via the dashboard SQL editor or
  psql. Idempotent (skips venues already present within 100 m of same name).
