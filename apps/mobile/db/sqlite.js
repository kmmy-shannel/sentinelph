// apps/mobile/db/sqlite.js
//
// Local SQLite outbox for offline-first report submission.
// Reports created while offline are enqueued here, then flushed by
// db/syncQueue.js once connectivity returns.
//
// Uses the new expo-sqlite async API (SDK 51+): openDatabaseAsync +
// runAsync/getAllAsync/execAsync.

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'sentinelph.db';

let dbInstance = null;

async function getDb() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
}

/**
 * Creates the reports outbox table if it doesn't already exist.
 * Call once on app boot (e.g. in App.tsx's root effect).
 */
export async function initDB() {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS reports_outbox (
      local_id TEXT PRIMARY KEY NOT NULL,
      scam_type TEXT NOT NULL,
      content TEXT NOT NULL,
      evidence_files TEXT,               -- JSON-stringified array of local file URIs
      voice_note_uri TEXT,
      latitude REAL,
      longitude REAL,
      nullifier TEXT NOT NULL,
      zkp_hash TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0, -- 0 = pending, 1 = synced
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      server_report_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_outbox_synced
      ON reports_outbox (synced);
  `);

  return db;
}

/**
 * Adds a new report to the local outbox with synced = 0.
 * @param {object} report
 * @param {string} report.localId - client-generated UUID
 * @param {string} report.scamType
 * @param {string} report.content
 * @param {string[]} [report.evidenceFiles]
 * @param {string} [report.voiceNoteUri]
 * @param {number} [report.latitude]
 * @param {number} [report.longitude]
 * @param {string} report.nullifier
 * @param {string} [report.zkpHash]
 */
export async function enqueueReport(report) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO reports_outbox
      (local_id, scam_type, content, evidence_files, voice_note_uri, latitude, longitude, nullifier, zkp_hash, created_at, synced, sync_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [
      report.localId,
      report.scamType,
      report.content,
      JSON.stringify(report.evidenceFiles || []),
      report.voiceNoteUri || null,
      report.latitude ?? null,
      report.longitude ?? null,
      report.nullifier,
      report.zkpHash || null,
      createdAt,
    ]
  );

  return { ...report, createdAt, synced: 0 };
}

/**
 * Returns all reports not yet synced to the server, oldest first.
 */
export async function getPendingReports() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM reports_outbox WHERE synced = 0 ORDER BY created_at ASC`
  );
  return rows.map(deserializeRow);
}

/**
 * Returns every report in the outbox (pending + synced), newest first.
 * Used by MyReportsScreen to show full local history.
 */
export async function getAllReports() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM reports_outbox ORDER BY created_at DESC`
  );
  return rows.map(deserializeRow);
}

/**
 * Marks a report as synced and stores the server-assigned report ID.
 */
export async function markReportSynced(localId, serverReportId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox SET synced = 1, server_report_id = ?, last_error = NULL WHERE local_id = ?`,
    [serverReportId, localId]
  );
}

/**
 * Records a failed sync attempt (increments counter, stores last error)
 * without removing the report — it stays queued for the next sync pass.
 */
export async function markReportSyncFailed(localId, errorMessage) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
     SET sync_attempts = sync_attempts + 1, last_error = ?
     WHERE local_id = ?`,
    [errorMessage, localId]
  );
}

/**
 * Permanently deletes a synced report from the local outbox.
 * Call after confirming the server has the report, if you don't want to
 * keep local history (otherwise leave synced rows in place for MyReports).
 */
export async function deleteSyncedReport(localId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reports_outbox WHERE local_id = ? AND synced = 1`, [localId]);
}

/**
 * Wipes the entire outbox. Used by ProfileScreen's "Clear offline cache".
 */
export async function clearAllReports() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reports_outbox`);
}

function deserializeRow(row) {
  return {
    localId: row.local_id,
    scamType: row.scam_type,
    content: row.content,
    evidenceFiles: row.evidence_files ? JSON.parse(row.evidence_files) : [],
    voiceNoteUri: row.voice_note_uri,
    latitude: row.latitude,
    longitude: row.longitude,
    nullifier: row.nullifier,
    zkpHash: row.zkp_hash,
    createdAt: row.created_at,
    synced: Boolean(row.synced),
    syncAttempts: row.sync_attempts,
    lastError: row.last_error,
    serverReportId: row.server_report_id,
  };
}