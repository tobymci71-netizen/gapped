/**
 * Streaks across daylight-saving changes.
 *
 * A local day is 23 or 25 hours long across a DST change, and currentStreak /
 * contributionGrid used to step back a fixed 86 400 000 ms — so at 23:30 after
 * the clocks went back they counted that Sunday twice (a 3-day streak read 4,
 * and the grid drew the same day in two cells), and at 00:30 after they went
 * forward they skipped it (a drive that Sunday no longer kept the streak
 * alive).
 *
 * Only a time zone with DST can show any of that, and Node fixes its zone at
 * startup: assigning process.env.TZ inside a test changes nothing. So when the
 * suite runs somewhere without DST (CI in UTC), the last test re-runs this file
 * in a child Jest under Europe/London rather than passing trivially.
 */

import { contributionGrid, currentStreak, dayKey } from '../records';

const LONDON = 'Europe/London';
const CHILD_FLAG = 'GAPPED_DST_CHILD';

type Proc = { env: Record<string, string | undefined>; execPath: string; cwd(): string };
type SpawnSync = (
  cmd: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string | undefined>; encoding: 'utf8'; timeout: number },
) => { status: number | null; stdout: string; stderr: string; error?: Error };

const proc = jest.requireActual<Proc>('process');

function zoneHasDst(): boolean {
  return new Date(2026, 0, 1).getTimezoneOffset() !== new Date(2026, 6, 1).getTimezoneOffset();
}

const hostHasDst = zoneHasDst();

(hostHasDst ? describe : describe.skip)('streaks across DST changes', () => {
  /** The calendar day after `key`, by calendar arithmetic. */
  function nextKey(key: string): string {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + 1, 12).getTime());
  }

  function at(y: number, m: number, d: number, h: number, min: number): number {
    return new Date(y, m, d, h, min).getTime();
  }

  /** `n` consecutive calendar days ending on the day of `t`, newest first. */
  function daysEnding(t: number, n: number): string[] {
    const end = new Date(t);
    return Array.from({ length: n }, (_, i) =>
      dayKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 12).getTime()),
    );
  }

  // Every day of a year at 00:30 and 23:30, which crosses both transitions in
  // whichever DST zone this runs in. The named cases below are London's.
  const sweep: number[] = [];
  for (let d = new Date(2026, 0, 1, 12); d.getFullYear() === 2026; d.setDate(d.getDate() + 1)) {
    sweep.push(at(d.getFullYear(), d.getMonth(), d.getDate(), 0, 30));
    sweep.push(at(d.getFullYear(), d.getMonth(), d.getDate(), 23, 30));
  }

  test('the grid is always 84 consecutive, distinct calendar days ending today', () => {
    for (const now of sweep) {
      const keys = contributionGrid(new Set(), now, 84).map((c) => c.key);
      expect(keys[keys.length - 1]).toBe(dayKey(now));
      expect(new Set(keys).size).toBe(84);
      for (let i = 1; i < keys.length; i++) {
        if (keys[i] !== nextKey(keys[i - 1])) {
          throw new Error(`gap or repeat at ${new Date(now).toString()}: ${keys[i - 1]} → ${keys[i]}`);
        }
      }
    }
  });

  test('ten straight days of driving is a ten-day streak at any hour', () => {
    for (const now of sweep) {
      const streak = currentStreak(new Set(daysEnding(now, 10)), now);
      if (streak !== 10) throw new Error(`streak ${streak} at ${new Date(now).toString()}`);
    }
  });

  test('a drive yesterday keeps the streak alive just after midnight', () => {
    for (const now of sweep.filter((_, i) => i % 2 === 0)) {
      const yesterday = daysEnding(now, 2)[1];
      expect(currentStreak(new Set([yesterday]), now)).toBe(1);
    }
  });

  // The named cases need London's own transition instants (01:00 UTC on the
  // last Sundays of March and October), not just any DST — which also covers
  // the zones that share them, like Europe/Guernsey.
  const offsetAt = (iso: string) => new Date(iso).getTimezoneOffset();
  const likeLondon =
    offsetAt('2026-01-15T12:00:00Z') === 0 &&
    offsetAt('2026-03-29T00:59:00Z') === 0 &&
    offsetAt('2026-03-29T01:00:00Z') === -60 &&
    offsetAt('2026-10-25T00:59:00Z') === -60 &&
    offsetAt('2026-10-25T01:00:00Z') === 0;

  (likeLondon ? test : test.skip)(
    'clocks back: 23:30 on Mon 26 Oct 2026 with drives 24–26 Oct is 3, not 4',
    () => {
      const now = at(2026, 9, 26, 23, 30);
      const days = new Set(['2026-10-24', '2026-10-25', '2026-10-26']);
      expect(currentStreak(days, now)).toBe(3);
      const keys = contributionGrid(days, now, 84).map((c) => c.key);
      expect(keys.filter((k) => k === '2026-10-25')).toHaveLength(1);
    },
  );

  (likeLondon ? test : test.skip)('clocks forward: 00:30 on Mon 30 Mar 2026 still has Sunday 29 Mar', () => {
    const now = at(2026, 2, 30, 0, 30);
    expect(contributionGrid(new Set(), now, 84).map((c) => c.key)).toContain('2026-03-29');
    expect(currentStreak(new Set(['2026-03-29']), now)).toBe(1);
    expect(
      currentStreak(new Set(['2026-03-27', '2026-03-28', '2026-03-29', '2026-03-30']), now),
    ).toBe(4);
  });
});

(hostHasDst ? test.skip : test)(
  `no DST in this zone: re-run under ${LONDON}`,
  () => {
    if (proc.env[CHILD_FLAG]) {
      // Already the re-run, and still no DST: the runtime has no zone data.
      throw new Error(`${LONDON} reports no DST in this runtime; the DST cases cannot run.`);
    }
    const testPath: string | undefined = expect.getState().testPath;
    if (!testPath) throw new Error('Jest did not report this file’s path.');
    const { spawnSync } = jest.requireActual<{ spawnSync: SpawnSync }>('child_process');
    const run = spawnSync(
      proc.execPath,
      [require.resolve('jest/bin/jest'), '--runTestsByPath', testPath, '--watchman=false', '--ci'],
      {
        cwd: proc.cwd(),
        env: { ...proc.env, TZ: LONDON, [CHILD_FLAG]: '1' },
        encoding: 'utf8',
        timeout: 120_000,
      },
    );
    if (run.status !== 0) {
      throw new Error(
        `DST cases failed under ${LONDON}:\n${run.stdout}\n${run.stderr}\n${run.error ?? ''}`,
      );
    }
  },
  150_000,
);
