import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Verification = 'verified' | 'unverified' | 'pending' | null;

/**
 * The server's verdict per drive id, for the session. Only `verified` draws
 * the tick; everything else (unverified, pending, never uploaded, not
 * asked yet) draws nothing — the row never claims what the server has not.
 */
const verdicts = new Map<string, Verification>();
/** When each set of ids was last asked about, so a tab switch is not a request. */
const askedAt = new Map<string, number>();
/** Settled verdicts are not re-asked inside this window. */
const REASK_MS = 60_000;
/** Drive ids per request: 100 uuids keep the URL near 4 KB. */
const IDS_PER_REQUEST = 100;

const verifiedOf = (ids: readonly string[]) =>
  new Set(ids.filter((id) => verdicts.get(id) === 'verified'));

/**
 * The same set back when nothing changed. The Driving tab works its row
 * models out from this set, so a new one on every focus rebuilt every row
 * (and redrew each memoised row) for verdicts that had not moved.
 */
const keepIfSame =
  (next: ReadonlySet<string>) =>
  (prev: ReadonlySet<string>): ReadonlySet<string> =>
    prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next;

/**
 * Which of these drives the server has verified (verify-drive), read in one
 * request when the tab comes into focus.
 *
 * Asked again on focus while any verdict is still out (a drive that has
 * just ended is uploaded and verified seconds later), otherwise at most once
 * a minute. Offline, signed out, or with no backend configured, nothing is
 * verified and nothing is shown. `enabled` is false during a drive: no
 * network chatter while the recorder works.
 */
export function useVerifiedDrives(ids: readonly string[], enabled: boolean): ReadonlySet<string> {
  const key = ids.join(',');
  const [verified, setVerified] = useState<ReadonlySet<string>>(() => verifiedOf(ids));

  useFocusEffect(
    useCallback(() => {
      const list = key ? key.split(',') : [];
      setVerified(keepIfSame(verifiedOf(list)));
      if (!enabled || !supabase || list.length === 0) return;
      const settled = list.every((id) => {
        const v = verdicts.get(id);
        return v === 'verified' || v === 'unverified';
      });
      const last = askedAt.get(key) ?? 0;
      if (settled && Date.now() - last < REASK_MS) return;
      askedAt.set(key, Date.now());

      let alive = true;
      // The ids travel in the request's URL, so a long history (the list
      // expanded to every drive) is asked about a batch at a time.
      const batches: string[][] = [];
      for (let i = 0; i < list.length; i += IDS_PER_REQUEST) {
        batches.push(list.slice(i, i + IDS_PER_REQUEST));
      }
      (async () => {
        await Promise.all(
          batches.map(async (batch) => {
            try {
              const { data, error } = await supabase!
                .from('drives')
                .select('id, verification')
                .in('id', batch);
              if (error || !data) return;
              for (const row of data as { id?: unknown; verification?: unknown }[]) {
                if (typeof row.id === 'string') {
                  verdicts.set(row.id, (row.verification as Verification | undefined) ?? null);
                }
              }
            } catch {
              // No network: keep what we had.
            }
          }),
        );
        if (alive) setVerified(keepIfSame(verifiedOf(list)));
      })();
      return () => {
        alive = false;
      };
    }, [key, enabled]),
  );

  return verified;
}
