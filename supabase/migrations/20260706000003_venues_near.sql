-- venues_near: venue layer for the map + create-event venue picker (§6).
-- SECURITY INVOKER; venues are public-read anyway.
create function venues_near(
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
  distance_m double precision
)
language sql stable
as $$
  select
    v.id, v.name, v.sports,
    st_y(v.location::geometry) as lat,
    st_x(v.location::geometry) as lng,
    v.address, v.court_count, v.verified,
    st_distance(v.location, st_point(p_lng, p_lat)::geography) as distance_m
  from venues v
  where st_dwithin(v.location, st_point(p_lng, p_lat)::geography, p_radius_m)
    and (p_sport is null or p_sport = any (v.sports))
  order by v.location <-> st_point(p_lng, p_lat)::geography
  limit 200;
$$;
