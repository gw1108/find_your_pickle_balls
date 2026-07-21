import { z } from "zod";

/** Launch sports (PLAN.md §11): pickleball first, basketball second,
 * running as a content channel, tennis deferred but modeled. */
export const SPORTS = ["pickleball", "basketball", "running", "tennis"] as const;
export const sportSchema = z.enum(SPORTS);
export type Sport = z.infer<typeof sportSchema>;

/** Sports valid on events: the profile-eligible four plus the generic bucket.
 * Profiles and venues stay on `Sport` — "other" is excluded by construction. */
export const EVENT_SPORTS = [...SPORTS, "other"] as const;
export const eventSportSchema = z.enum(EVENT_SPORTS);
export type EventSport = z.infer<typeof eventSportSchema>;

/** Seed suggestions for the "other" sport label; a future aggregate RPC can
 * replace this behind the same constant. */
export const OTHER_SPORT_SUGGESTIONS = [
  "Spikeball", "Volleyball", "Soccer", "Ultimate Frisbee", "Softball",
  "Badminton", "Table Tennis", "Disc Golf", "Kickball", "Flag Football",
] as const;

/** Skill buckets rendered as event filters. */
export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const skillLevelSchema = z.enum(SKILL_LEVELS);
export type SkillLevel = z.infer<typeof skillLevelSchema>;
