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

const DEFAULT_SCAM_TYPE = 'UNKNOWN';

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
      scam_type TEXT NOT NULL DEFAULT '${DEFAULT_SCAM_TYPE}',
      content TEXT NOT NULL,
      evidence_files TEXT,               -- JSON-stringified array of local file URIs
      evidence_image TEXT,               -- NEW: screenshot data-URI, for officer Review Queue
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

  // Migration for older installs whose schema lacked the DEFAULT clause:
  // existing rows cannot violate NOT NULL, but new INSERTs without
  // scam_type would still hit constraint 19. Guard each migration in its
  // own try/catch — SQLite throws if the column already exists.
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN scam_type_default TEXT`
    );
  } catch {
    // Column already exists or ALTER unsupported — safe to ignore.
  }

  // NEW: migration for installs created before evidence_image existed.
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN evidence_image TEXT`
    );
  } catch {
    // Column already exists on this install — safe to ignore.
  }

  return db;
}

/**
 * Normalizes any incoming report object to a value SQLite can safely
 * persist without violating `scam_type TEXT NOT NULL`.
 */
function normalizeScamType(value) {
  if (typeof value !== 'string') return DEFAULT_SCAM_TYPE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SCAM_TYPE;
}

/**
 * Adds a new report to the local outbox with synced = 0.
 * @param {object} report
 * @param {string} report.localId - client-generated UUID
 * @param {string} [report.scamType]
 * @param {string} report.content
 * @param {string[]} [report.evidenceFiles]
 * @param {string} [report.evidenceImage] - screenshot as a data-URI
 * @param {string} [report.voiceNoteUri]
 * @param {number} [report.latitude]
 * @param {number} [report.longitude]
 * @param {string} report.nullifier
 * @param {string} [report.zkpHash]
 */
export async function enqueueReport(report) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  const scamType = normalizeScamType(report.scamType);

  await db.runAsync(
    `INSERT INTO reports_outbox
      (local_id, scam_type, content, evidence_files, evidence_image, voice_note_uri, latitude, longitude, nullifier, zkp_hash, created_at, synced, sync_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [
      report.localId,
      scamType,
      report.content,
      JSON.stringify(report.evidenceFiles || []),
      report.evidenceImage || null,
      report.voiceNoteUri || null,
      report.latitude ?? null,
      report.longitude ?? null,
      report.nullifier,
      report.zkpHash || null,
      createdAt,
    ]
  );

  return { ...report, scamType, createdAt, synced: 0 };
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
    scamType: row.scam_type || DEFAULT_SCAM_TYPE,
    content: row.content,
    evidenceFiles: row.evidence_files ? JSON.parse(row.evidence_files) : [],
    evidenceImage: row.evidence_image || null,
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