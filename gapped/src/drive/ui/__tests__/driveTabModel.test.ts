/**
 * The Driving tab's words come from real state: a drive's title from when it
 * actually happened, the status line from the recorder and the location
 * permission, the hero title from the chosen vehicle.
 */

import { metres, mps, seconds, epochMs } from '@/types/units';
import { driveRowModel, idleStatus, vehicleTitle } from '../driveTabModel';

const UTC = { locale: 'en-GB', timeZone: 'UTC' } as const;
const at = (iso: string) => Date.parse(iso);

function drive(iso: string, minutes: number, miles: number, topMph: number) {
  const startedAt = at(iso);
  return {
    startedAt,
    summary: {
      endedAt: epochMs(startedAt + minutes * 60_000),
      durationS: seconds(minutes * 60),
      distanceM: metres(miles * 1609.344),
      maxSpeedMs: mps(topMph * 0.44704),
    },
  };
}

describe('driveRowModel', () => {
  it('titles the row from the real date, never a raw timestamp', () => {
    // 5 Oct 2026 is a Monday.
    const row = driveRowModel(drive('2026-10-05T13:00:00Z', 25, 19.8, 65), 'imperial', true, UTC);
    expect(row.title).toBe('Monday afternoon');
    expect(row.meta).toBe('Mon 5 Oct · 13:00 · 25 min');
    expect(row.distance).toBe('19.8');
    expect(row.distanceUnit).toBe('mi');
    expect(row.top).toBe('top 65 mph');
  });

  it('works the weekday out (the mock said Sat for 4 Oct 2026, a Sunday)', () => {
    const row = driveRowModel(drive('2026-10-04T10:00:00Z', 15, 9, 49), 'imperial', false, UTC);
    expect(row.title).toBe('Sunday morning');
    expect(row.meta).toBe('Sun 4 Oct · 10:00 · 15 min');
  });

  it('speaks in metric for a metric driver', () => {
    const row = driveRowModel(drive('2026-10-05T13:00:00Z', 25, 19.8, 65), 'metric', false, UTC);
    expect(row.distanceUnit).toBe('km');
    expect(row.distance).toBe('31.9');
    expect(row.top).toBe('top 105 km/h');
  });

  it('reads as one sentence, and says verified only when the server did', () => {
    const d = drive('2026-10-05T13:00:00Z', 25, 19.8, 65);
    const verified = driveRowModel(d, 'imperial', true, UTC).accessibilityLabel;
    expect(verified).toBe(
      'Monday afternoon, 5 October, 13:00, 25 minutes, 19.8 miles, ' +
        'top speed 65 miles per hour, verified',
    );
    expect(driveRowModel(d, 'imperial', false, UTC).accessibilityLabel).not.toContain('verified');
  });

  it('never words a gap or a race', () => {
    const row = driveRowModel(drive('2026-10-05T13:00:00Z', 25, 19.8, 65), 'imperial', true, UTC);
    const all = Object.values(row).join(' ').toLowerCase();
    for (const word of ['behind', 'beat', 'race', 'faster']) expect(all).not.toContain(word);
  });
});

describe('idleStatus', () => {
  const ready = {
    engineState: 'idle',
    permission: 'granted',
    precise: true,
    hasFix: true,
  } as const;

  it('says GPS ready only once a position has come back', () => {
    expect(idleStatus(ready)).toMatchObject({ state: 'Standby', gps: 'GPS ready', tone: 'ready' });
    expect(idleStatus({ ...ready, hasFix: false })).toMatchObject({
      gps: 'Finding GPS',
      tone: 'waiting',
    });
  });

  it('reflects the permission, whatever the last fix', () => {
    expect(idleStatus({ ...ready, permission: 'denied' })).toMatchObject({
      gps: 'Location off',
      tone: 'off',
    });
    expect(idleStatus({ ...ready, permission: 'unknown' })).toMatchObject({
      gps: 'Location needed',
      tone: 'off',
    });
    expect(idleStatus({ ...ready, precise: false })).toMatchObject({
      gps: 'Approximate location',
      tone: 'off',
    });
  });

  it('follows the recorder through arming and saving, claiming no start it has not made', () => {
    // Arming can lapse back to idle without a drive, so it is not "Starting".
    expect(idleStatus({ ...ready, engineState: 'arming' }).state).toBe('Motion detected');
    expect(idleStatus({ ...ready, engineState: 'stopping' }).state).toBe('Saving');
  });

  it('reads as a sentence', () => {
    expect(idleStatus(ready).spoken).toBe('Standby. GPS ready.');
  });
});

describe('vehicleTitle', () => {
  it('is the make and model', () => {
    expect(vehicleTitle({ kind: 'car', make: 'BMW', model: 'M3' })).toBe('BMW M3');
    expect(vehicleTitle({ kind: 'motorbike', make: ' Ducati ', model: 'Panigale V4' })).toBe(
      'Ducati Panigale V4',
    );
  });

  it('names what it is before one is chosen', () => {
    expect(vehicleTitle({ kind: null, make: null, model: null })).toBe('Your car');
    expect(vehicleTitle({ kind: 'motorbike', make: null, model: null })).toBe('Your bike');
  });
});
