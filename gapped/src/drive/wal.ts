/**
 * Crash-recoverable write-ahead log for the in-flight drive.
 *
 * Every fix is appended to SQLite immediately on arrival — the in-flight
 * drive is NEVER held only in memory. On cold start, `recoverUnterminated()`
 * finds any drive left in 'recording' state and finalises it from whatever
 * fixes made it to disk. TripRank destroyed a user's 800-mile trip on pause;
 * Open Road reset a user's lifetime stats. This file is why they lose.
 */

import * as SQLite from 'expo-sqlite';
import { Fix, DriveSummary } from './types';
import { summarize } from './stats';

const DB_NAME = 'gapped-drives.db';

let db: SQLite.SQLiteDatabase | null = null;

function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS local_drives (
        id          TEXT PRIMARY KEY,
        vehicle_id  TEXT,
        started_at  INTEGER NOT NULL,
        ended_at    INTEGER,
        status      TEXT NOT NULL DEFAULT 'recording',  -- recording | finalized | discarded
        summary     TEXT,                                -- JSON DriveSummary once finalized
        synced      INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS wal_fixes (
        drive_id    TEXT NOT NULL,
        seq         INTEGER NOT NULL,
        t           INTEGER NOT NULL,
        lat         REAL NOT NULL,
        lon         REAL NOT NULL,
        speed_ms    REAL,
        accuracy_m  REAL,
        altitude_m  REAL,
        heading     REAL,
        accel_x     REAL,
        accel_y     REAL,
        accel_z     REAL,
        pressure_hpa REAL,
        is_mock     INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (drive_id, seq)
      );
      CREATE INDEX IF NOT EXISTS idx_wal_drive ON wal_fixes (drive_id, t);
    `);
  }
  return db;
}

export function openDrive(id: string, startedAt: number, vehicleId?: string | null): void {
  getDb().runSync(
    `INSERT INTO local_drives (id, vehicle_id, started_at, status) VALUES (?, ?, ?, 'recording')`,
    [id, vehicleId ?? null, startedAt],
  );
}

let seqCounters: Record<string, number> = {};

/** Synchronous append — the fix is on disk before this returns. */
export function appendFix(driveId: string, fix: Fix): void {
  if (seqCounters[driveId] == null) {
    const row = getDb().getFirstSync<{ m: number | null }>(
      `SELECT MAX(seq) AS m FROM wal_fixes WHERE drive_id = ?`,
      [driveId],
    );
    seqCounters[driveId] = (row?.m ?? -1) + 1;
  }
  const seq = seqCounters[driveId]++;
  getDb().runSync(
    `INSERT INTO wal_fixes
      (drive_id, seq, t, lat, lon, speed_ms, accuracy_m, altitude_m, heading,
       accel_x, accel_y, accel_z, pressure_hpa, is_mock)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      driveId,
      seq,
      fix.t,
      fix.lat,
      fix.lon,
      fix.speedMs,
      fix.accuracyM,
      fix.altitudeM ?? null,
      fix.heading ?? null,
      fix.accelX ?? null,
      fix.accelY ?? null,
      fix.accelZ ?? null,
      fix.pressureHpa ?? null,
      fix.isMock ? 1 : 0,
    ],
  );
}

type FixRow = {
  seq: number;
  t: number;
  lat: number;
  lon: number;
  speed_ms: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading: number | null;
  accel_x: number | null;
  accel_y: number | null;
  accel_z: number | null;
  pressure_hpa: number | null;
  is_mock: number;
};

function rowToFix(r: FixRow): Fix {
  return {
    t: r.t,
    lat: r.lat,
    lon: r.lon,
    speedMs: r.speed_ms,
    accuracyM: r.accuracy_m,
    altitudeM: r.altitude_m,
    heading: r.heading,
    accelX: r.accel_x,
    accelY: r.accel_y,
    accelZ: r.accel_z,
    pressureHpa: r.pressure_hpa,
    isMock: r.is_mock === 1,
  };
}

export function readFixes(driveId: string): Fix[] {
  const rows = getDb().getAllSync<FixRow>(
    `SELECT * FROM wal_fixes WHERE drive_id = ? ORDER BY seq`,
    [driveId],
  );
  return rows.map(rowToFix);
}

