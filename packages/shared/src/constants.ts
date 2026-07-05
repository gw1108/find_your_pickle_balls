/** Check-ins auto-expire after this many minutes (PLAN.md §6.1). */
export const CHECKIN_TTL_MINUTES = 120;

/** Geofence radius (meters) for the one-tap check-in prompt (§6.1). */
export const CHECKIN_GEOFENCE_METERS = 75;

/** Default map search radius (meters) for events_near. */
export const DEFAULT_NEARBY_RADIUS_METERS = 25_000;

/** Minimum account age (§8 — 18+ gate). */
export const MINIMUM_AGE_YEARS = 18;

/** Stream Chat Maker plan peak-concurrent alarm threshold (§5). */
export const STREAM_CONCURRENT_ALARM = 70;
