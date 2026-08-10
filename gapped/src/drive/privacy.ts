/**
 * Privacy layer (spec Phase 6 — Open Road's is genuinely good; match it and
 * market it):
 *
 *  - Route start/end trimming of 1.0–1.7 mi, jittered per-drive via
 *    SHA-256(salt ‖ drive_id): stable per drive (the shared polyline never
 *    shifts between renders) but unpredictable across drives/devices, so an
 *    observer can't subtract a known constant to find your driveway.
 *  - Privacy zones with centre offsets randomised 200–800 m at creation, so
 *    repeated shares can't be triangulated back to the true centre.
 *
 * Where the salt actually lives, and why that is the right place:
 *
 * The salt that matters is the server's — the `TRIM_SALT` secret read by the
 * verify-drive Edge Function, which re-trims from the raw fixes and produces
 * the only route that is ever published (drives.route / route_polyline). The
 * untrimmed route never leaves the server at all; it sits in
 * drive_routes_private, which has no grants to any client role.
 *
 * The client passes a fixed, non-secret constant ('gapped-share-card' in
 * app/drive/[id].tsx) when it trims a route for the local share card. That is
 * not a weakness: a salt shipped inside the binary can never be secret, and
 * the client already holds the full untrimmed trace for its own drive, so
 * there is nothing there to withhold from it. Secrecy only has to hold for
 * what becomes public, which is the server's job.
 *
 * (An earlier version of this comment claimed the salt lived on device in
 * SecureStore. It never did — nothing in the app imports expo-secure-store.)
 */

import { sha256Hex } from '@/lib/sha256';
import { METERS_PER_MILE } from './units';
import { haversineM } from './stats';
import { Fix } from './types';

export const TRIM_MIN_M = 1.0 * METERS_PER_MILE;
export const TRIM_MAX_M = 1.7 * METERS_PER_MILE;

export const ZONE_OFFSET_MIN_M = 200;
export const ZONE_OFFSET_MAX_M = 800;

/** Map 4 hash bytes (8 hex chars) onto [min, max). */
function hashToRange(hexSlice: string, min: number, max: number): number {
  const n = parseInt(hexSlice, 16) / 0x100000000;
  return min + n * (max - min);
}

/** Deterministic per-drive trim distances. */
export function trimDistances(
  salt: string,
  driveId: string,
): { startTrimM: number; endTrimM: number } {
  const h = sha256Hex(`${salt}‖${driveId}`);
  return {
    startTrimM: hashToRange(h.slice(0, 8), TRIM_MIN_M, TRIM_MAX_M),
    endTrimM: hashToRange(h.slice(8, 16), TRIM_MIN_M, TRIM_MAX_M),
  };
}

/**
 * Drop fixes within startTrimM of the start and endTrimM of the end
 * (distance measured along the route). A drive shorter than the two trims
 * combined yields an empty route — nothing shareable, by design.
 */
export function trimRoute(fixes: Fix[], startTrimM: number, endTrimM: number): Fix[] {
  if (fixes.length < 2) return [];
  const cum: number[] = [0];
  for (let i = 1; i < fixes.length; i++) {
    cum.push(
      cum[i - 1] + haversineM(fixes[i - 1].lat, fixes[i - 1].lon, fixes[i].lat, fixes[i].lon),
    );
  }
  const total = cum[cum.length - 1];
  if (total <= startTrimM + endTrimM) return [];
  const kept = fixes.filter((_, i) => cum[i] >= startTrimM && cum[i] <= total - endTrimM);
  return kept.length >= 2 ? kept : [];
}

/** Convenience: trim with the per-drive salted distances. */
export function trimRouteForSharing(fixes: Fix[], salt: string, driveId: string): Fix[] {
  const { startTrimM, endTrimM } = trimDistances(salt, driveId);
  return trimRoute(fixes, startTrimM, endTrimM);
}

export type PrivacyZone = {
  /** Offset centre — the true centre is never stored. */
  lat: number;
  lon: number;
  radiusM: number;
};

/**
 * Create a zone from a true centre: the stored centre is displaced by a
 * deterministic 200–800 m offset in a hash-derived direction. The zone radius
 * is widened by the max offset so the true centre always stays covered.
 */
export function makePrivacyZone(
  trueLat: number,
  trueLon: number,
  radiusM: number,
  salt: string,
  zoneId: string,
): PrivacyZone {
  const h = sha256Hex(`${salt}‖zone‖${zoneId}`);
  const offsetM = hashToRange(h.slice(0, 8), ZONE_OFFSET_MIN_M, ZONE_OFFSET_MAX_M);
  const bearing = hashToRange(h.slice(8, 16), 0, 2 * Math.PI);
  const dLat = (offsetM * Math.cos(bearing)) / 111_194.9;
  const dLon =
    (offsetM * Math.sin(bearing)) / (111_194.9 * Math.cos((trueLat * Math.PI) / 180));
  return {
    lat: trueLat + dLat,
    lon: trueLon + dLon,
    radiusM: radiusM + ZONE_OFFSET_MAX_M,
  };
}

/** Remove all fixes inside any zone. */
export function excludeZones(fixes: Fix[], zones: PrivacyZone[]): Fix[] {
  if (zones.length === 0) return fixes;
  return fixes.filter(
    (f) => !zones.some((z) => haversineM(f.lat, f.lon, z.lat, z.lon) <= z.radiusM),
  );
}
