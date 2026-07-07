-- Chat on Supabase Realtime (PLAN.md §5, MVP scope): channels/channel_members/
-- messages, RLS gated to attendees, delivery via Broadcast-from-Database.
-- Keyed by our own event/user ids — no vendor concepts (§4.4 escape hatch).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type channel_kind as enum ('event', 'dm');

create table channels (
  id uuid primary key default gen_random_uuid(),
  kind channel_kind not null default 'event',
  -- one channel per event; null for DMs (Phase 2, same tables)
  event_id uuid unique references events (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint event_channels_need_event check (kind <> 'event' or event_id is not null)
);

create table channel_members (
  channel_id uuid not null references channels (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  -- unread counts derive from this (§5); app-icon badge hygiene depends on it
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index channel_members_user on channel_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels (id) on delete cascade,
  sender_id uuid not null references profiles (id) on delete cascade,
  content text check (char_length(content) <= 2000),
  -- photo messages: Supabase Storage object path (§5)
  image_path text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_has_body check (content is not null or image_path is not null)
);
-- keyset pagination on (created_at, id)
create index messages_channel_created on messages (channel_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Membership helper — SECURITY DEFINER so policies (including the one on
-- realtime.messages below) can consult membership without recursive RLS.
-- ---------------------------------------------------------------------------
create function is_channel_member(p_channel_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from channel_members
    where channel_id = p_channel_id and user_id = p_user_id
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: only attendees read/write an event channel; block = mutual
-- invisibility on message rows (same pattern as events/rsvps).
-- Membership rows are managed exclusively by the triggers below.
-- ---------------------------------------------------------------------------
alter table channels enable row level security;
alter table channel_members enable row level security;
alter table messages enable row level security;

create policy "channels: members read"
  on channels for select to authenticated
  using (is_channel_member(id, auth.uid()));

create policy "channel_members: members see roster"
  on channel_members for select to authenticated
  using (is_channel_member(channel_id, auth.uid()));

create policy "channel_members: update own read state"
  on channel_members for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "messages: members read, blocked senders invisible"
  on messages for select to authenticated
  using (
    is_channel_member(channel_id, auth.uid())
    and (sender_id = auth.uid() or not is_blocked_pair(sender_id, auth.uid()))
  );

create policy "messages: members send as self"
  on messages for insert to authenticated
  with check (sender_id = auth.uid() and is_channel_member(channel_id, auth.uid()));

-- soft delete only (deleted_at); MVP has no editing (§5 deferred list)
create policy "messages: sender soft-deletes own"
  on messages for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Membership lifecycle (one-tap join → in the chat, §2):
--   event insert  → channel created, host auto-RSVPs 'going'
--   rsvp 'going'  → membership added
--   rsvp 'left'/deleted → membership removed
-- ---------------------------------------------------------------------------
create function handle_event_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into channels (kind, event_id) values ('event', new.id);
  insert into rsvps (event_id, user_id, status)
  values (new.id, new.host_id, 'going')
  on conflict (event_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_event_created
  after insert on events
  for each row execute function handle_event_created();

create function handle_rsvp_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  -- NEW is unassigned in DELETE triggers — branch on tg_op before touching it
  if tg_op = 'DELETE' then
    select id into v_channel_id from channels where event_id = old.event_id;
    if v_channel_id is not null then
      delete from channel_members
        where channel_id = v_channel_id and user_id = old.user_id;
    end if;
    return old;
  end if;

  select id into v_channel_id from channels where event_id = new.event_id;
  if v_channel_id is null then
    return new; -- channel gone (event deleted mid-flight)
  end if;

  if new.status = 'left' then
    delete from channel_members
      where channel_id = v_channel_id and user_id = new.user_id;
  elsif new.status = 'going' then
    insert into channel_members (channel_id, user_id)
    values (v_channel_id, new.user_id)
    on conflict (channel_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_rsvp_change
  after insert or update or delete on rsvps
  for each row execute function handle_rsvp_change();

-- ---------------------------------------------------------------------------
-- Delivery: Broadcast-from-Database (Supabase's documented chat pattern, §5).
-- Topic per channel; clients subscribe to private channel 'chat:<channel_id>'.
-- ---------------------------------------------------------------------------
create function broadcast_message_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'chat:' || coalesce(new.channel_id, old.channel_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger messages_broadcast
  after insert or update on messages
  for each row execute function broadcast_message_change();

-- Private-channel authorization: only channel members may subscribe to a
-- chat topic's broadcasts.
create policy "chat broadcasts: members only"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'chat:%'
    and is_channel_member(split_part(realtime.topic(), ':', 2)::uuid, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Read-state RPC: stamp last_read_at (unread counts + badge hygiene, §5)
-- ---------------------------------------------------------------------------
create function mark_channel_read(p_channel_id uuid)
returns void
language sql volatile
as $$
  update channel_members
  set last_read_at = now()
  where channel_id = p_channel_id and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Channel list w/ unread counts for the inbox screen — one round trip.
-- SECURITY INVOKER: caller's RLS applies to every table touched.
-- ---------------------------------------------------------------------------
create function my_channels()
returns table (
  channel_id uuid,
  kind channel_kind,
  event_id uuid,
  event_title text,
  event_starts_at timestamptz,
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
    select m.created_at, m.content
    from messages m
    where m.channel_id = c.id and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit 1
  ) lm on true
  where cm.user_id = auth.uid()
  order by coalesce(lm.created_at, c.created_at) desc;
$$;
