/**
 * Achievements.
 *
 * Granted server-side only, off verified drives (see verify-drive). The client
 * reads them; it can never award one, which is what stops an achievement
 * meaning less than the verified run behind it.
 */

import { ensureUserId, supabase } from '@/lib/supabase';

export type Achievement = {
  kind: string;
  title: string;
  detail: string;
  glyph: string;
  earnedAt: number;
};

type Entry = {
  title: string;
  glyph: string;
  detail: (p: Payload) => string;
  /**
   * Known, and never shown. The kind keeps its entry so a row the server
   * already granted is recognised rather than falling through to the
   * unknown-kind path, which would print its raw name.
   */
  hidden?: true;
};

/**
 * Copy lives here rather than in the database so wording can change without a
 * migration, and so an unknown kind from a newer server still renders as
 * something rather than vanishing.
 */
const CATALOGUE: Record<string, Entry> = {
  first_verified_run: {
    title: 'First verified run',
    glyph: '✅',
    detail: () => 'A drive of yours was re-derived on our servers and stood up.',
  },
  ten_verified_runs: {
    title: 'Ten verified runs',
    glyph: '🔟',
    detail: (p) => `${p.count ?? 10} drives verified from the raw trace.`,
  },
  // The kind is the server's and stays; only the words and glyph change. A
  // stopwatch, not a start light: it is a measurement, not a race start.
  first_measured_launch: {
    title: 'First 0–60 measured',
    glyph: '⏱️',
    detail: (p) =>
      p.zero_to_60_s != null
        ? `0–60 mph in ${Number(p.zero_to_60_s).toFixed(2)} s from a standstill, measured from the raw trace.`
        : 'A 0–60 from a standstill, measured rather than estimated.',
  },
  // Retired at launch: an award for the fastest driver in a country is a
  // reward for speed, and verify-drive no longer grants it. Rows granted
  // before then still exist, so the kind is kept, and never rendered.
  country_number_one: {
    title: 'Fastest in country',
    glyph: '🏆',
    detail: (p) => `Top of the ${p.country ?? 'national'} verified top-speed board.`,
    hidden: true,
  },
};

type Row = { kind: string; payload: Payload | null; earned_at: string };

/**
 * The server's rows as the You tab shows them, newest first as given, minus
 * any retired kind. Pure, for the tests.
 */
export function toAchievements(rows: readonly Row[]): Achievement[] {
  return rows
    .filter((a) => !CATALOGUE[a.kind]?.hidden)
    .map((a) => {
      const entry = CATALOGUE[a.kind];
      return {
        kind: a.kind,
        // An unrecognised kind is still a real achievement the server granted;
        // showing the raw kind beats dropping it silently.
        title: entry?.title ?? a.kind.replace(/_/g, ' '),
        glyph: entry?.glyph ?? '🏅',
        detail: entry ? entry.detail(a.payload ?? {}) : 'Earned on a verified drive.',
        earnedAt: Date.parse(a.earned_at),
      };
    });
}

type Payload = Record<string, unknown> & {
  count?: number;
  zero_to_60_s?: number;
  country?: string;
};

export async function listAchievements(): Promise<Achievement[]> {
  if (!supabase) return [];
  // Ensures rather than reads the session: after an offline first launch or
  // an account deletion there is none until something signs in again.
  const uid = await ensureUserId();
  if (!uid) return [];

  const { data, error } = await supabase
    .from('achievements')
    .select('kind, payload, earned_at')
    .eq('profile_id', uid)
    .order('earned_at', { ascending: false });
  if (error || !data) return [];

  return toAchievements(data as Row[]);
}
