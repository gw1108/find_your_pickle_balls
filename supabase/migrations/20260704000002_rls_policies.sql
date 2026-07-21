-- RLS everywhere (PLAN.md §4.4). Block = mutual invisibility across profiles,
-- events, and check-ins via is_blocked_pair().

alter table profiles enable row level security;
alter table blocks enable row level security;
alter table venues enable row level security;
alter table events enable row level security;
alter table rsvps enable row level security;
alter table checkins enable row level security;
alter table reports enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "profiles: visible unless blocked"
  on profiles for select to authenticated
  using (id = auth.uid() or not is_blocked_pair(id, auth.uid()));

create policy "profiles: insert own"
  on profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles: update own"
  on profiles for update to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Blocks — you see and manage only the blocks you created
-- ---------------------------------------------------------------------------
create policy "blocks: own"
  on blocks for select to authenticated
  using (blocker_id = auth.uid());

create policy "blocks: create own"
  on blocks for insert to authenticated
  with check (blocker_id = auth.uid());

create policy "blocks: delete own"
  on blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Venues — public map layer; submissions from any signed-in user
-- ---------------------------------------------------------------------------
create policy "venues: public read"
  on venues for select
  using (true);

create policy "venues: authenticated submit"
  on venues for insert to authenticated
  with check (submitted_by = auth.uid() and source = 'user' and not verified);

-- ---------------------------------------------------------------------------
-- Events — visible unless host↔viewer blocked; host manages own
-- ---------------------------------------------------------------------------
create policy "events: visible unless blocked"
  on events for select to authenticated
  using (host_id = auth.uid() or not is_blocked_pair(host_id, auth.uid()));

create policy "events: host create"
  on events for insert to authenticated
  with check (host_id = auth.uid());

create policy "events: host update"
  on events for update to authenticated
  using (host_id = auth.uid());

create policy "events: host delete"
  on events for delete to authenticated
  using (host_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RSVPs — attendee lists visible to event viewers minus blocked pairs;
-- one-tap join writes your own row only
-- ---------------------------------------------------------------------------
create policy "rsvps: visible unless blocked"
  on rsvps for select to authenticated
  using (user_id = auth.uid() or not is_blocked_pair(user_id, auth.uid()));

create policy "rsvps: join as self"
  on rsvps for insert to authenticated
  with check (user_id = auth.uid());

create policy "rsvps: update own"
  on rsvps for update to authenticated
  using (user_id = auth.uid());

create policy "rsvps: leave own"
  on rsvps for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Check-ins (§6.1 privacy rules): rows readable only by their owner.
-- Everyone else sees aggregates through venue_occupancy() (counts);
-- name-level visibility for mutuals/attendees arrives with Phase 2 social graph.
-- ---------------------------------------------------------------------------
create policy "checkins: own rows"
  on checkins for select to authenticated
  using (user_id = auth.uid());

create policy "checkins: check in as self"
  on checkins for insert to authenticated
  with check (user_id = auth.uid());

create policy "checkins: check out own"
  on checkins for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Reports — write-only for reporters; queue is read via service role/admin
-- ---------------------------------------------------------------------------
create policy "reports: file as self"
  on reports for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "reports: read own"
  on reports for select to authenticated
  using (reporter_id = auth.uid());
