-- RPCs (PLAN.md §4.4) + profile bootstrap trigger + check-in TTL sweep.

-- ---------------------------------------------------------------------------
-- events_near: the map query. SECURITY INVOKER (default) so the caller's RLS
-- applies — blocked hosts' events never leave the database.
-- ---------------------------------------------------------------------------
create function events_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 25000,
  p_sport sport default null,
  p_skill skill_level default null,
  p_after timestamptz default now()
)
returns table (
  id uuid,
  host_id uuid,
  venue_id uuid,
  title text,
  sport sport,
  skill_min skill_level,
  skill_max skill_level,
  lat double precision,
  lng double precision,
  starts_at timestamptz,
  ends_at timestamptz,
  player_cap int,
  going_count bigint,
  distance_m double precision
)
language sql stable
as $$
  select
    e.id, e.host_id, e.venue_id, e.title, e.sport, e.skill_min, e.skill_max,
    st_y(e.location::geometry) as lat,
    st_x(e.location::geometry) as lng,
    e.starts_at, e.ends_at, e.player_cap,
    (select count(*) from rsvps r
      where r.event_id = e.id and r.status = 'going') as going_count,
    st_distance(e.location, st_point(p_lng, p_lat)::geography) as distance_m
  from events e
  where e.status = 'active'
    and e.starts_at >= p_after
    and st_dwithin(e.location, st_point(p_lng, p_lat)::geography, p_radius_m)
    and (p_sport is null or e.sport = p_sport)
    and (p_skill is null or (
      (e.skill_min is null or e.skill_min <= p_skill) and
      (e.skill_max is null or e.skill_max >= p_skill)
    ))
  order by e.location <-> st_point(p_lng, p_lat)::geography
  limit 200;
$$;

-- ---------------------------------------------------------------------------
-- venue_occupancy: live pin state (§6.1). SECURITY DEFINER — clients never
-- read checkin rows directly; only aggregates leave the database. Ghost-mode
-- users are excluded from every aggregate.
-- ---------------------------------------------------------------------------
create function venue_occupancy(p_venue_id uuid)
returns table (
  venue_id uuid,
  checkin_count bigint,
  by_sport jsonb,
  expected_from_rsvps bigint
)
language sql stable security definer set search_path = public
as $$
  select
    p_venue_id,
    count(*) as checkin_count,
    coalesce(
      jsonb_object_agg(s.sport, s.n) filter (where s.sport is not null),
      '{}'::jsonb
    ) as by_sport,
    (
      select count(distinct r.user_id)
      from events e
      join rsvps r on r.event_id = e.id and r.status = 'going'
      where e.venue_id = p_venue_id
        and e.status = 'active'
        and e.starts_at between now() - interval '1 hour' and now() + interval '2 hours'
    ) as expected_from_rsvps
  from (
    select c.sport, count(*) as n
    from checkins c
    join profiles p on p.id = c.user_id and not p.ghost_mode
    where c.venue_id = p_venue_id and c.expires_at > now()
    group by c.sport
  ) s
$$;

-- ---------------------------------------------------------------------------
-- event_public: minimal fields for the /e/:eventId OG page (worker, §7).
-- SECURITY DEFINER + anon grant — exposes nothing personal.
-- ---------------------------------------------------------------------------
create function event_public(p_event_id uuid)
returns table (
  id uuid,
  title text,
  sport sport,
  starts_at timestamptz,
  player_cap int,
  going_count bigint
)
language sql stable security definer set search_path = public
as $$
  select
    e.id, e.title, e.sport, e.starts_at, e.player_cap,
    (select count(*) from rsvps r
      where r.event_id = e.id and r.status = 'going') as going_count
  from events e
  where e.id = p_event_id and e.status = 'active';
$$;

grant execute on function event_public(uuid) to anon;

-- ---------------------------------------------------------------------------
-- Profile bootstrap: create a stub profile row on signup so the app can
-- upsert onto it. Birthdate placeholder forces the 18+ onboarding step —
-- the app must collect the real DOB before the profile is usable.
-- ---------------------------------------------------------------------------
create function handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name, birthdate)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New player'),
    '1900-01-01'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Check-in TTL sweep (§6.1): pg_cron deletes expired rows every 15 minutes.
-- Guarded so local stacks without pg_cron still migrate cleanly — live reads
-- already filter on expires_at, the sweep is just hygiene.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'expire-checkins',
      '*/15 * * * *',
      $sweep$ delete from checkins where expires_at < now() $sweep$
    );
  else
    raise notice 'pg_cron unavailable — skipping expire-checkins job';
  end if;
end;
$$;
