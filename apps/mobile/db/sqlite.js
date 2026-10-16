// apps/mobile/db/sqlite.js
//
// Local SQLite outbox for offline-first report submission.
// See the file's evolution in git history for the full fix log.
//
// NEW (targetKind): reports_outbox and blacklist_cache now carry a
// target_kind ('number' | 'brand') and brand_name column so the mobile
// Home screen can split the registry feed into two sections:
//   1. Blacklisted Numbers — phone numbers and SMS headers
//   2. Impersonated Brands — brands impersonated in scam SMS
//
// FIX (INSERT column/value drift): both INSERT statements into
// reports_outbox are now built from a single array of [column, value]
// tuples. This guarantees the column list, the placeholder list, and
// the values array cannot go out of sync (which was producing the
// "N values for M columns" SQLiteError on the online-fetch path).

import * as SQLite from 'expo-sqlite';

const DB_NAME = 'sentinelph.db';

const DEFAULT_SCAM_TYPE = 'UNKNOWN';
const DEFAULT_REGION = 'UNCLASSIFIED';

let dbInstance = null;

let activeUserId = null;

export function setActiveUser(uid) {
  activeUserId = typeof uid === 'string' && uid.length > 0 ? uid : null;
}

export function getActiveUserId() {
  return activeUserId;
}

async function getDb() {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
}

async function getTableColumns(db, tableName) {
  const rows = await db.getAllAsync(`PRAGMA table_info(${tableName})`);
  return new Set(rows.map((r) => r.name));
}

async function ensureColumn(db, tableName, columnName, columnDefinition) {
  try {
    const cols = await getTableColumns(db, tableName);
    if (cols.has(columnName)) return;

    await db.execAsync(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
    );

    const after = await getTableColumns(db, tableName);
    if (!after.has(columnName)) {
      console.error(
        `[sqlite] migration: ${tableName}.${columnName} still missing after ALTER`
      );
    }
  } catch (err) {
    console.error(
      `[sqlite] migration failed for ${tableName}.${columnName}:`,
      err?.message || err
    );
  }
}

