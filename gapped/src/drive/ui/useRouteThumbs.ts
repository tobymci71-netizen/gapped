import { useEffect, useReducer } from 'react';
import { readFixes } from '@/drive/wal';
import { routeThumb, type RouteThumb } from './routeGeometry';
import { ROUTE_TILE } from './RouteTile';

/**
 * Thumbnails already worked out, by drive id. A finished drive's fixes never
 * change, so one read per drive per session is enough: re-focusing the tab
 * or expanding the list redraws from here without touching the database.
 * Null means the drive has too few fixes to draw (or they could not be read).
 */
const cache = new Map<string, RouteThumb | null>();

/** Between reads, so a run of thumbnails never holds a frame. */
const READ_GAP_MS = 16;

/**
 * Route thumbnails for the given finished drives, drawn from each one's own
 * fixes in the local database.
 *
 * Reading a drive's fixes is a synchronous SQLite read of every row, on the
 * JS thread, so they are read one drive per macrotask after the screen has
 * painted, and only for the rows on screen. `enabled` is false during a
 * drive: the recorder appends fixes on this same thread, and a thumbnail is
 * not worth competing with it — rows show their empty tile until it ends.
 *
 * Returns a lookup: undefined while a drive's thumbnail is still to come.
 */
export function useRouteThumbs(
  ids: readonly string[],
  enabled: boolean,
): (id: string) => RouteThumb | null | undefined {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const key = ids.join(',');

  useEffect(() => {
    if (!enabled) return;
    const todo = key.split(',').filter((id) => id && !cache.has(id));
    if (todo.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = (i: number) => {
      if (cancelled || i >= todo.length) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        const id = todo[i];
        let thumb: RouteThumb | null = null;
        try {
          thumb = routeThumb(readFixes(id), ROUTE_TILE);
        } catch {
          // A row that cannot be read shows an empty tile, not an error.
          thumb = null;
        }
        cache.set(id, thumb);
        bump();
        next(i + 1);
      }, READ_GAP_MS);
    };
    next(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, enabled]);

  return (id: string) => cache.get(id);
}
