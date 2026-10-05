/**
 * Deleting one drive, everywhere it is kept — and the exported files a drive
 * leaves in the cache.
 *
 * Server first, then this phone, for the reason account deletion gives
 * (app/settings.tsx, deleteAccount): if the server cannot be reached, nothing
 * is touched and the person is told so. Removing the local copy first would
 * leave the drive, and its leaderboard entries, on our servers while the app
 * said it was gone.
 *
 * The server half is delete_drives_and_reconcile (migration 0014), which
 * cascades to the fixes, the private route and the leaderboard entries, then
 * revokes any achievement the drive was the only reason for.
 *
 * A drive in a sync pass at the moment it is deleted is mostly covered by the
 * order: once the server row is gone the pass's next fix batch fails its
 * foreign key, and once the local rows are gone a pass that has not reached it
 * reads no fixes and skips it (sync.ts, `fixes.length < 2`). What is left is
 * a pass that read the fixes just before the local delete and whose drive
 * insert lands just after the server delete: that would upload the drive
 * again. Closing it needs sync.ts to skip ids deleted mid-pass.
 */

import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { supabase } from '@/lib/supabase';
import {
  applyImprovements,
  dayKey,
  EMPTY_PBS,
  findImprovements,
  type PersonalBests,
  useRecords,
} from '@/state/records';
import { useDriveStore } from './recorder';
import { listDrives, listUnsynced, type LocalDrive } from './wal';

export type DeleteDriveResult =
  /** Gone from the server (if it was ever there) and from this phone. */
  | 'deleted'
  /** A drive is being recorded. Nothing was touched. */
  | 'recording'
  /** The server could not be asked, or refused. Nothing was touched. */
  | 'unreachable'
  /**
   * The drive was uploaded, but this phone no longer has the session that
   * uploaded it, so nothing here can remove the server copy. Nothing was
   * touched: deleting only the local copy would be the half-delete above.
   */
  | 'signedOut'
  /** Removed from the server, but this phone's copy could not be removed. */
  | 'localFailed';

/**
 * The WAL's database (DB_NAME in src/drive/wal.ts). expo-sqlite keeps one
 * native connection per database file and hands the same one to every
 * openDatabaseSync of that name, so this is wal.ts's connection, not a second
 * writer. Here only because wal.ts has no single-drive delete yet; it belongs
 * there as `deleteLocalDrive(id)`.
 */
const WAL_DB = 'gapped-drives.db';

/** Every fix and the drive row, in one transaction so neither outlives the other. */
function removeLocal(id: string): void {
  const db = SQLite.openDatabaseSync(WAL_DB);
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM wal_fixes WHERE drive_id = ?', [id]);
    db.runSync('DELETE FROM local_drives WHERE id = ?', [id]);
  });
}

type ServerOutcome = 'ok' | 'unreachable' | 'signedOut';

/**
 * Asked for every drive with a session behind it, not only the ones marked
 * synced: an upload that stopped half way (sync.ts) leaves a drive row and
 * some fixes on the server while this phone still calls it unsynced.
 *
 * getSession is read the way deleteAccount reads it. An error is a stored
 * session that could not be refreshed (typically offline), not an absent one,
 * so it is "could not ask", never "nothing there".
 */
async function deleteOnServer(id: string, uploaded: boolean): Promise<ServerOutcome> {
  const client = supabase;
  // No backend configured: nothing was ever uploaded.
  if (!client) return 'ok';
  try {
    const { data, error } = await client.auth.getSession();
    if (error) return 'unreachable';
    if (!data.session) return uploaded ? 'signedOut' : 'ok';
    const { error: rpcError } = await client.rpc('delete_drives_and_reconcile', {
      p_drive_ids: [id],
      p_dry_run: false,
    });
    return rpcError ? 'unreachable' : 'ok';
  } catch {
    // A thrown fetch (no network, or the request timed out) is the same
    // "could not ask".
    return 'unreachable';
  }
}