export async function initDB() {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS reports_outbox (
      local_id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT,
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

  // ─── MIGRATIONS ─────────────────────────────────────────────────
  await ensureColumn(db, 'reports_outbox', 'scam_type_default', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'evidence_image', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'sender_number', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(
    db,
    'reports_outbox',
    'region',
    `TEXT NOT NULL DEFAULT '${DEFAULT_REGION}'`
  );
  await ensureColumn(db, 'reports_outbox', 'ai_risk_level', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'ai_confidence_score', 'REAL');
  await ensureColumn(
    db,
    'reports_outbox',
    'review_status',
    "TEXT NOT NULL DEFAULT 'queued'"
  );

  await ensureColumn(db, 'reports_outbox', 'user_id', 'TEXT');

  try {
    await db.runAsync(
      `UPDATE reports_outbox SET user_id = '' WHERE user_id IS NULL`
    );
  } catch (err) {
    console.error('[sqlite] user_id backfill failed:', err?.message || err);
  }

  try {
    await db.execAsync(
      `CREATE INDEX IF NOT EXISTS idx_reports_outbox_user_id
         ON reports_outbox (user_id)`
    );
  } catch (err) {
    console.error('[sqlite] user_id index creation failed:', err?.message || err);
  }

  await ensureColumn(db, 'reports_outbox', 'ai_subtype', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'ai_subtype_confidence', 'REAL');
  await ensureColumn(db, 'reports_outbox', 'ai_subtype_model_version', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'ai_explanation_reasons', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'ai_label', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'officer_verified_at', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'officer_subtype', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'officer_subtype_action', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'officer_decision', 'TEXT');

  // ─── Target kind (number vs brand impersonation) ────────────────
  await ensureColumn(db, 'reports_outbox', 'target_kind', 'TEXT');
  await ensureColumn(db, 'reports_outbox', 'brand_name', 'TEXT');
  await ensureColumn(db, 'blacklist_cache', 'target_kind', 'TEXT');
  await ensureColumn(db, 'blacklist_cache', 'brand_name', 'TEXT');

  try {
    await db.runAsync(`DELETE FROM reports_outbox WHERE user_id = ''`);
  } catch (err) {
    console.warn('[sqlite] pre-migration row cleanup failed:', err?.message || err);
  }

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

function requireActiveUserId() {
  if (!activeUserId) {
    throw new Error(
      '[sqlite] setActiveUser(uid) must be called before writing a report.'
    );
  }
  return activeUserId;
}

/**
 * Build an INSERT statement for reports_outbox from an ordered list of
 * [columnName, value] tuples. This is the only safe way to keep the
 * column list, the placeholder count, and the values array in sync.
 * Hand-written placeholder strings drift; tuples do not.
 */
function buildInsert(columns) {
  const colNames = columns.map((c) => c[0]).join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const values = columns.map((c) => c[1]);
  return {
    sql: `INSERT INTO reports_outbox (${colNames}) VALUES (${placeholders})`,
    values,
  };
}

export async function enqueueReport(report) {
  const db = await getDb();
  const userId = requireActiveUserId();
  const createdAt = new Date().toISOString();

  const scamType = normalizeScamType(report.scamType);
  const senderNumber = normalizeSenderNumber(report.senderNumber);
  const region = normalizeRegion(report.region ?? report.location?.region);
  const aiRiskLevel =
    typeof report.aiRiskLevel === 'string' && report.aiRiskLevel.trim().length > 0
      ? report.aiRiskLevel.trim()
      : null;
  const aiConfidenceScore = normalizeConfidence(report.aiConfidenceScore);

  const aiSubtype = normalizeString(report.aiSubtype);
  const aiSubtypeConfidence = normalizeConfidence(report.aiSubtypeConfidence);
  const aiSubtypeModelVersion = normalizeString(report.aiSubtypeModelVersion);
  const aiLabel = normalizeString(report.aiLabel);

  let aiExplanationReasonsJson = null;
  if (Array.isArray(report.aiExplanationReasons)) {
    aiExplanationReasonsJson = JSON.stringify(report.aiExplanationReasons);
  } else if (
    typeof report.aiExplanationReasons === 'string' &&
    report.aiExplanationReasons.length > 0
  ) {
    aiExplanationReasonsJson = report.aiExplanationReasons;
  }

  const officerVerifiedAt = normalizeString(report.officerVerifiedAt);
  const officerSubtype = normalizeString(report.officerSubtype);
  const officerSubtypeAction = normalizeString(report.officerSubtypeAction);
  const officerDecision = normalizeString(report.officerDecision);

  const targetKind = report.targetKind === 'brand' ? 'brand' : 'number';
  const brandName = normalizeString(report.brandName);

  const alreadySynced = Boolean(report.serverReportId);
  const syncedFlag = alreadySynced ? 1 : 0;

  const { sql, values } = buildInsert([
    ['local_id', report.localId],
    ['user_id', userId],
    ['scam_type', scamType],
    ['sender_number', senderNumber],
    ['region', region],
    ['content', report.content],
    ['evidence_files', JSON.stringify(report.evidenceFiles || [])],
    ['evidence_image', report.evidenceImage || null],
    ['voice_note_uri', report.voiceNoteUri || null],
    ['latitude', report.latitude ?? null],
    ['longitude', report.longitude ?? null],
    ['nullifier', report.nullifier],
    ['zkp_hash', report.zkpHash || null],
    ['ai_risk_level', aiRiskLevel],
    ['ai_confidence_score', aiConfidenceScore],
    ['ai_subtype', aiSubtype],
    ['ai_subtype_confidence', aiSubtypeConfidence],
    ['ai_subtype_model_version', aiSubtypeModelVersion],
    ['ai_explanation_reasons', aiExplanationReasonsJson],
    ['ai_label', aiLabel],
    ['officer_verified_at', officerVerifiedAt],
    ['officer_subtype', officerSubtype],
    ['officer_subtype_action', officerSubtypeAction],
    ['officer_decision', officerDecision],
    ['target_kind', targetKind],
    ['brand_name', brandName],
    ['review_status', 'queued'],
    ['created_at', createdAt],
    ['synced', syncedFlag],
    ['sync_attempts', 0],
    ['last_error', null],
    ['server_report_id', report.serverReportId || null],
  ]);

  await db.runAsync(sql, values);

  return {
    ...report,
    userId,
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
    targetKind,
    brandName,
    createdAt,
    synced: Boolean(syncedFlag),
    serverReportId: report.serverReportId || null,
  };
}

export async function getPendingReports() {
  if (!activeUserId) return [];
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM reports_outbox
      WHERE synced = 0 AND user_id = ?
      ORDER BY created_at ASC`,
    [activeUserId]
  );
  return rows.map(deserializeRow);
}

export async function getAllReports() {
  if (!activeUserId) return [];
  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT * FROM reports_outbox
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [activeUserId]
  );
  return rows.map(deserializeRow);
}

export async function markReportSynced(localId, serverReportId) {
  if (!activeUserId) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET synced = 1, server_report_id = ?, last_error = NULL
      WHERE local_id = ? AND user_id = ?`,
    [serverReportId, localId, activeUserId]
  );
}

export async function markReportSyncFailed(localId, errorMessage) {
  if (!activeUserId) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET sync_attempts = sync_attempts + 1, last_error = ?
      WHERE local_id = ? AND user_id = ?`,
    [errorMessage, localId, activeUserId]
  );
}

export async function deleteSyncedReport(localId) {
  if (!activeUserId) return;
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM reports_outbox
      WHERE local_id = ? AND synced = 1 AND user_id = ?`,
    [localId, activeUserId]
  );
}

export async function clearAllReports() {
  if (!activeUserId) return;
  const db = await getDb();
  await db.runAsync(
    `DELETE FROM reports_outbox WHERE user_id = ?`,
    [activeUserId]
  );
}

export async function updateReportReviewStatus(localId, reviewStatus) {
  if (!activeUserId) return;
  if (typeof localId !== 'string' || localId.length === 0) return;
  const allowed = ['queued', 'under_review', 'confirmed', 'rejected'];
  if (!allowed.includes(reviewStatus)) return;

  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET review_status = ?
      WHERE local_id = ? AND user_id = ?`,
    [reviewStatus, localId, activeUserId]
  );
}

export async function updateReportReviewStatusByNullifier(nullifier, reviewStatus) {
  if (!activeUserId) return;
  if (typeof nullifier !== 'string' || nullifier.length === 0) return;
  const allowed = ['queued', 'under_review', 'confirmed', 'rejected'];
  if (!allowed.includes(reviewStatus)) return;

  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET review_status = ?
      WHERE nullifier = ? AND user_id = ?`,
    [reviewStatus, nullifier, activeUserId]
  );
}

