import { z } from "zod";
import { eventSportSchema, skillLevelSchema, sportSchema } from "./sports";

export const uuidSchema = z.string().uuid();

/** Lat/lng pair used across the API surface. PostGIS stores geography(Point,4326). */
export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof latLngSchema>;

/** Instagram handle: optional, connect-later profile add-on (PLAN.md §3).
 * Never required anywhere; format-validated only. */
export const igHandleSchema = z
  .string()
  .regex(/^[a-zA-Z0-9._]{1,30}$/, "Invalid Instagram handle")
  .transform((h) => h.toLowerCase());

export const profileSchema = z.object({
  id: uuidSchema,
  display_name: z.string().min(1).max(50),
  avatar_url: z.string().url().nullable(),
  bio: z.string().max(300).nullable(),
  sports: z.array(sportSchema).default([]),
  ig_handle: igHandleSchema.nullable(),
  created_at: z.string(),
});
export type Profile = z.infer<typeof profileSchema>;

export const venueSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(120),
  sports: z.array(sportSchema).min(1),
  location: latLngSchema,
  address: z.string().max(300).nullable(),
  court_count: z.number().int().positive().nullable(),
  source: z.enum(["osm", "fsq_os", "user", "admin"]),
  verified: z.boolean().default(false),
  created_at: z.string(),
});
export type Venue = z.infer<typeof venueSchema>;

export const eventStatusSchema = z.enum(["active", "cancelled", "completed"]);

export const eventSchema = z.object({
  id: uuidSchema,
  host_id: uuidSchema,
  venue_id: uuidSchema.nullable(),
  title: z.string().min(3).max(120),
  description: z.string().max(2000).nullable(),
  sport: eventSportSchema,
  sport_other_label: z.string().trim().min(1).max(40).nullable(),
  skill_min: skillLevelSchema.nullable(),
  skill_max: skillLevelSchema.nullable(),
  /** Fuzzed pin until RSVP (§8): clients get venue/park centroid pre-RSVP. */
  location: latLngSchema,
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  player_cap: z.number().int().min(2).max(500).nullable(),
  /** Recurring template id, if spawned from one (§2). */
  recurrence_id: uuidSchema.nullable(),
  status: eventStatusSchema.default("active"),
  created_at: z.string(),
});
export type Event = z.infer<typeof eventSchema>;

export const createEventInputSchema = eventSchema
  .pick({
    title: true,
    description: true,
    sport: true,
    sport_other_label: true,
    skill_min: true,
    skill_max: true,
    venue_id: true,
    location: true,
    starts_at: true,
    ends_at: true,
    player_cap: true,
  })
  .refine((e) => e.venue_id !== null || e.location !== null, {
    message: "Event needs a venue or a dropped pin",
  })
  .refine((e) => (e.sport === "other") === (e.sport_other_label != null), {
    message: "Name the sport when choosing Other",
  });
export type CreateEventInput = z.infer<typeof createEventInputSchema>;

export const rsvpSchema = z.object({
  event_id: uuidSchema,
  user_id: uuidSchema,
  status: z.enum(["going", "waitlist", "left"]),
  created_at: z.string(),
});
export type Rsvp = z.infer<typeof rsvpSchema>;

export const checkinSchema = z.object({
  id: uuidSchema,
  venue_id: uuidSchema,
  user_id: uuidSchema,
  sport: eventSportSchema,
  expires_at: z.string(),
  created_at: z.string(),
});
export type Checkin = z.infer<typeof checkinSchema>;

/** Aggregate live state for a venue pin (§6.1) — counts + skill mix only;
 * names are resolved separately and gated to mutuals/attendees. */
export const venueOccupancySchema = z.object({
  venue_id: uuidSchema,
  checkin_count: z.number().int().nonnegative(),
  by_sport: z.record(eventSportSchema, z.number().int().nonnegative()),
  expected_from_rsvps: z.number().int().nonnegative(),
});
export type VenueOccupancy = z.infer<typeof venueOccupancySchema>;

export const reportSchema = z.object({
  id: uuidSchema,
  reporter_id: uuidSchema,
  target_kind: z.enum(["user", "event", "photo", "message"]),
  target_id: z.string().min(1),
  reason: z.string().min(1).max(1000),
  status: z.enum(["open", "actioned", "dismissed"]).default("open"),
  resolution_note: z.string().max(1000).nullable(),
  created_at: z.string(),
});
export type Report = z.infer<typeof reportSchema>;

export const eventsNearInputSchema = z.object({
  center: latLngSchema,
  radius_m: z.number().positive().max(100_000),
  sport: eventSportSchema.optional(),
  skill: skillLevelSchema.optional(),
  after: z.string().optional(),
});
export type EventsNearInput = z.infer<typeof eventsNearInputSchema>;
