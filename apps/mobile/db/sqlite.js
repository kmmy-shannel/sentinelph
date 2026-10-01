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
//
// FIX (AI verdict not persisting): ReportScreen.js already puts
// `aiRiskLevel` and `aiConfidenceScore` into the payload on every submit,
// but the table had no columns for them, so the INSERT silently dropped
// both and the My Reports modal showed "AI analysis was not available"
// even for reports the analyze endpoint had scored. Both fields are now
// first-class columns: created in CREATE TABLE, migrated via ALTER TABLE
// for existing installs, written by enqueueReport(), and returned by
// deserializeRow().
//
// FIX (review lifecycle): the citizen-visible status is a four-stage
// lifecycle — queued → under_review → confirmed | rejected — that is
// driven by officer votes on the server, NOT by the local `synced` flag.
// The `review_status` column stores the last-known value from
// GET /api/v1/reports/mine; refreshReportStatuses() in syncQueue.js
// updates it. Two helpers below update a single row by local_id or by
// nullifier (the identifier both sides share).
//
// NEW (blacklist cache): blacklist_cache caches blacklist lookups so the
// SearchScreen works offline and serves repeat queries instantly. Four
// helpers:
//   cacheBlacklistEntry       — write a single lookup result
//   cacheBlacklistBulk        — write the full public registry list
//   searchBlacklistCache      — read filtered results (LIKE query)
//   getAllBlacklistCache      — read the whole cache (browse mode)
//   pruneBlacklistCache       — age out rows >30 days
// Called from SearchScreen.js and App.js.
//
// NEW (Level 2 subtype + officer verdict — Phase 4 continuous learning):
// Nine new columns persist the AI's Level 2 subtype prediction and the
// officer's verified subtype verdict, so MyReportsScreen.js can show the
// citizen a subtype-specific verdict AND surface the officer's correction
// when it happens. These fields are the citizen-facing mirror of the
// training signal that feeds the monthly retrain:
//   ai_subtype, ai_subtype_confidence, ai_subtype_model_version,
//   ai_explanation_reasons, ai_label,
//   officer_verified_at, officer_subtype, officer_subtype_action,
//   officer_decision
// All are written by ReportScreen.js on enqueue, refreshed by
// syncQueue.js's refreshReportStatuses(), and read by MyReportsScreen.js.

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
      evidence_files TEXT,
      evidence_image TEXT,
      voice_note_uri TEXT,
      latitude REAL,
      longitude REAL,
      nullifier TEXT NOT NULL,
      zkp_hash TEXT,
      ai_risk_level TEXT,
      ai_confidence_score REAL,
      review_status TEXT NOT NULL DEFAULT 'queued',
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      sync_attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      server_report_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reports_outbox_synced
      ON reports_outbox (synced);

    CREATE TABLE IF NOT EXISTS blacklist_cache (
      identifier TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL DEFAULT 'number',
      risk_level TEXT NOT NULL DEFAULT 'unknown',
      status TEXT NOT NULL DEFAULT 'not_found',
      report_count INTEGER NOT NULL DEFAULT 0,
      scam_type TEXT,
      region TEXT,
      blacklisted_at TEXT,
      cached_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_blacklist_cache_identifier
      ON blacklist_cache (identifier);
  `);

  // ─── EXISTING MIGRATIONS (kept for backward compat) ─────────────
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN scam_type_default TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN evidence_image TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN sender_number TEXT NOT NULL DEFAULT ''`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN region TEXT NOT NULL DEFAULT '${DEFAULT_REGION}'`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_risk_level TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_confidence_score REAL`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN review_status TEXT NOT NULL DEFAULT 'queued'`
    );
  } catch {}

  // ─── NEW MIGRATIONS (Level 2 subtype + officer verdict) ─────────
  // AI Level 2 subtype and its metadata
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_subtype TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_subtype_confidence REAL`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_subtype_model_version TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_explanation_reasons TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN ai_label TEXT`
    );
  } catch {}

  // Officer verdict (populated by refreshReportStatuses once reviewed)
  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN officer_verified_at TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN officer_subtype TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN officer_subtype_action TEXT`
    );
  } catch {}

  try {
    await db.execAsync(
      `ALTER TABLE reports_outbox ADD COLUMN officer_decision TEXT`
    );
  } catch {}

  return db;
}

