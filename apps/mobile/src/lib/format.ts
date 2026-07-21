import type { EventSport, SkillLevel } from "@pickup/shared";

export const SPORT_EMOJI: Record<EventSport, string> = {
  pickleball: "🥒",
  basketball: "🏀",
  running: "🏃",
  tennis: "🎾",
  other: "🏆",
};

export const SPORT_LABEL: Record<EventSport, string> = {
  pickleball: "Pickleball",
  basketball: "Basketball",
  running: "Running",
  tennis: "Tennis",
  other: "Other",
};

export const SKILL_LABEL: Record<SkillLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

export function formatSkillRange(
  min: SkillLevel | null,
  max: SkillLevel | null
): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `${SKILL_LABEL[min]} – ${SKILL_LABEL[max]}`;
  return SKILL_LABEL[(min ?? max) as SkillLevel];
}

/** Supabase errors (PostgrestError etc.) are plain objects, not Error
 * instances — pull out .message wherever one exists. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String(e.message);
  return String(e);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function formatEventTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.floor((d.getTime() - startOfToday.getTime()) / DAY_MS);
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  if (miles < 0.2) return `${Math.round(meters)} m`;
  return `${miles.toFixed(1)} mi`;
}

export function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (now.getTime() - d.getTime() < DAY_MS && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
