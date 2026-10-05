/**
 * The line under a drive's top speed when the server kept it off the public
 * boards (verify-drive: verification_meta.top_speed_ranked = false).
 *
 * The ceiling is the highest speed the boards rank in the driver's country:
 * the highest posted limit there (for the US, in any state), or 130 km/h
 * where there is no general limit or no figure for the country
 * (supabase/functions/_shared/speedLimits.ts). So the line names it as what
 * it is — the ranking limit, the most the boards rank there — and never
 * calls it "the speed limit", which for Germany it is not. The figure above it is still the
 * driver's own, so the line says where it does not count, not that it was
 * wrong.
 *
 * Pure, for the tests.
 */

import { countryByCode } from '@/data/countries';
import { mps } from '@/types/units';
import { formatSpeed, type UnitPref } from './units';

/** What verify-drive recorded alongside top_speed_ranked, when it did. */
export type RankingCeiling = {
  /** verification_meta.top_speed_ceiling_ms */
  ceilingMs: number | null;
  /** verification_meta.ranking_country: the profile's country at verification. */
  country: string | null;
};

/** For a drive checked before the ceiling and its country were recorded. */
export const NOT_RANKED_FALLBACK = 'Top speed above the public limit: not ranked';

export function notRankedLine(ceiling: RankingCeiling, pref: UnitPref): string {
  const { ceilingMs, country } = ceiling;
  if (ceilingMs == null || !Number.isFinite(ceilingMs) || ceilingMs <= 0) {
    return NOT_RANKED_FALLBACK;
  }
  const limit = formatSpeed(mps(ceilingMs), pref);
  const where = countryByCode(country)?.name;
  // "the United Kingdom ranking limit": the name as an adjective needs no
  // article of its own, which "in United Kingdom" would.
  return where
    ? `Top speed above the ${where} ranking limit (${limit}): not ranked`
    : `Top speed above the ranking limit (${limit}): not ranked`;
}
