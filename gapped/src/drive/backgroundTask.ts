/**
 * Background location recording via expo-task-manager.
 *
 * The foreground path (recorder.ts) uses watchPositionAsync; this task keeps
 * fixes flowing into the WAL when the app is backgrounded or the screen is
 * off. Same engine instance, same WAL — the fix stream is unified through
 * `ingestBackgroundFixes`.
 *
 * Registered at module load (Expo requires defineTask at global scope);
 * started/stopped alongside a recording session.
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { sanitiseHeading } from './heading';
import {
  sensorAccuracy,
  sensorAltitude,
  sensorCoord,
  sensorSpeed,
  sensorTimestamp,
} from '@/types/boundary';
import { Fix } from './types';

export const BACKGROUND_LOCATION_TASK = 'gapped-background-location';

type LocationTaskData = { locations: Location.LocationObject[] };

/** recorder.ts injects its fix handler so both paths share engine + WAL. */
let fixSink: ((fixes: Fix[]) => void) | null = null;

export function setBackgroundFixSink(sink: (fixes: Fix[]) => void): void {
  fixSink = sink;
}

TaskManager.defineTask<LocationTaskData>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const fixes: Fix[] = data.locations.map((loc) => ({
    t: sensorTimestamp(loc.timestamp),
    lat: sensorCoord(loc.coords.latitude),
    lon: sensorCoord(loc.coords.longitude),
    speedMs: sensorSpeed(
      loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null,
    ),
    accuracyM: sensorAccuracy(loc.coords.accuracy),
    altitudeM: sensorAltitude(loc.coords.altitude),
    heading: sanitiseHeading(loc.coords.heading),
    isMock: (loc as { mocked?: boolean }).mocked ?? false,
  }));
  fixSink?.(fixes);
});

export async function startBackgroundUpdates(): Promise<void> {
  const { status } = await Location.getBackgroundPermissionsAsync();
  if (status !== 'granted') return; // foreground-only; we told the user this in onboarding
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (started) return;
  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.AutomotiveNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Gapped is recording your drive',
      notificationBody: 'Speed, route and distance are being tracked.',
      notificationColor: '#CCFF00',
    },
  });
}

export async function stopBackgroundUpdates(): Promise<void> {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
}