export async function updateReportOfficerVerdict(
  localId,
  { officerVerifiedAt, officerSubtype, officerSubtypeAction, officerDecision }
) {
  if (!activeUserId) return;
  if (typeof localId !== 'string' || localId.length === 0) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET officer_verified_at = ?,
            officer_subtype = ?,
            officer_subtype_action = ?,
            officer_decision = ?
      WHERE local_id = ? AND user_id = ?`,
    [
      officerVerifiedAt || null,
      officerSubtype || null,
      officerSubtypeAction || null,
      officerDecision || null,
      localId,
      activeUserId,
    ]
  );
}

export async function updateReportOfficerVerdictByNullifier(
  nullifier,
  { officerVerifiedAt, officerSubtype, officerSubtypeAction, officerDecision }
) {
  if (!activeUserId) return;
  if (typeof nullifier !== 'string' || nullifier.length === 0) return;
  const db = await getDb();
  await db.runAsync(
    `UPDATE reports_outbox
        SET officer_verified_at = ?,
            officer_subtype = ?,
            officer_subtype_action = ?,
            officer_decision = ?
      WHERE nullifier = ? AND user_id = ?`,
    [
      officerVerifiedAt || null,
      officerSubtype || null,
      officerSubtypeAction || null,
      officerDecision || null,
      nullifier,
      activeUserId,
    ]
  );
}

export async function upsertReportsFromServer(serverReports) {
  if (!activeUserId) return { inserted: 0, updated: 0 };
  if (!Array.isArray(serverReports) || serverReports.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const db = await getDb();
  let inserted = 0;
  let updated = 0;

  const ALLOWED_STATUSES = ['queued', 'under_review', 'confirmed', 'rejected'];

  for (const r of serverReports) {
    if (!r || typeof r.nullifier !== 'string' || r.nullifier.length === 0) {
      continue;
    }

    const serverReportId =
      typeof r.reportId === 'string' ? r.reportId : null;

    const reviewStatus =
      typeof r.reviewStatus === 'string' &&
      ALLOWED_STATUSES.includes(r.reviewStatus)
        ? r.reviewStatus
        : null;

    const officerVerifiedAt =
      typeof r.officerVerifiedAt === 'string' ? r.officerVerifiedAt : null;
    const officerSubtype =
      typeof r.officerSubtype === 'string' ? r.officerSubtype : null;
    const officerSubtypeAction =
      typeof r.officerSubtypeAction === 'string'
        ? r.officerSubtypeAction
        : null;
    const officerDecision =
      typeof r.officerDecision === 'string' ? r.officerDecision : null;

    const existing = await db.getAllAsync(
      `SELECT local_id FROM reports_outbox
        WHERE nullifier = ? AND user_id = ?
        LIMIT 1`,
      [r.nullifier, activeUserId]
    );

    if (existing.length > 0) {
      const localId = existing[0].local_id;

      try {
        if (reviewStatus) {
          await db.runAsync(
            `UPDATE reports_outbox SET review_status = ? WHERE local_id = ?`,
            [reviewStatus, localId]
          );
        }

        if (officerVerifiedAt) {
          await db.runAsync(
            `UPDATE reports_outbox
                SET officer_verified_at = ?,
                    officer_subtype = ?,
                    officer_subtype_action = ?,
                    officer_decision = ?
              WHERE local_id = ?`,
            [
              officerVerifiedAt,
              officerSubtype,
              officerSubtypeAction,
              officerDecision,
              localId,
            ]
          );
        }

        if (serverReportId) {
          await db.runAsync(
            `UPDATE reports_outbox
                SET server_report_id = ?, synced = 1
              WHERE local_id = ?`,
            [serverReportId, localId]
          );
        }

        updated += 1;
      } catch (err) {
        console.warn(
          '[sqlite] upsertReportsFromServer update failed:',
          r.nullifier,
          err?.message
        );
      }
      continue;
    }

    const localId =
      r.localId ||
      (serverReportId
        ? `srv-${serverReportId}`
        : `srv-${r.nullifier.slice(2, 14)}`);

    const scamType = normalizeScamType(r.scamType || r.category);
    const senderNumber = normalizeSenderNumber(
      r.reportedNumber || r.sender || ''
    );
    const region = normalizeRegion(
      r.region || (r.location && r.location.region) || r.jurisdiction
    );

    let content;
    if (typeof r.content === 'string' && r.content.length > 0) {
      content = r.content;
    } else if (typeof r.textData === 'string' && r.textData.length > 0) {
      content = r.textData;
    } else if (r.hasEvidenceImage || r.evidenceImage) {
      content = '[screenshot attached]';
    } else {
      content = '[report from server]';
    }

    const ai = r.aiFlag || {};
    const aiRiskLevel =
      typeof ai.riskLevel === 'string' && ai.riskLevel.length > 0
        ? ai.riskLevel.trim()
        : null;
    const aiConfidenceScore =
      typeof ai.confidenceScore === 'number' ? ai.confidenceScore : null;
    const aiSubtype = typeof ai.subtype === 'string' ? ai.subtype : null;
    const aiSubtypeConfidence =
      typeof ai.subtypeConfidence === 'number' ? ai.subtypeConfidence : null;
    const aiSubtypeModelVersion =
      typeof ai.subtypeModelVersion === 'string'
        ? ai.subtypeModelVersion
        : null;
    const aiLabel = typeof ai.label === 'string' ? ai.label : null;

    let aiExplanationReasonsJson = null;
    if (
      Array.isArray(ai.explanationReasons) &&
      ai.explanationReasons.length > 0
    ) {
      aiExplanationReasonsJson = JSON.stringify(ai.explanationReasons);
    }

    const createdAt =
      typeof r.createdAt === 'string' && r.createdAt.length > 0
        ? r.createdAt
        : new Date().toISOString();

    const reviewStatusForInsert = reviewStatus || 'queued';

    const evidenceImage =
      typeof r.evidenceImage === 'string' && r.evidenceImage.length > 0
        ? r.evidenceImage
        : null;

    const latitude =
      r.location && typeof r.location.latitude === 'number'
        ? r.location.latitude
        : null;
    const longitude =
      r.location && typeof r.location.longitude === 'number'
        ? r.location.longitude
        : null;

    const targetKindForInsert =
      r.targetKind === 'brand' ? 'brand' : 'number';
    const brandNameForInsert =
      targetKindForInsert === 'brand' ? (r.brandName || null) : null;

    try {
      const { sql, values } = buildInsert([
        ['local_id', localId],
        ['user_id', activeUserId],
        ['scam_type', scamType],
        ['sender_number', senderNumber],
        ['region', region],
        ['content', content],
        ['evidence_files', JSON.stringify([])],
        ['evidence_image', evidenceImage],
        ['voice_note_uri', null],
        ['latitude', latitude],
        ['longitude', longitude],
        ['nullifier', r.nullifier],
        ['zkp_hash', null],
        ['ai_risk_level', aiRiskLevel],
        ['ai_confidence_score', aiConfidenceScore],
        ['ai_subtype', aiSubtype],
        ['ai_subtype_confidence', aiSubtypeConfidence],
        ['ai_subtype_model_version', aiSubtypeModelVersion],
        ['ai_explanation_reasons', aiExplanationReasonsJson],
        ['ai_label', aiLabel],
        ['officer_verified_at', officerVerifiedAt],
        ['officer_subtype', officerSubtype],
        ['officer_subtype_action', officerSubtypeAction],
        ['officer_decision', officerDecision],
        ['target_kind', targetKindForInsert],
        ['brand_name', brandNameForInsert],
        ['review_status', reviewStatusForInsert],
        ['created_at', createdAt],
        ['synced', 1],
        ['sync_attempts', 0],
        ['last_error', null],
        ['server_report_id', serverReportId],
      ]);

      await db.runAsync(sql, values);
      inserted += 1;
    } catch (err) {
      console.warn(
        '[sqlite] upsertReportsFromServer insert failed:',
        r.nullifier,
        err?.message
      );
    }
  }

  return { inserted, updated };
}

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
  const targetKind = entry.targetKind === 'brand' ? 'brand' : 'number';
  const brandName = normalizeString(entry.brandName);

  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO blacklist_cache
       (identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at, cached_at, target_kind, brand_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      targetKind,
      brandName,
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
    const targetKind = entry.targetKind === 'brand' ? 'brand' : 'number';
    const brandName = normalizeString(entry.brandName);

    try {
      await db.runAsync(
        `INSERT OR REPLACE INTO blacklist_cache
           (identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at, cached_at, target_kind, brand_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          targetKind,
          brandName,
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
    `SELECT identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at, target_kind, brand_name
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
    targetKind: r.target_kind || 'number',
    brandName: r.brand_name || null,
    source: 'cache',
  }));
}

export async function searchBlacklistCache(query) {
  const q = typeof query === 'string' ? query.trim() : '';
  if (q.length < 2) return [];

  const db = await getDb();
  const rows = await db.getAllAsync(
    `SELECT identifier, type, risk_level, status, report_count, scam_type, region, blacklisted_at, target_kind, brand_name
       FROM blacklist_cache
      WHERE identifier LIKE ? OR brand_name LIKE ?
      ORDER BY cached_at DESC
      LIMIT 50`,
    [`%${q}%`, `%${q}%`]
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
    targetKind: r.target_kind || 'number',
    brandName: r.brand_name || null,
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
    userId: row.user_id || null,
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
    aiSubtype: row.ai_subtype || null,
    aiSubtypeConfidence:
      typeof row.ai_subtype_confidence === 'number'
        ? row.ai_subtype_confidence
        : null,
    aiSubtypeModelVersion: row.ai_subtype_model_version || null,
    aiExplanationReasons,
    aiLabel: row.ai_label || null,
    officerVerifiedAt: row.officer_verified_at || null,
    officerSubtype: row.officer_subtype || null,
    officerSubtypeAction: row.officer_subtype_action || null,
    officerDecision: row.officer_decision || null,
    targetKind: row.target_kind || 'number',
    brandName: row.brand_name || null,
    reviewStatus: row.review_status || 'queued',
    createdAt: row.created_at,
    synced: Boolean(row.synced),
    syncAttempts: row.sync_attempts,
    lastError: row.last_error,
    serverReportId: row.server_report_id,
  };
}