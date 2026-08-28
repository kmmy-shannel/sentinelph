import * as SQLite from 'expo-sqlite';

let db = null;

/**
 * Initializes the local SQLite database and creates the offline
 * report queue table if it doesn't already exist.
 * Must be awaited once at app startup before any other db function is called.
 */
export async function initDB() {
  db = await SQLite.openDatabaseAsync('sentinelph.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pending_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_uuid TEXT NOT NULL,
      payload TEXT NOT NULL,
      reported_number TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT
    );
  `);

  return db;
}

function getDB() {
  if (!db) {
    throw new Error('SQLite database not initialized. Call initDB() before using this function.');
  }
  return db;
}

/**
 * Adds a report to the local offline queue.
 * @param {object} reportData - full report payload (text, number, evidence, location, etc.)
 * @returns {Promise<{id: number, localUuid: string, createdAt: string}>}
 */
export async function enqueueReport(reportData) {
  const database = getDB();

  const localUuid =
    reportData.localUuid || `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify({ ...reportData, localUuid });

  const result = await database.runAsync(
    `INSERT INTO pending_reports (local_uuid, payload, reported_number, created_at, synced, sync_attempts)
     VALUES (?, ?, ?, ?, 0, 0);`,
    [localUuid, payload, reportData.reportedNumber || null, createdAt]
  );

  return {
    id: result.lastInsertRowId,
    localUuid,
    createdAt,
  };
}

/**
 * Retrieves all reports that have not yet been synced to the backend.
 * @returns {Promise<Array<object>>}
 */
export async function getPendingReports() {
  const database = getDB();

  const rows = await database.getAllAsync(
    `SELECT * FROM pending_reports WHERE synced = 0 ORDER BY created_at ASC;`
  );

  return rows.map((row) => ({
    id: row.id,
    localUuid: row.local_uuid,
    payload: JSON.parse(row.payload),
    reportedNumber: row.reported_number,
    createdAt: row.created_at,
    synced: !!row.synced,
    syncAttempts: row.sync_attempts,
    lastError: row.last_error,
  }));
}

/**
 * Marks a queued report as successfully synced with the backend.
 * @param {number} id - local SQLite row id
 */
export async function markReportSynced(id) {
  const database = getDB();
  await database.runAsync(`UPDATE pending_reports SET synced = 1 WHERE id = ?;`, [id]);
  return true;
}

/**
 * Permanently deletes a synced report from the local queue.
 * Typically called right after markReportSynced() during a sync sweep.
 * @param {number} id - local SQLite row id
 */
export async function deleteSyncedReport(id) {
  const database = getDB();
  await database.runAsync(`DELETE FROM pending_reports WHERE id = ?;`, [id]);
  return true;
}

/**
 * Records a failed sync attempt against a queued report (for retry/backoff logic).
 * @param {number} id
 * @param {string} errorMessage
 */
export async function incrementSyncAttempt(id, errorMessage) {
  const database = getDB();
  await database.runAsync(
    `UPDATE pending_reports SET sync_attempts = sync_attempts + 1, last_error = ? WHERE id = ?;`,
    [errorMessage || null, id]
  );
  return true;
}

/**
 * Returns the count of unsynced reports — used for the Home screen's
 * Offline Sync Indicator badge.
 * @returns {Promise<number>}
 */
export async function getPendingReportsCount() {
  const database = getDB();
  const row = await database.getFirstAsync(
    `SELECT COUNT(*) as count FROM pending_reports WHERE synced = 0;`
  );
  return row?.count ?? 0;
}