/**
 * Personal bests and streak days, re-derived from the drives that remain.
 * The records store only ever adds (recordDrive), so a deleted drive's PB and
 * streak day would otherwise outlive it. Replayed oldest first, as the drives
 * were recorded, with recordDrive's own helpers — but into one store write,
 * so a long history is one persisted write rather than one per drive.
 */
export function rebuildRecords(drives: readonly LocalDrive[]): void {
  let pbs: PersonalBests = EMPTY_PBS;
  const days = new Set<string>();
  [...drives]
    .filter((d) => d.status === 'finalized' && d.summary != null)
    .sort((a, b) => a.startedAt - b.startedAt)
    .forEach((d) => {
      if (!d.summary) return;
      pbs = applyImprovements(pbs, findImprovements(pbs, d.summary));
      days.add(dayKey(d.summary.startedAt));
    });
  useRecords.setState({ pbs, driveDays: [...days] });
}

/**
 * The recorder's last finished drive outlives the screens (see the same step
 * in deleteAccount). Left pointing at a deleted drive, a Drive tab mounted
 * later would record it into the rebuilt records all over again. Clearing it
 * also tells the You and Ranks tabs, which subscribe to it, to re-read.
 */
function forgetInRecorder(drive: LocalDrive | undefined, id: string): void {
  const s = useDriveStore.getState();
  const isLast =
    drive?.summary != null &&
    s.lastSummary != null &&
    s.lastSummary.startedAt === drive.summary.startedAt &&
    s.lastSummary.endedAt === drive.summary.endedAt;
  const inRecovered = s.recovered.some((d) => d.id === id);
  if (!isLast && !inRecovered) return;
  useDriveStore.setState({
    ...(isLast ? { lastSummary: null } : {}),
    ...(inRecovered ? { recovered: s.recovered.filter((d) => d.id !== id) } : {}),
  });
}

/**
 * Delete one drive from the server and this phone, then bring the records in
 * line with what is left.
 *
 * Refused while any drive is recording, as account deletion is: a deletion
 * is a decision to make parked, and it keeps the WAL and the recorder's state
 * still while they are rewritten.
 */
export async function deleteDrive(id: string): Promise<DeleteDriveResult> {
  if (useDriveStore.getState().driveId != null) return 'recording';

  const drive = listDrives().find((d) => d.id === id);
  // Finalized and not in the unsynced list is the only way wal.ts reports a
  // completed upload.
  const uploaded = drive?.status === 'finalized' && !listUnsynced().some((d) => d.id === id);

  const server = await deleteOnServer(id, uploaded);
  if (server !== 'ok') return server;

  // Past here the server copy is gone, so the rest runs even if a drive was
  // started while the server answered: that drive is still 'recording', which
  // the rebuild skips, and it is recorded as usual when it ends.
  try {
    removeLocal(id);
  } catch {
    return 'localFailed';
  }
  forgetInRecorder(drive, id);
  rebuildRecords(listDrives());
  return 'deleted';
}

// ── Exported files ─────────────────────────────────────────────────────────

/**
 * Whether a cache file is one of the drive screen's GPX/CSV exports
 * (`gapped-<stamp>.gpx`). Those carry the full, untrimmed route.
 */
export function isExportFileName(name: string): boolean {
  return /^gapped-.+\.(gpx|csv)$/i.test(name);
}

/**
 * Remove an export once the share sheet is done with it. The share sheet has
 * copied or sent the file by the time shareAsync settles. Never throws: the
 * export already happened, and a file left behind is swept with the account.
 */
export function discardExportFile(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Left for sweepExportFiles.
  }
}

/**
 * Remove every GPX/CSV export left in the cache — account deletion's step for
 * them. The cache is not ours to empty wholesale (image-picker and view-shot
 * write there too), so only the export names go. Throws if the cache cannot
 * be listed, so the caller can say this device was not fully cleared.
 */
export function sweepExportFiles(): number {
  let removed = 0;
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && isExportFileName(entry.name)) {
      entry.delete();
      removed++;
    }
  }
  return removed;
}
