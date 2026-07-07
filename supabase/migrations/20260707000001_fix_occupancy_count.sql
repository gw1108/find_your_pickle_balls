-- Phase 2 verification-pass fixes (found live on the two-emulator rig).

-- The blocked-players list showed "Player" for every entry: blocked users'
-- profile rows are invisible under the profiles RLS (that's the point of the
-- block), so the client-side name join returned null. SECURITY DEFINER RPC
-- returns just enough (id + name) to manage your own block list.
create function my_blocked_players()
returns table (
  blocked_id uuid,
  display_name text,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select b.blocked_id, p.display_name, b.created_at
  from blocks b
  join profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- Fix venue_occupancy (§6.1): checkin_count used count(*) over the
-- grouped-by-sport subquery, so it returned the number of distinct sports
-- present, not the number of players. Found live in the Phase 2 two-emulator
-- verification pass (sheet read "1 playing right now · Pickleball: 2").
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
    join profiles p on p.id = c.user_id and not p.ghost_mode
    where c.venue_id = p_venue_id and c.expires_at > now()
    group by c.sport
  ) s
$$;
