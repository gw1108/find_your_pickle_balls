-- Remove profile per-sport skill levels and ghost mode (design 2026-07-21,
-- tag-a05d4c). Ghost filtering is deliberately removed from both occupancy
-- RPCs: previously-ghosted users become countable in live check-in counts —
-- an accepted product decision, not an oversight.

-- venue_occupancy: same body as 20260707000001 minus the ghost-filter join
-- (the profiles join existed only for that predicate).
create or replace function venue_occupancy(p_venue_id uuid)
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
    coalesce(sum(s.n), 0)::bigint as checkin_count,
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
    where c.venue_id = p_venue_id and c.expires_at > now()
    group by c.sport
  ) s
$$;

-- venues_near: same body as 20260706000005 minus the ghost-filter join.
-- Signature and return table are unchanged, so create or replace is safe.
create or replace function venues_near(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 25000,
  p_sport sport default null
)
returns table (
  id uuid,
  name text,
  sports sport[],
  lat double precision,
  lng double precision,
  address text,
  court_count int,
  verified boolean,
  distance_m double precision,
  live_count bigint
)
language sql stable security definer set search_path = public
as $$
  select
    v.id, v.name, v.sports,
    st_y(v.location::geometry) as lat,
    st_x(v.location::geometry) as lng,
    v.address, v.court_count, v.verified,
    st_distance(v.location, st_point(p_lng, p_lat)::geography) as distance_m,
    (
      select count(*)
      from checkins ci
      where ci.venue_id = v.id and ci.expires_at > now()
    ) as live_count
  from venues v
  where st_dwithin(v.location, st_point(p_lng, p_lat)::geography, p_radius_m)
    and (p_sport is null or p_sport = any (v.sports))
  order by v.location <-> st_point(p_lng, p_lat)::geography
  limit 200;
$$;

alter table profiles
  drop column skill_levels,
  drop column ghost_mode;
