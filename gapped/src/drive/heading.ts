import { Degrees, degrees } from '@/types/units';

/**
 * Bearing sanitisation.
 *
 * expo-location passes the platform's raw bearing straight through: iOS
 * reports CLLocation.course as -1 when it has no valid course, and Android
 * reports Location.getBearing() as 0.0 when hasBearing() is false. Neither is
 * a measurement. -1 is the dangerous one — wrapped into compass space it reads
 * as 359°, so one bad fix looks like a large yaw spike in both directions.
 *
 * Anything outside [0, 360] is rejected here. Android's 0.0 is
 * indistinguishable from a genuine due-north bearing, so it cannot be caught
 * by range alone; the yaw-rate gate in maneuvers.ts rejects it on physics
 * instead.
 */
export function sanitiseHeading(h: number | null | undefined): Degrees | null {
  return h != null && Number.isFinite(h) && h >= 0 && h <= 360 ? degrees(h) : null;
}