function normalizeScamType(value) {
  if (typeof value !== 'string') return DEFAULT_SCAM_TYPE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_SCAM_TYPE;
}

function normalizeSenderNumber(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeRegion(value) {
  if (typeof value !== 'string') return DEFAULT_REGION;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_REGION;
}

function normalizeConfidence(value) {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

function normalizeString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function enqueueReport(report) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  const scamType = normalizeScamType(report.scamType);
  const senderNumber = normalizeSenderNumber(report.senderNumber);
  const region = normalizeRegion(report.region ?? report.location?.region);
  const aiRiskLevel =
    typeof report.aiRiskLevel === 'string' && report.aiRiskLevel.trim().length > 0
      ? report.aiRiskLevel.trim()
      : null;
  const aiConfidenceScore = normalizeConfidence(report.aiConfidenceScore);

  // ─── NEW: Level 2 subtype + explanation reasons ─────────────────
  const aiSubtype = normalizeString(report.aiSubtype);
  const aiSubtypeConfidence = normalizeConfidence(report.aiSubtypeConfidence);
  const aiSubtypeModelVersion = normalizeString(report.aiSubtypeModelVersion);
  const aiLabel = normalizeString(report.aiLabel);

  // aiExplanationReasons is stored as JSON. Accept either an array
  // (from ReportScreen) or a pre-stringified value.
  let aiExplanationReasonsJson = null;
  if (Array.isArray(report.aiExplanationReasons)) {
    aiExplanationReasonsJson = JSON.stringify(report.aiExplanationReasons);
  } else if (typeof report.aiExplanationReasons === 'string' && report.aiExplanationReasons.length > 0) {
    aiExplanationReasonsJson = report.aiExplanationReasons;
  }

  // ─── NEW: Officer verdict (may already be present if refresh ran) ─
  const officerVerifiedAt = normalizeString(report.officerVerifiedAt);
  const officerSubtype = normalizeString(report.officerSubtype);
  const officerSubtypeAction = normalizeString(report.officerSubtypeAction);
  const officerDecision = normalizeString(report.officerDecision);

  const alreadySynced = Boolean(report.serverReportId);
  const syncedFlag = alreadySynced ? 1 : 0;

  await db.runAsync(
    `INSERT INTO reports_outbox
      (local_id, scam_type, sender_number, region, content,
       evidence_files, evidence_image, voice_note_uri,
       latitude, longitude,
       nullifier, zkp_hash,
       ai_risk_level, ai_confidence_score,
       ai_subtype, ai_subtype_confidence, ai_subtype_model_version,
       ai_explanation_reasons, ai_label,
       officer_verified_at, officer_subtype, officer_subtype_action, officer_decision,
       review_status, created_at, synced, sync_attempts, server_report_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
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
      aiRiskLevel,
      aiConfidenceScore,
      aiSubtype,
      aiSubtypeConfidence,
      aiSubtypeModelVersion,
      aiExplanationReasonsJson,
      aiLabel,
      officerVerifiedAt,
      officerSubtype,
      officerSubtypeAction,
      officerDecision,
      'queued',
      createdAt,
      syncedFlag,
      report.serverReportId || null,
    ]
  );

  return {
    ...report,
    scamType,
    senderNumber,
    region,
    aiRiskLevel,
    aiConfidenceScore,
    aiSubtype,
    aiSubtypeConfidence,
    aiSubtypeModelVersion,
    aiLabel,
    aiExplanationReasons: report.aiExplanationReasons || [],
    officerVerifiedAt,
    officerSubtype,
    officerSubtypeAction,
    officerDecision,
    createdAt,
    synced: Boolean(syncedFlag),
    serverReportId: report.serverReportId || null,
  };
}

export async function getPendingReports() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM reports_outbox WHERE synced = 0 ORDER BY created_at ASC`
  );
  return rows.map(deserializeRow);
}

export async function getAllReports() {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM reports_outbox ORDER BY created_at DESC`
  );
  return rows.map(deserializeRow);
}

export async function markReportSynced(localId, serverReportId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox SET synced = 1, server_report_id = ?, last_error = NULL WHERE local_id = ?`,
    [serverReportId, localId]
  );
}

