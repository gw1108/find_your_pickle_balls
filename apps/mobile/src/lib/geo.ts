import type { LatLng } from "@pickup/shared";

/** Haversine distance in meters — good enough for geofence checks (§6.1). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Client-side prompt radius; the server accepts up to 150m (check_in RPC). */
export const CHECKIN_PROMPT_RADIUS_M = 75;
export const CHECKIN_MAX_RADIUS_M = 150;
