-- Free-text label for sport = 'other' events. Required exactly when the
-- sport is 'other' so the popularity signal is never diluted (design §2).
alter table events add column sport_other_label text
  check (char_length(sport_other_label) between 1 and 40);
alter table events add constraint events_other_label_consistency
  check ((sport = 'other') = (sport_other_label is not null));

-- events_near return type grows sport_other_label → drop + create
-- (repo convention, see 20260706000005 venues_near).
drop function events_near(double precision, double precision, double precision, sport, skill_level, timestamptz);
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
  sport_other_label text,
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
    e.id, e.host_id, e.venue_id, e.title, e.sport, e.sport_other_label,
    e.skill_min, e.skill_max,
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

-- event_public grows sport_other_label so share cards can say "Spikeball"
-- instead of "other". Drop loses the anon grant — re-grant below.
drop function event_public(uuid);
create function event_public(p_event_id uuid)
returns table (
  id uuid,
  title text,
  sport sport,
  sport_other_label text,
  starts_at timestamptz,
  player_cap int,
  going_count bigint
)
language sql stable security definer set search_path = public
as $$
  select
    e.id, e.title, e.sport, e.sport_other_label, e.starts_at, e.player_cap,
    (select count(*) from rsvps r
      where r.event_id = e.id and r.status = 'going') as going_count
  from events e
  where e.id = p_event_id and e.status = 'active';
$$;

grant execute on function event_public(uuid) to anon;