export async function markReportSyncFailed(localId, errorMessage) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
     SET sync_attempts = sync_attempts + 1, last_error = ?
     WHERE local_id = ?`,
    [errorMessage, localId]
  );
}

export async function deleteSyncedReport(localId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reports_outbox WHERE local_id = ? AND synced = 1`, [localId]);
}

export async function clearAllReports() {
  const db = await getDb();
  await db.runAsync(`DELETE FROM reports_outbox`);
}

export async function updateReportReviewStatus(localId, reviewStatus) {
  if (typeof localId !== 'string' || localId.length === 0) return;
  const allowed = ['queued', 'under_review', 'confirmed', 'rejected'];
  if (!allowed.includes(reviewStatus)) return;

  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox SET review_status = ? WHERE local_id = ?`,
    [reviewStatus, localId]
  );
}

export async function updateReportReviewStatusByNullifier(nullifier, reviewStatus) {
  if (typeof nullifier !== 'string' || nullifier.length === 0) return;
  const allowed = ['queued', 'under_review', 'confirmed', 'rejected'];
  if (!allowed.includes(reviewStatus)) return;

  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox SET review_status = ? WHERE nullifier = ?`,
    [reviewStatus, nullifier]
  );
}

// ─── NEW: officer verdict updaters (called by refreshReportStatuses) ─

/**
 * Updates a report row with the officer's final subtype verdict,
 * after the server has finalized the review. Called from
 * syncQueue.js's refreshReportStatuses().
 *
 * Accepts the citizen-safe fields returned by GET /api/v1/reports/mine:
 *   officerVerifiedAt    ISO string or null
 *   officerSubtype       string or null
 *   officerSubtypeAction 'confirmed' | 'corrected' | 'unsure' | null
 *   officerDecision      'approve' | 'reject' | null
 */
export async function updateReportOfficerVerdict(
  localId,
  { officerVerifiedAt, officerSubtype, officerSubtypeAction, officerDecision }
) {
  if (typeof localId !== 'string' || localId.length === 0) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET officer_verified_at = ?,
            officer_subtype = ?,
            officer_subtype_action = ?,
            officer_decision = ?
      WHERE local_id = ?`,
    [
      officerVerifiedAt || null,
      officerSubtype || null,
      officerSubtypeAction || null,
      officerDecision || null,
      localId,
    ]
  );
}

/**
 * Same as updateReportOfficerVerdict but keyed on nullifier, which is
 * the identifier both client and server share regardless of local_id
 * drift after a reinstall.
 */
export async function updateReportOfficerVerdictByNullifier(
  nullifier,
  { officerVerifiedAt, officerSubtype, officerSubtypeAction, officerDecision }
) {
  if (typeof nullifier !== 'string' || nullifier.length === 0) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET officer_verified_at = ?,
            officer_subtype = ?,
            officer_subtype_action = ?,
            officer_decision = ?
      WHERE nullifier = ?`,
    [
      officerVerifiedAt || null,
      officerSubtype || null,
      officerSubtypeAction || null,
      officerDecision || null,
      nullifier,
    ]
  );
}

/**
 * Caches a single blacklist lookup result. Called by the SearchScreen
 * after a live GET /api/v1/blacklist/:id/status. The server returns a
 * citizen-safe shape (no officer details).
 */
export async function cacheBlacklistEntry(entry) {
  if (!entry || typeof entry !== 'object') return;
  const identifier = String(entry.phoneNumber || entry.identifier || '').trim();
  if (!identifier) return;

  const status = String(entry.status || 'not_found');
  const riskLevel =
    status === 'blacklisted' || status === 'approved'
      ? 'high'
      : status === 'under_review' || status === 'pending'
      ? 'medium'
      : 'low';
  const scamType =
    typeof entry.scamType === 'string' ? entry.scamType.trim() : null;
  const reportCount =
    typeof entry.reportCount === 'number' ? entry.reportCount : 0;
  const region = typeof entry.region === 'string' ? entry.region.trim() : null;
  const blacklistedAt = entry.blacklistedAt || null;

  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO blacklist_cache
       (identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      identifier,
      'number',
      riskLevel,
      status,
      reportCount,
      scamType,
      region,
      blacklistedAt,
      new Date().toISOString(),
    ]
  );
}

