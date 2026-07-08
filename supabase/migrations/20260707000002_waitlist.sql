-- Waitlist signups from the marketing site (PLAN.md §12 Phase 3, GTM §11).
-- Inserts arrive via the worker's POST /waitlist using the anon key; the
-- worker lowercases/validates the email first. No API role can read the
-- list back (no select policy) — export via the dashboard/SQL when needed.

create table waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           and char_length(email) <= 254),
  -- where the signup came from: 'landing' | 'event-page' | ...
  source text check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);

alter table waitlist enable row level security;

create policy waitlist_insert on waitlist
  for insert to anon, authenticated
  with check (true);
