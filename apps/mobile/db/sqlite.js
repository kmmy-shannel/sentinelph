// apps/mobile/db/sqlite.js
//
// Local SQLite outbox for offline-first report submission.
// Reports created while offline are enqueued here, then flushed by
// db/syncQueue.js once connectivity returns.
//
// Uses the new expo-sqlite async API (SDK 51+): openDatabaseAsync +
// runAsync/getAllAsync/execAsync.
//
// FIX (offline sender/region loss — CRITICAL): the reports_outbox table
// previously had no columns for `sender_number` or `region`. ReportScreen.js
// already builds an offline payload containing both `senderNumber` and a
// GPS-resolved `region`, but enqueueReport()'s INSERT silently dropped them
// because the columns didn't exist. Since reportController.js REQUIRES a
// sender (400 SENDER_REQUIRED otherwise), every offline-queued report was
// guaranteed to fail permanently once syncQueue.js tried to flush it. Both
// fields are now first-class columns: persisted on enqueue, migrated in
// for existing installs (ALTER TABLE, guarded like the existing
// evidence_image migration below), returned by deserializeRow(), and
// forwarded by syncQueue.js's POST payload.

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'sentinelph.db';

const DEFAULT_SCAM_TYPE = 'UNKNOWN';
const DEFAULT_REGION = 'UNCLASSIFIED';

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
      sender_number TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '${DEFAULT_REGION}',
      content TEXT NOT NULL,
      evidence_files TEXT,               -- JSON-stringified array of local file URIs
      evidence_image TEXT,               -- screenshot data-URI, for officer Review Queue
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

  // Migration for installs created before evidence_image existed.
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN evidence_image TEXT`
    );
  } catch {
    // Column already exists on this install — safe to ignore.
  }

  // FIX: migration for installs created before sender_number existed.
  // Existing rows get '' (empty string) rather than NULL so deserializeRow()
  // consumers can always rely on the field being a string, never
  // null/undefined — same convention scam_type already uses.
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN sender_number TEXT NOT NULL DEFAULT ''`
    );
  } catch {
    // Column already exists on this install — safe to ignore.
  }

  // FIX: migration for installs created before region existed.
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN region TEXT NOT NULL DEFAULT '${DEFAULT_REGION}'`
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
 * FIX: mirrors normalizeScamType()'s defensive pattern for sender_number.
 * The citizen UI already requires a sender before Step 1 can be completed
 * (see ReportScreen.js's `canProceedStep1`), so this should always receive
 * a real value — but we normalize defensively rather than trust every
 * caller, exactly like scamType already does.
 */
function normalizeSenderNumber(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * FIX: mirrors normalizeScamType()'s defensive pattern for region.
 * Falls back to the same 'UNCLASSIFIED' sentinel reportController.js uses
 * server-side, so an offline report with no resolvable region still lands
 * in the officer queue instead of being invisible.
 */
function normalizeRegion(value) {
  if (typeof value !== 'string') return DEFAULT_REGION;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_REGION;
}

/**
 * Adds a new report to the local outbox with synced = 0.
 * @param {object} report
 * @param {string} report.localId - client-generated UUID
 * @param {string} [report.scamType]
 * @param {string} [report.senderNumber]
 * @param {string} [report.region] - resolved PH region, or the sentinel
 *   'UNCLASSIFIED' value; may also be read from report.location.region
 *   if the caller only set the nested location object.
 * @param {object} [report.location] - optional { region } fallback source
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
  const senderNumber = normalizeSenderNumber(report.senderNumber);
  const region = normalizeRegion(report.region ?? report.location?.region);

  await db.runAsync(
    `INSERT INTO reports_outbox
      (local_id, scam_type, sender_number, region, content, evidence_files, evidence_image, voice_note_uri, latitude, longitude, nullifier, zkp_hash, created_at, synced, sync_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [
      report.localId,
      scamType,
      senderNumber,
      region,
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

  return { ...report, scamType, senderNumber, region, createdAt, synced: 0 };
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
    senderNumber: row.sender_number || '',
    region: row.region || DEFAULT_REGION,
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