export async function cacheBlacklistBulk(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 0;

  const db = await getDb();
  const now = new Date().toISOString();
  let written = 0;

  for (const entry of entries) {
    const identifier = String(entry?.phoneNumber || '').trim();
    if (!identifier) continue;

    const status = String(entry.status || 'blacklisted');
    const riskLevel =
      status === 'blacklisted' || status === 'approved'
        ? 'high'
        : status === 'under_review' || status === 'pending'
        ? 'medium'
        : 'low';

    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO blacklist_cache
           (identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          identifier,
          'number',
          riskLevel,
          status,
          typeof entry.reportCount === 'number' ? entry.reportCount : 0,
          typeof entry.scamType === 'string' ? entry.scamType.trim() : null,
          typeof entry.region === 'string' ? entry.region.trim() : null,
          entry.blacklistedAt || null,
          now,
        ]
      );
      written += 1;
    } catch (err) {
      console.warn('[sqlite] cacheBlacklistBulk row failed:', identifier, err?.message);
    }
  }

  return written;
}

export async function getAllBlacklistCache(limit = 200) {
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at
       FROM blacklist_cache
      ORDER BY cached_at DESC
      LIMIT ?`,
    [limit]
  );

  return rows.map((r) => ({
    value: r.identifier,
    type: r.type || 'number',
    risk: r.risk_level || 'unknown',
    status: r.status || 'not_found',
    reportCount: r.report_count || 0,
    scamType: r.scam_type || null,
    region: r.region || null,
    blacklistedAt: r.blacklisted_at || null,
    source: 'cache',
  }));
}

export async function searchBlacklistCache(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (q.length < 2) return [];

  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at
       FROM blacklist_cache
      WHERE identifier LIKE ?
      ORDER BY cached_at DESC
      LIMIT 50`,
    [`%${q}%`]
  );

  return rows.map((r) => ({
    value: r.identifier,
    type: r.type || 'number',
    risk: r.risk_level || 'unknown',
    status: r.status || 'not_found',
    reportCount: r.report_count || 0,
    scamType: r.scam_type || null,
    region: r.region || null,
    blacklistedAt: r.blacklisted_at || null,
    source: 'cache',
  }));
}

export async function pruneBlacklistCache() {
  try {
    const db = await getDb();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.runAsync(`DELETE FROM blacklist_cache WHERE cached_at < ?`, [cutoff]);
  } catch (err) {
    console.warn('[sqlite] pruneBlacklistCache failed:', err?.message);
  }
}

function deserializeRow(row) {
  // ai_explanation_reasons is stored as JSON — parse defensively so a
  // malformed legacy value never crashes the whole list render.
  let aiExplanationReasons = [];
  if (typeof row.ai_explanation_reasons === 'string' && row.ai_explanation_reasons.length > 0) {
    try {
      const parsed = JSON.parse(row.ai_explanation_reasons);
      if (Array.isArray(parsed)) aiExplanationReasons = parsed;
    } catch (err) {
      console.warn('[sqlite] bad ai_explanation_reasons JSON on row', row.local_id);
    }
  }

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
    aiRiskLevel: row.ai_risk_level || null,
    aiConfidenceScore:
      typeof row.ai_confidence_score === 'number'
        ? row.ai_confidence_score
        : null,
    // ─── NEW: Level 2 subtype fields ──────────────────────────────
    aiSubtype: row.ai_subtype || null,
    aiSubtypeConfidence:
      typeof row.ai_subtype_confidence === 'number'
        ? row.ai_subtype_confidence
        : null,
    aiSubtypeModelVersion: row.ai_subtype_model_version || null,
    aiExplanationReasons,
    aiLabel: row.ai_label || null,
    // ─── NEW: officer verdict fields ──────────────────────────────
    officerVerifiedAt: row.officer_verified_at || null,
    officerSubtype: row.officer_subtype || null,
    officerSubtypeAction: row.officer_subtype_action || null,
    officerDecision: row.officer_decision || null,
    // ──────────────────────────────────────────────────────────────
    reviewStatus: row.review_status || 'queued',
    createdAt: row.created_at,
    synced: Boolean(row.synced),
    syncAttempts: row.sync_attempts,
    lastError: row.last_error,
    serverReportId: row.server_report_id,
  };
}