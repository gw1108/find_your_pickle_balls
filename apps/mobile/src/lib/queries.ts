import type {
  ChannelListItem,
  LatLng,
  Message,
  SkillLevel,
  Sport,
} from "@pickup/shared";
import { DEFAULT_NEARBY_RADIUS_METERS } from "@pickup/shared";

import { supabase } from "@/lib/supabase";

/** Row shape of the events_near RPC (§4.4). */
export type NearbyEvent = {
  id: string;
  host_id: string;
  venue_id: string | null;
  title: string;
  sport: Sport;
  skill_min: SkillLevel | null;
  skill_max: SkillLevel | null;
  lat: number;
  lng: number;
  starts_at: string;
  ends_at: string | null;
  player_cap: number | null;
  going_count: number;
  distance_m: number;
};

export type NearbyVenue = {
  id: string;
  name: string;
  sports: Sport[];
  lat: number;
  lng: number;
  address: string | null;
  court_count: number | null;
  verified: boolean;
  distance_m: number;
};

export async function fetchEventsNear(
  center: LatLng,
  opts: { radiusM?: number; sport?: Sport; skill?: SkillLevel } = {}
): Promise<NearbyEvent[]> {
  const { data, error } = await supabase.rpc("events_near", {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_m: opts.radiusM ?? DEFAULT_NEARBY_RADIUS_METERS,
    p_sport: opts.sport ?? null,
    p_skill: opts.skill ?? null,
  });
  if (error) throw error;
  return (data ?? []) as NearbyEvent[];
}

export async function fetchVenuesNear(
  center: LatLng,
  opts: { radiusM?: number; sport?: Sport } = {}
): Promise<NearbyVenue[]> {
  const { data, error } = await supabase.rpc("venues_near", {
    p_lat: center.lat,
    p_lng: center.lng,
    p_radius_m: opts.radiusM ?? DEFAULT_NEARBY_RADIUS_METERS,
    p_sport: opts.sport ?? null,
  });
  if (error) throw error;
  return (data ?? []) as NearbyVenue[];
}

export type EventDetail = {
  id: string;
  host_id: string;
  venue_id: string | null;
  title: string;
  description: string | null;
  sport: Sport;
  skill_min: SkillLevel | null;
  skill_max: SkillLevel | null;
  starts_at: string;
  ends_at: string | null;
  player_cap: number | null;
  status: "active" | "cancelled" | "completed";
  host: { id: string; display_name: string; avatar_url: string | null } | null;
  venue: { id: string; name: string; address: string | null } | null;
  rsvps: {
    user_id: string;
    status: "going" | "waitlist" | "left";
    profile: { id: string; display_name: string; avatar_url: string | null } | null;
  }[];
};

export async function fetchEventDetail(eventId: string): Promise<EventDetail | null> {
  const { data, error } = await supabase
    .from("events")
    .select(
      `id, host_id, venue_id, title, description, sport, skill_min, skill_max,
       starts_at, ends_at, player_cap, status,
       host:profiles!events_host_id_fkey (id, display_name, avatar_url),
       venue:venues (id, name, address),
       rsvps (user_id, status, profile:profiles (id, display_name, avatar_url))`
    )
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as EventDetail | null;
}

/** One-tap join (§2): upsert own 'going' RSVP. The rsvp trigger adds chat
 * membership; returns the event's channel id (readable once a member). */
export async function joinEvent(eventId: string, userId: string): Promise<string | null> {
  const { error } = await supabase
    .from("rsvps")
    .upsert(
      { event_id: eventId, user_id: userId, status: "going" },
      { onConflict: "event_id,user_id" }
    );
  if (error) throw error;
  return fetchEventChannelId(eventId);
}

export async function leaveEvent(eventId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("rsvps")
    .update({ status: "left" })
    .eq("event_id", eventId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function fetchEventChannelId(eventId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("channels")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export type CreateEventArgs = {
  hostId: string;
  title: string;
  description?: string;
  sport: Sport;
  skillMin: SkillLevel | null;
  skillMax: SkillLevel | null;
  venueId: string | null;
  location: LatLng;
  startsAt: Date;
  playerCap: number | null;
};

export async function createEvent(args: CreateEventArgs): Promise<string> {
  const { data, error } = await supabase
    .from("events")
    .insert({
      host_id: args.hostId,
      title: args.title,
      description: args.description || null,
      sport: args.sport,
      skill_min: args.skillMin,
      skill_max: args.skillMax,
      venue_id: args.venueId,
      // PostGIS geography accepts WKT; lng first
      location: `POINT(${args.location.lng} ${args.location.lat})`,
      starts_at: args.startsAt.toISOString(),
      player_cap: args.playerCap,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Chat (§5)
// ---------------------------------------------------------------------------

export async function fetchMyChannels(): Promise<ChannelListItem[]> {
  const { data, error } = await supabase.rpc("my_channels");
  if (error) throw error;
  return (data ?? []) as ChannelListItem[];
}

export type MessageWithSender = Message & {
  sender: { id: string; display_name: string; avatar_url: string | null } | null;
};

/** Keyset pagination on (created_at, id) — pass the oldest loaded message to
 * fetch the previous page. */
export async function fetchMessages(
  channelId: string,
  before?: { created_at: string; id: string },
  limit = 50
): Promise<MessageWithSender[]> {
  let query = supabase
    .from("messages")
    .select(
      "id, channel_id, sender_id, content, image_path, deleted_at, created_at, sender:profiles (id, display_name, avatar_url)"
    )
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before.created_at);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as MessageWithSender[];
}

export async function sendMessage(
  channelId: string,
  senderId: string,
  content: string
): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .insert({ channel_id: channelId, sender_id: senderId, content });
  if (error) throw error;
}

export async function markChannelRead(channelId: string): Promise<void> {
  await supabase.rpc("mark_channel_read", { p_channel_id: channelId });
}
