/**
 * Achievements.
 *
 * Granted server-side only, off verified drives (see verify-drive). The client
 * reads them; it can never award one, which is what stops an achievement
 * meaning less than the verified run behind it.
 */

import { supabase } from '@/lib/supabase';

export type Achievement = {
  kind: string;
  title: string;
  detail: string;
  glyph: string;
  earnedAt: number;
};

/**
 * Copy lives here rather than in the database so wording can change without a
 * migration, and so an unknown kind from a newer server still renders as
 * something rather than vanishing.
 */
const CATALOGUE: Record<string, { title: string; glyph: string; detail: (p: Payload) => string }> = {
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
  first_measured_launch: {
    title: 'Measured launch',
    glyph: '🚦',
    detail: (p) =>
      p.zero_to_60_s != null
        ? `A clean standstill launch: 0–60 in ${Number(p.zero_to_60_s).toFixed(2)}s.`
        : 'A clean standstill launch, measured rather than estimated.',
  },
  country_number_one: {
    title: 'Fastest in country',
    glyph: '🏆',
    detail: (p) => `Top of the ${p.country ?? 'national'} verified top-speed board.`,
  },
};

type Payload = Record<string, unknown> & {
  count?: number;
  zero_to_60_s?: number;
  country?: string;
};

export async function listAchievements(): Promise<Achievement[]> {
  if (!supabase) return [];
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  const { data, error } = await supabase
    .from('achievements')
    .select('kind, payload, earned_at')
    .eq('profile_id', uid)
    .order('earned_at', { ascending: false });
  if (error || !data) return [];

  return (data as { kind: string; payload: Payload; earned_at: string }[]).map((a) => {
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
