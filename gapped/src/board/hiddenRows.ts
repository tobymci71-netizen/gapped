/**
 * Which board rows can be reported or hidden, and the board once a hidden
 * driver has been taken off it.
 *
 * Only another real driver's row qualifies: one the server returned with an
 * account behind it. Your own row is you; SAMPLE and BENCHMARK rows are
 * nobody, and offering to report a manufacturer's 0–60 figure would say they
 * were somebody. Pure, so the board screen's decisions are tested.
 */

import type { BoardRow } from './types';

/** A row with an account behind it that is not yours. */
export type ModeratableRow = BoardRow & { kind: 'user'; profileId: string };

export function isModeratable(row: BoardRow): row is ModeratableRow {
  return row.kind === 'user' && typeof row.profileId === 'string' && row.profileId.length > 0;
}

/**
 * Drivers hidden on this screen, each with the board request that was the
 * newest when the hide went through. The server leaves a hidden driver off
 * every board fetched after that, so the entry is only a bridge: it hides the
 * row until a request started after the hide has answered (see
 * settleHidden), and then the server's answer is the truth — including after
 * an Unhide in Settings, which a set kept for the life of the tab (the tab
 * never unmounts) would have gone on overruling.
 */
export type HiddenHere = ReadonlyMap<string, number>;

/** `hidden` with `profileId` added, as of request `latestRequest`. */
export function hideHere(hidden: HiddenHere, profileId: string, latestRequest: number): HiddenHere {
  return new Map(hidden).set(profileId, latestRequest);
}

/**
 * `hidden` once request `answered` has committed: every entry hidden before
 * that request started is the server's to apply now. Unchanged, it is the
 * same object, so nothing re-renders.
 */
export function settleHidden(hidden: HiddenHere, answered: number): HiddenHere {
  let next: Map<string, number> | null = null;
  for (const [id, asOf] of hidden) {
    if (answered > asOf) {
      next ??= new Map(hidden);
      next.delete(id);
    }
  }
  return next ?? hidden;
}

/**
 * The newest request the server has answered, once request `seq` has come
 * back from `source`: what settleHidden is given.
 *
 * Every server answer counts, even one identical to the board already
 * showing, which the screen keeps as the same object so nothing re-renders.
 * That identical answer is the Unhide case: hide a driver, unhide them in
 * Settings before any refetch, come back, and the server's board is the one
 * from before the hide, row for row. Counted only when the board changed, it
 * left the driver hidden here until something else on the board moved.
 *
 * A local answer never counts. It is this device's own drives, because the
 * server could not be asked, so it says nothing about who is hidden; and a
 * quiet refetch that fails keeps the server board already showing, which
 * still has the driver in it.
 */
export function answeredAfter(
  answered: number,
  seq: number,
  source: 'local' | 'server',
): number {
  return source === 'server' && seq > answered ? seq : answered;
}

/**
 * `rows` without anyone in `hidden`, ranked again from 1.
 *
 * The server's next board leaves the driver off and ranks what is left from 1,
 * so filtering here, the moment the hide succeeds, has to give the same board,
 * or the next quiet refetch would shuffle every rank below the gap a second
 * later. Nobody hidden on this board returns `rows` itself, so the list does
 * not re-render.
 */
export function withoutHidden(
  rows: BoardRow[],
  hidden: ReadonlySet<string> | ReadonlyMap<string, unknown>,
): BoardRow[] {
  if (hidden.size === 0) return rows;
  const kept = rows.filter((r) => !(isModeratable(r) && hidden.has(r.profileId)));
  if (kept.length === rows.length) return rows;
  return kept.map((r, i) => (r.rank === i + 1 ? r : { ...r, rank: i + 1 }));
}
