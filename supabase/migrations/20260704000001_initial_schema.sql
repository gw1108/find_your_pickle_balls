-- Initial schema (PLAN.md §4.4): profiles, venues, events, rsvps, checkins,
-- reports, blocks. PostGIS geography + GiST for all geo queries.

-- Install into extensions schema, not public: keeps spatial_ref_sys out of
-- the PostgREST-exposed schema (Supabase linter 0013). extensions is on the
-- default search_path, so geography/st_* still resolve unqualified.
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type sport as enum ('pickleball', 'basketball', 'running', 'tennis');
create type skill_level as enum ('beginner', 'intermediate', 'advanced', 'expert');
create type event_status as enum ('active', 'cancelled', 'completed');
create type rsvp_status as enum ('going', 'waitlist', 'left');
create type venue_source as enum ('osm', 'fsq_os', 'user', 'admin');
create type report_target as enum ('user', 'event', 'photo', 'message');
create type report_status as enum ('open', 'actioned', 'dismissed');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users; ig_handle is optional connect-later, §3)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  bio text check (char_length(bio) <= 300),
  sports sport[] not null default '{}',
  skill_levels jsonb not null default '{}'::jsonb,
  ig_handle text unique check (ig_handle ~ '^[a-z0-9._]{1,30}$'),
  ghost_mode boolean not null default false,
  birthdate date not null,
  created_at timestamptz not null default now(),
  -- 18+ gate (§8) enforced at the database, not just the UI
  constraint adults_only check (birthdate <= (now() - interval '18 years')::date)
);

-- ---------------------------------------------------------------------------
-- Blocks (mutual invisibility, enforced in RLS everywhere below)
-- ---------------------------------------------------------------------------
create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- True when either user has blocked the other. SECURITY DEFINER so RLS
-- policies can consult the blocks table without exposing it.
create function is_blocked_pair(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

-- ---------------------------------------------------------------------------
-- Venues (§6 — seeded from OSM/FSQ OS, user submissions fill gaps)
-- ---------------------------------------------------------------------------
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  sports sport[] not null check (cardinality(sports) > 0),
  location geography (point, 4326) not null,
  address text,
  court_count int check (court_count > 0),
  source venue_source not null default 'user',
  verified boolean not null default false,
  submitted_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index venues_location_gist on venues using gist (location);

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references profiles (id) on delete cascade,
  venue_id uuid references venues (id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 2000),
  sport sport not null,
  skill_min skill_level,
  skill_max skill_level,
  location geography (point, 4326) not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  player_cap int check (player_cap between 2 and 500),
  recurrence_id uuid,
  stream_channel_id text,
  status event_status not null default 'active',
  created_at timestamptz not null default now()
);
create index events_location_gist on events using gist (location);
create index events_starts_at on events (starts_at);

-- ---------------------------------------------------------------------------
-- RSVPs (one-tap join — no host approval, §2)
-- ---------------------------------------------------------------------------
create table rsvps (
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status rsvp_status not null default 'going',
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index rsvps_user on rsvps (user_id);

-- ---------------------------------------------------------------------------
-- Check-ins (§6.1 live occupancy — opt-in, venue-snapped, TTL-expired)
-- ---------------------------------------------------------------------------
create table checkins (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  sport sport not null,
  expires_at timestamptz not null default now() + interval '2 hours',
  created_at timestamptz not null default now()
);
create index checkins_venue_live on checkins (venue_id, expires_at);
-- one live check-in per user
create unique index checkins_one_live_per_user
  on checkins (user_id);

-- ---------------------------------------------------------------------------
-- Reports (moderation queue, §8 — 24h SLA)
-- ---------------------------------------------------------------------------
create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id) on delete cascade,
  target_kind report_target not null,
  target_id text not null,
  reason text not null check (char_length(reason) between 1 and 1000),
  status report_status not null default 'open',
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now()
);
create index reports_open on reports (status, created_at) where status = 'open';
