import { useEffect, useState } from 'react';
import type { CountryCode } from '@/data/countries';
import { countryProof, fetchCountryActivity, type CountryProof } from '../socialProof';

/**
 * How long the count line waits for `country_activity` before settling on the
 * early variant. The fetch bounds itself (PROOF_FETCH_TIMEOUT_MS, sized for a
 * cold anonymous sign-in), but by this step the brand step has already made
 * the session, so a call still out after this is a weak signal rather than a
 * sign-in, and the person is not left watching a skeleton for it. The answer
 * is not lost for good: only real answers are cached, so the next visit asks
 * again. Not a motion value, so not from theme/motion.ts.
 */
export const PROOF_TIMEOUT_MS = 2500;

/**
 * Answers already had this session, by country. Only real answers are kept —
 * a null (offline, no backend) is asked again next time — so flipping between
 * countries in the sheet, or coming Back to the step, swaps the line without
 * a second fetch or a flash of skeleton.
 */
const answered = new Map<string, CountryProof>();

/**
 * The count line's variant for `country`: 'loading' until the answer (or the
 * timeout) arrives, then the proof `countryProof` decides from real counts.
 * Null when no country is chosen.
 *
 * A late answer for a country the person has already moved on from is
 * dropped: only the current country's answer is ever shown.
 */
export function useCountryProof(country: CountryCode | null): CountryProof | 'loading' | null {
  const [settled, setSettled] = useState<{ country: string; proof: CountryProof } | null>(null);

  useEffect(() => {
    if (!country || answered.has(country)) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), PROOF_TIMEOUT_MS);
    });
    Promise.race([fetchCountryActivity(country), timeout])
      .catch(() => null)
      .then((activity) => {
        clearTimeout(timer);
        const proof = countryProof(activity);
        if (activity) answered.set(country, proof);
        if (live) setSettled({ country, proof });
      });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [country]);

  if (!country) return null;
  const known = answered.get(country);
  if (known) return known;
  return settled?.country === country ? settled.proof : 'loading';
}
