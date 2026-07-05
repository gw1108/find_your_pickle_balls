import { z } from "zod";

/** Launch sports (PLAN.md §11): pickleball first, basketball second,
 * running as a content channel, tennis deferred but modeled. */
export const SPORTS = ["pickleball", "basketball", "running", "tennis"] as const;
export const sportSchema = z.enum(SPORTS);
export type Sport = z.infer<typeof sportSchema>;

/** Skill buckets rendered as filters. Pickleball uses DUPR-style bands;
 * other sports map onto the same coarse scale. */
export const SKILL_LEVELS = ["beginner", "intermediate", "advanced", "expert"] as const;
export const skillLevelSchema = z.enum(SKILL_LEVELS);
export type SkillLevel = z.infer<typeof skillLevelSchema>;

/** DUPR-style display bands for pickleball filters (§2). */
export const PICKLEBALL_SKILL_BANDS: Record<SkillLevel, string> = {
  beginner: "< 3.0",
  intermediate: "3.0 – 3.5",
  advanced: "3.5 – 4.0",
  expert: "4.0+",
};
