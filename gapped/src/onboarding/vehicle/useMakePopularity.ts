import { useEffect, useState } from 'react';
import { fetchMakePopularity, type MakePopularityRow } from '@/onboarding/socialProof';
import type { VehicleKind } from '@/state/profile';
import { PROOF_TIMEOUT_MS, SKELETON_GRACE_MS, withTimeout } from './proofLoad';

export type MakePopularityState =
  /** Waiting. `skeleton` turns true once the wait has outlasted the grace period. */
  | { status: 'loading'; skeleton: boolean }
  /** Settled. Null rows mean no data (offline, no backend, slow) — the early variant. */
  | { status: 'ready'; rows: MakePopularityRow[] | null };

/**
 * Answers this launch has already had, per kind. Going back from the proof
 * screen and forward again should not show the skeleton twice for numbers
 * that cannot have meaningfully changed. Only real answers are kept: a null
 * (offline) is retried next time, so a phone that comes back online gets the
 * ranked screen on the next visit.
 */
const cache = new Map<VehicleKind, MakePopularityRow[]>();

/**
 * `make_popularity(kind)` for the make-proof step, with the step's loading
 * rules: never waits more than PROOF_TIMEOUT_MS, shows a skeleton only after
 * SKELETON_GRACE_MS, and never rejects (src/onboarding/socialProof promises
 * that; withTimeout guarantees it here as well).
 *
 * The answer is held against the kind it was asked for and the state derived
 * from that, rather than reset in the effect, so a kind change can never show
 * the previous kind's chart for a frame.
 */
export function useMakePopularity(kind: VehicleKind): MakePopularityState {
  const [answer, setAnswer] = useState<{ kind: VehicleKind; rows: MakePopularityRow[] | null }>();
  const [graceOver, setGraceOver] = useState<VehicleKind>();

  useEffect(() => {
    if (cache.has(kind)) return;
    let live = true;
    const grace = setTimeout(() => {
      if (live) setGraceOver(kind);
    }, SKELETON_GRACE_MS);
    withTimeout(fetchMakePopularity(kind), PROOF_TIMEOUT_MS, null).then((rows) => {
      if (rows) cache.set(kind, rows);
      clearTimeout(grace);
      if (live) setAnswer({ kind, rows });
    });
    return () => {
      live = false;
      clearTimeout(grace);
    };
  }, [kind]);

  const cached = cache.get(kind);
  if (cached) return { status: 'ready', rows: cached };
  if (answer?.kind === kind) return { status: 'ready', rows: answer.rows };
  return { status: 'loading', skeleton: graceOver === kind };
}
