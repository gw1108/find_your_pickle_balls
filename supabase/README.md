# Supabase

Source of truth for users/events/venues (Stream stores only chat messages, PLAN.md §4.4).

## Setup

1. Create the project at supabase.com (or `pnpm dlx supabase init && pnpm dlx supabase start` for local).
2. Link: `pnpm dlx supabase link --project-ref <ref>`
3. Push migrations: `pnpm dlx supabase db push`
4. Enable extensions in Dashboard → Database → Extensions if not already: `postgis`, `pg_cron`.

## Layout

- `migrations/` — ordered SQL migrations (schema, RLS, RPCs, cron jobs)
- `seed.sql` — dev seed data (a few Austin venues + test events)
