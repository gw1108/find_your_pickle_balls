-- Phase 2 (PLAN.md §12): DMs on the same chat tables, live court occupancy
-- RPCs (§6.1), push tokens, and moderation hooks (§8 keyword filter +
-- system-flagged reports).

-- ---------------------------------------------------------------------------
-- DMs — same channels/messages tables (§5). dm_key is the canonical ordered
-- user-id pair so a pair of users can only ever have one DM channel.
-- ---------------------------------------------------------------------------
alter table channels add column dm_key text unique;
alter table channels add constraint dm_channels_need_key
  check (kind <> 'dm' or dm_key is not null);

-- SECURITY DEFINER: membership rows are managed only by triggers/RPCs, and
-- the blocks check must run before any channel exists to be RLS-gated.
create function get_or_create_dm(p_other_user uuid)
returns uuid
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_channel uuid;
begin
  if v_me is null or p_other_user is null or p_other_user = v_me then
    raise exception 'invalid DM target';
  end if;
  if is_blocked_pair(v_me, p_other_user) then
    raise exception 'cannot message this user';
  end if;

  v_key := least(v_me::text, p_other_user::text) || ':'
        || greatest(v_me::text, p_other_user::text);

  select id into v_channel from channels where dm_key = v_key;
  if v_channel is null then
    insert into channels (kind, dm_key) values ('dm', v_key)
    on conflict (dm_key) do nothing
    returning id into v_channel;
    -- lost a concurrent race — the other insert won
    if v_channel is null then
      select id into v_channel from channels where dm_key = v_key;
    end if;
  end if;

  insert into channel_members (channel_id, user_id)
  values (v_channel, v_me), (v_channel, p_other_user)
  on conflict (channel_id, user_id) do nothing;

  return v_channel;
end;
$$;

-- my_channels grows DM partner fields (inbox rendering). Blocked partners'
-- profiles are invisible under RLS, so their DMs drop out of the list.
drop function my_channels();
create function my_channels()
returns table (
  channel_id uuid,
  kind channel_kind,
  event_id uuid,
  event_title text,
  event_starts_at timestamptz,
  dm_partner_id uuid,
  dm_partner_name text,
  dm_partner_avatar text,
  last_message_at timestamptz,
  last_message_preview text,
  unread_count bigint
)
language sql stable
as $$
  select
    c.id as channel_id,
    c.kind,
    c.event_id,
    e.title as event_title,
    e.starts_at as event_starts_at,
    dp.id as dm_partner_id,
    dp.display_name as dm_partner_name,
    dp.avatar_url as dm_partner_avatar,
    lm.created_at as last_message_at,
    lm.content as last_message_preview,
    (
      select count(*) from messages m
      where m.channel_id = c.id
        and m.created_at > cm.last_read_at
        and m.sender_id <> auth.uid()
        and m.deleted_at is null
    ) as unread_count
  from channel_members cm
  join channels c on c.id = cm.channel_id
  left join events e on e.id = c.event_id
  left join lateral (
    select p.id, p.display_name, p.avatar_url
    from channel_members om
    join profiles p on p.id = om.user_id
    where c.kind = 'dm' and om.channel_id = c.id and om.user_id <> auth.uid()
    limit 1
  ) dp on true
  left join lateral (
    select m.created_at, m.content
    from messages m
    where m.channel_id = c.id and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  where cm.user_id = auth.uid()
    and (c.kind <> 'dm' or dp.id is not null)
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

-- Channel header info for the thread screen (event title or DM partner).
create function channel_info(p_channel_id uuid)
returns table (
  channel_id uuid,
  kind channel_kind,
  event_id uuid,
  event_title text,
  dm_partner_id uuid,
  dm_partner_name text
)
language sql stable
as $$
  select c.id, c.kind, c.event_id, e.title, dp.id, dp.display_name
  from channels c
  left join events e on e.id = c.event_id
  left join lateral (
    select p.id, p.display_name
    from channel_members om
    join profiles p on p.id = om.user_id
    where c.kind = 'dm' and om.channel_id = c.id and om.user_id <> auth.uid()
    limit 1
  ) dp on true
  where c.id = p_channel_id;
$$;

-- ---------------------------------------------------------------------------
-- Live court occupancy (§6.1)
-- ---------------------------------------------------------------------------

-- check_in: geofence enforced server-side — the client prompt fires at ~75m,
-- the server accepts up to 150m to absorb GPS slop. SECURITY DEFINER so the
-- one-live-checkin-per-user upsert can move a row between venues atomically.
create function check_in(
  p_venue_id uuid,
  p_sport sport,
  p_lat double precision,
  p_lng double precision
)
returns timestamptz
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_loc geography;
  v_expires timestamptz;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;
  select location into v_loc from venues where id = p_venue_id;
  if v_loc is null then
    raise exception 'unknown venue';
  end if;
  if not st_dwithin(v_loc, st_point(p_lng, p_lat)::geography, 150) then
    raise exception 'too far from this venue to check in';
  end if;

  insert into checkins (venue_id, user_id, sport)
  values (p_venue_id, v_me, p_sport)
  on conflict (user_id) do update
    set venue_id = excluded.venue_id,
        sport = excluded.sport,
        expires_at = now() + interval '2 hours',
        created_at = now()
  returning expires_at into v_expires;
  return v_expires;
end;
$$;
-- check-out is a plain client-side delete (RLS "check out own" already allows)

-- venues_near grows a live_count so map pins can flip to the live state in the
-- same round trip. SECURITY DEFINER now: checkin rows are owner-only under
-- RLS, but this exposes only per-venue aggregates (ghost-mode users excluded,
-- §6.1 privacy rules) over public venue data.
drop function venues_near(double precision, double precision, double precision, sport);
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
      join profiles p on p.id = ci.user_id and not p.ghost_mode
      where ci.venue_id = v.id and ci.expires_at > now()
    ) as live_count
  from venues v
  where st_dwithin(v.location, st_point(p_lng, p_lat)::geography, p_radius_m)
    and (p_sport is null or p_sport = any (v.sports))
  order by v.location <-> st_point(p_lng, p_lat)::geography
  limit 200;