/**
 * Incremental read for the live screen: only rows written after `sinceSeq`.
 * Polling readFixes() during a drive costs O(drive length) per poll, which
 * competes with appendFix on the same JS thread as the drive gets longer.
 * Pass −1 to start from the beginning; feed `lastSeq` back on the next call.
 */
export function readFixesSince(
  driveId: string,
  sinceSeq: number,
): { fixes: Fix[]; lastSeq: number } {
  const rows = getDb().getAllSync<FixRow>(
    `SELECT * FROM wal_fixes WHERE drive_id = ? AND seq > ? ORDER BY seq`,
    [driveId, sinceSeq],
  );
  return {
    fixes: rows.map(rowToFix),
    lastSeq: rows.length > 0 ? rows[rows.length - 1].seq : sinceSeq,
  };
}

/** Compute the summary from disk and mark the drive finalized. */
export function finalizeDrive(driveId: string, endedAt: number): DriveSummary {
  const fixes = readFixes(driveId);
  const summary = summarize(fixes);
  getDb().runSync(
    `UPDATE local_drives SET ended_at = ?, status = 'finalized', summary = ? WHERE id = ?`,
    [endedAt, JSON.stringify(summary), driveId],
  );
  delete seqCounters[driveId];
  return summary;
}

export type LocalDrive = {
  id: string;
  vehicleId: string | null;
  startedAt: number;
  endedAt: number | null;
  status: 'recording' | 'finalized' | 'discarded';
  summary: DriveSummary | null;
};

export function listDrives(): LocalDrive[] {
  const rows = getDb().getAllSync<{
    id: string;
    vehicle_id: string | null;
    started_at: number;
    ended_at: number | null;
    status: string;
    summary: string | null;
  }>(`SELECT * FROM local_drives WHERE status != 'discarded' ORDER BY started_at DESC`);
  return rows.map((r) => ({
    id: r.id,
    vehicleId: r.vehicle_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    status: r.status as LocalDrive['status'],
    summary: r.summary ? (JSON.parse(r.summary) as DriveSummary) : null,
  }));
}

/** Finalized drives not yet uploaded. */
export function listUnsynced(): LocalDrive[] {
  return listDrives().filter((d) => d.status === 'finalized' && !isSynced(d.id));
}

function isSynced(id: string): boolean {
  const row = getDb().getFirstSync<{ synced: number }>(
    `SELECT synced FROM local_drives WHERE id = ?`,
    [id],
  );
  return row?.synced === 1;
}

export function markSynced(id: string): void {
  getDb().runSync(`UPDATE local_drives SET synced = 1 WHERE id = ?`, [id]);
}

/**
 * Drop every drive and every fix held on this device. Used by account
 * deletion, which is the only caller allowed to destroy a recording — the WAL
 * exists precisely so drives are never lost by accident.
 *
 * Local only: nothing already uploaded is touched, and callers must not claim
 * otherwise.
 */
export function clearAll(): void {
  getDb().execSync(`DELETE FROM wal_fixes; DELETE FROM local_drives;`);
  seqCounters = {};
}

/**
 * Cold-start recovery. Any drive still marked 'recording' was interrupted —
 * app killed, phone died, crash. Finalise it from the fixes on disk so the
 * drive is never lost. Returns the recovered drives.
 */
export function recoverUnterminated(): LocalDrive[] {
  const stale = getDb().getAllSync<{ id: string }>(
    `SELECT id FROM local_drives WHERE status = 'recording'`,
  );
  const recovered: LocalDrive[] = [];
  for (const { id } of stale) {
    const fixes = readFixes(id);
    if (fixes.length < 2) {
      getDb().runSync(`UPDATE local_drives SET status = 'discarded' WHERE id = ?`, [id]);
      continue;
    }
    finalizeDrive(id, fixes[fixes.length - 1].t);
    const drive = getDb().getFirstSync<{
      id: string;
      vehicle_id: string | null;
      started_at: number;
      ended_at: number | null;
      status: string;
      summary: string | null;
    }>(`SELECT * FROM local_drives WHERE id = ?`, [id]);
    if (drive) {
      recovered.push({
        id: drive.id,
        vehicleId: drive.vehicle_id,
        startedAt: drive.started_at,
        endedAt: drive.ended_at,
        status: drive.status as LocalDrive['status'],
        summary: drive.summary ? (JSON.parse(drive.summary) as DriveSummary) : null,
      });
    }
  }
  return recovered;
}