$$;

-- Live pin updates: every check-in change broadcasts the venue_id (nothing
-- else — clients refetch aggregates) on the shared private 'occupancy' topic.
create function broadcast_checkin_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform realtime.send(
    jsonb_build_object('venue_id', coalesce(new.venue_id, old.venue_id)),
    'occupancy',
    'occupancy',
    true
  );
  -- a check-in moved between venues (upsert) — the old venue changed too
  if tg_op = 'UPDATE' and old.venue_id is distinct from new.venue_id then
    perform realtime.send(
      jsonb_build_object('venue_id', old.venue_id),
      'occupancy',
      'occupancy',
      true
    );
  end if;
  return null;
end;
$$;

create trigger checkins_broadcast
  after insert or update or delete on checkins
  for each row execute function broadcast_checkin_change();

create policy "occupancy broadcasts: any signed-in user"
  on realtime.messages for select to authenticated
  using (realtime.topic() = 'occupancy');

-- ---------------------------------------------------------------------------
-- Push tokens (§5/§8 — Expo Push via Edge Functions)
-- ---------------------------------------------------------------------------
create table push_tokens (
  token text primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user on push_tokens (user_id);

alter table push_tokens enable row level security;

create policy "push_tokens: own rows"
  on push_tokens for select to authenticated
  using (user_id = auth.uid());

create policy "push_tokens: register own"
  on push_tokens for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_tokens: update own"
  on push_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_tokens: remove own"
  on push_tokens for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Moderation hooks (§8): keyword filter on event titles/descriptions and chat
-- messages. Matches auto-file a system report (reporter null) into the same
-- queue the admin page reads — content is flagged, never blocked at write.
-- ---------------------------------------------------------------------------
alter table reports alter column reporter_id drop not null;

create table moderation_keywords (
  word text primary key check (word = lower(word))
);

-- starter list; manage via the admin page / SQL later
insert into moderation_keywords (word) values
  ('nazi'), ('kys'), ('rape'), ('cocaine'), ('heroin'), ('meth'),
  ('escort'), ('onlyfans'), ('venmo me'), ('cashapp me'), ('crypto');

create function flag_banned_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.content is not null and exists (
    select 1 from moderation_keywords k
    where new.content ilike '%' || k.word || '%'
  ) then
    insert into reports (reporter_id, target_kind, target_id, reason)
    values (null, 'message', new.id::text, 'auto: keyword filter match');
  end if;
  return new;
end;
$$;

create trigger messages_keyword_filter
  after insert on messages
  for each row execute function flag_banned_message();

create function flag_banned_event()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from moderation_keywords k
    where new.title ilike '%' || k.word || '%'
       or coalesce(new.description, '') ilike '%' || k.word || '%'
  ) then
    insert into reports (reporter_id, target_kind, target_id, reason)
    values (null, 'event', new.id::text, 'auto: keyword filter match');
  end if;
  return new;
end;
$$;

create trigger events_keyword_filter
  after insert or update of title, description on events
  for each row execute function flag_banned_event();
