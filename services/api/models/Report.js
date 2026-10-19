// services/api/models/Report.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { computeHash } = require('../utils/hashChain');

const { Schema } = mongoose;

const OPEN_STATUSES = ['pending', 'under_review', 'one_approval', 'two_approvals'];
const RESOLVED_STATUSES = ['blacklisted', 'approved', 'rejected'];
const CONSENSUS_REQUIRED = 3;
const DECISIVE_VOTES = 2;

const VALID_TIERS = ['malicious', 'grey_area', 'legitimate'];
const VALID_SUBTYPE_ACTIONS = ['confirmed', 'corrected', 'unsure', null];

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

function unwrapFindOneAndUpdate(result) {
  if (!result) return null;
  const isEnvelope =
    Object.prototype.hasOwnProperty.call(result, 'value') &&
    Object.prototype.hasOwnProperty.call(result, 'ok');
  return isEnvelope ? result.value || null : result;
}

function computeAggregatedClassification(votes) {
  const subtypeTally = {};
  const tierTally = {};

  for (const v of votes || []) {
    if (v.subtypeAction === 'unsure') continue;

    let subtype = null;
    let tier = null;

    if (v.subtypeAction === 'corrected') {
      subtype = v.correctedSubtype || null;
      tier = v.correctedTier || null;
    } else if (v.subtypeAction === 'confirmed') {
      subtype = v.aiSubtypeAtVote || null;
      tier = v.aiTierAtVote || null;
    } else if (v.decision === 'approve') {
      subtype = v.aiSubtypeAtVote || null;
      tier = v.aiTierAtVote || null;
    }

    if (subtype) subtypeTally[subtype] = (subtypeTally[subtype] || 0) + 1;
    if (tier) tierTally[tier] = (tierTally[tier] || 0) + 1;
  }

  const pickWinner = (tally) => {
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) return { label: null, agreement: 0 };
    const [winner, count] = sorted[0];
    return { label: winner, agreement: count };
  };

  const subtypeResult = pickWinner(subtypeTally);
  const tierResult = pickWinner(tierTally);

  return {
    subtype: subtypeResult.label,
    subtypeAgreement: subtypeResult.agreement,
    tier: tierResult.label,
    tierAgreement: tierResult.agreement,
  };
}

const AiFlagSchema = new Schema(
  {
    available: { type: Boolean, default: false },
    probabilityScore: { type: Number, min: 0, max: 1, default: null },
    label: {
      type: String,
      enum: ['legitimate', 'grey_area', 'malicious', 'likely_scam', 'uncertain', 'likely_legitimate', 'unavailable'],
      default: 'unavailable',
    },
    subtype: {
      type: String,
      enum: [
        'personal_conversational', 'two_factor_auth', 'appointment_reminder',
        'delivery_tracking', 'bank_activity_alert',
        'brand_marketing',
        'phishing_link', 'fake_prize_lottery',
        'wrong_number_baiting', 'urgent_fine_toll', 'impersonation_family',
        'UNLABELED',
        null,
      ],
      default: null,
    },
    subtypeConfidence: { type: Number, min: 0, max: 1, default: null },
    subtypeModelVersion: { type: String, default: null },
    isScam: { type: Boolean, default: null },
    confidenceScore: { type: Number, min: 0, max: 1, default: null },
    riskLevel: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'], default: 'UNKNOWN' },
    explanationReasons: {
      type: [new Schema({ category: { type: String, default: '' }, description: { type: String, default: '' } }, { _id: false })],
      default: [],
    },
    ocrUsed: { type: Boolean, default: false },
    ocrText: { type: String, default: null },
    ocrExtractedChars: { type: Number, default: 0 },
    modelVersion: { type: String, default: null },
    advisoryOnly: { type: Boolean, default: true },
    checkedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { _id: false }
);
AiFlagSchema.pre('validate', function autoMarkAvailable(next) {
  const hasRealSignal =
    this.subtype != null ||
    (this.label && this.label !== 'unavailable') ||
    (this.riskLevel && this.riskLevel !== 'UNKNOWN') ||
    this.confidenceScore != null ||
    this.subtypeConfidence != null;
  if (hasRealSignal) {
    this.available = true;
  }
  return next();
});
const LocationSchema = new Schema(
  {
    address: { type: String, trim: true, maxlength: 300, default: null },
    region: { type: String, trim: true, maxlength: 120, default: null },
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
    latitude: { type: Number, min: -90, max: 90, default: null },
    longitude: { type: Number, min: -180, max: 180, default: null },
  },
  { _id: false }
);

const VoteSchema = new Schema(
  {
    userId: { type: String, required: true },
    role: { type: String, default: 'officer' },
    decision: { type: String, enum: ['approve', 'reject'], required: true },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    votedAt: { type: Date, default: Date.now },
    editedAt: { type: Date, default: null },
    subtypeAction: { type: String, enum: ['confirmed', 'corrected', 'unsure', null], default: null },
    correctedSubtype: { type: String, default: null },
    correctedTier: { type: String, enum: [...VALID_TIERS, null], default: null },
    isHighValue: { type: Boolean, default: false },
    aiSubtypeAtVote: { type: String, default: null },
    aiTierAtVote: { type: String, enum: ['malicious', 'grey_area', 'legitimate', 'unavailable', null], default: null },
    aiSubtypeModelVersionAtVote: { type: String, default: null },
  },
  { _id: false }
);

const ConsensusSchema = new Schema(
  { approvals: { type: Number, default: 0 }, rejections: { type: Number, default: 0 }, required: { type: Number, default: DECISIVE_VOTES } },
  { _id: false }
);

const ReportSchema = new Schema(
  {
    reportId: { type: String, required: true, unique: true, default: () => uuidv4(), immutable: true },
    textData: { type: String, required: false, trim: true, maxlength: 2000, default: null, immutable: true },
    reportedNumber: { type: String, required: true, trim: true, maxlength: 40, immutable: true },
    targetKind: { type: String, enum: ['number', 'brand'], default: 'number', index: true, immutable: true },
    brandName: { type: String, trim: true, maxlength: 80, default: null, index: true, immutable: true },
    location: { type: LocationSchema, default: () => ({}), immutable: true },
    nullifier: { type: String, required: true, unique: true, trim: true, immutable: true },
    aiFlag: { type: AiFlagSchema, default: () => ({}), immutable: true },
    sequence: { type: Number, required: true, unique: true, immutable: true },
    previousHash: { type: String, required: true, immutable: true },
    hash: { type: String, unique: true, immutable: true },
    sender: { type: String, trim: true, maxlength: 40, default: null },
    scammerNumber: { type: String, trim: true, maxlength: 40, default: null },
    evidenceText: { type: String, trim: true, maxlength: 2000, default: null },
    content: { type: String, trim: true, maxlength: 2000, default: null },
    scamType: { type: String, trim: true, maxlength: 60, default: 'UNKNOWN' },
    category: { type: String, trim: true, maxlength: 60, default: 'UNKNOWN' },
    channel: { type: String, trim: true, maxlength: 20, default: 'SMS' },
    jurisdiction: { type: String, trim: true, maxlength: 60, default: 'PH' },
    evidenceFiles: { type: [String], default: [] },
    evidenceImage: { type: String, default: null },
    hasEvidenceImage: { type: Boolean, default: false },
    nullifierHash: { type: String, trim: true, default: null },
    zkpHash: { type: String, trim: true, default: null },
    aiScore: { type: Number, min: 0, max: 1, default: null },
    citizenHash: { type: String, trim: true, index: true, immutable: true, select: false, default: null },
    reporterName: { type: String, trim: true, maxlength: 120, default: null },
    reporterEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    reporterShared: { type: Boolean, default: false },
    officerAction: { type: String, enum: ['confirmed', 'corrected', 'unsure', 'spam', null], default: null },
    officerSubtype: { type: String, default: null },
    officerLabel: { type: String, enum: ['legitimate', 'grey_area', 'malicious', null], default: null },
    officerId: { type: String, default: null, index: true },
    officerVerifiedAt: { type: Date, default: null },
    isHighValue: { type: Boolean, default: false },
    officerSubtypeAggregated: { type: String, default: null },
    officerSubtypeAgreement: { type: Number, default: 0 },
    officerTierAggregated: { type: String, enum: [...VALID_TIERS, null], default: null },
    officerTierAgreement: { type: Number, default: 0 },
    officerSubtypeFinalizedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'one_approval', 'two_approvals', 'blacklisted', 'approved', 'rejected'],
      default: 'pending',
    },
    resolvedAt: { type: Date, default: null },
    votes: { type: [VoteSchema], default: [] },
    consensusState: { type: ConsensusSchema, default: () => ({}) },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ReportSchema.path('createdAt', { immutable: true });
ReportSchema.index({ reportedNumber: 1, status: 1 });
ReportSchema.index({ status: 1, sequence: -1 });
ReportSchema.index({ status: 1, resolvedAt: -1 });
ReportSchema.index({ targetKind: 1, status: 1 });
ReportSchema.index({ targetKind: 1, brandName: 1 });

ReportSchema.methods.getCanonicalPayload = function getCanonicalPayload() {
  return {
    reportId: this.reportId,
    textData: this.textData,
    reportedNumber: this.reportedNumber,
    location: this.location ? this.location.toObject() : undefined,
    nullifier: this.nullifier,
    aiFlag: this.aiFlag ? this.aiFlag.toObject() : undefined,
    sequence: this.sequence,
    createdAt: this.createdAt,
  };
};

ReportSchema.pre('save', function preSaveHashChain(next) {
  if (!this.isNew) return next(new Error('Report documents are immutable.'));
  if (!this.previousHash) return next(new Error('previousHash must be set.'));
  if (typeof this.sequence !== 'number') return next(new Error('sequence must be set.'));
  if (!this.createdAt) this.createdAt = new Date();
  try {
    this.hash = computeHash(this.getCanonicalPayload(), this.previousHash);
    return next();
  } catch (err) { return next(err); }
});

function blockDirectMutation(next) {
  next(new Error('Report documents are append-only. Direct update/delete operations are not permitted.'));
}
ReportSchema.pre('findOneAndUpdate', blockDirectMutation);
ReportSchema.pre('updateMany', blockDirectMutation);
ReportSchema.pre('updateOne', blockDirectMutation);
ReportSchema.pre('deleteOne', blockDirectMutation);
ReportSchema.pre('deleteMany', blockDirectMutation);
ReportSchema.pre('findOneAndDelete', blockDirectMutation);
ReportSchema.pre('findOneAndRemove', blockDirectMutation);

function validateCorrectionPayload({ subtypeAction, correctedSubtype, correctedTier }) {
  if (!VALID_SUBTYPE_ACTIONS.includes(subtypeAction)) {
    throw httpError(400, 'VALIDATION_ERROR', `subtypeAction must be one of: confirmed, corrected, unsure, null.`);
  }
  if (subtypeAction === 'corrected') {
    if (!correctedSubtype) throw httpError(400, 'VALIDATION_ERROR', 'correctedSubtype is required.');
    if (!correctedTier) throw httpError(400, 'VALIDATION_ERROR', 'correctedTier is required.');
    if (!VALID_TIERS.includes(correctedTier)) throw httpError(400, 'VALIDATION_ERROR', `correctedTier must be malicious, grey_area, or legitimate.`);
  } else {
    if (correctedSubtype) throw httpError(400, 'VALIDATION_ERROR', 'correctedSubtype may only be set when subtypeAction is corrected.');
    if (correctedTier) throw httpError(400, 'VALIDATION_ERROR', 'correctedTier may only be set when subtypeAction is corrected.');
  }
}

async function finalizeAggregatedClassification(reportId, votes) {
  const result = computeAggregatedClassification(votes);
  const now = new Date();
  const isAllRejected =
    Array.isArray(votes) && votes.length >= DECISIVE_VOTES && votes.every((v) => v.decision === 'reject');

  const finalTier = isAllRejected ? 'legitimate' : result.tier;
  const updateDoc = {
    $set: {
      officerSubtypeAggregated: result.subtype,
      officerSubtypeAgreement: result.subtypeAgreement,
      officerTierAggregated: finalTier,
      officerTierAgreement: result.tierAgreement,
      officerSubtypeFinalizedAt: now,
    },
  };

  const ReportModel = mongoose.models.Report || mongoose.model('Report');
  const collection = ReportModel.collection;

  console.log('[finalize] ============================================');
  console.log('[finalize] CALLED for reportId:', reportId);
  console.log('[finalize] collection name:', collection.collectionName);
  console.log('[finalize] db name:', mongoose.connection.db?.databaseName);
  console.log('[finalize] votes count:', (votes || []).length);
  console.log('[finalize] computed result:', JSON.stringify(result));
  console.log('[finalize] writing updateDoc:', JSON.stringify(updateDoc, null, 2));

  let writeResult;
  try {
    writeResult = await collection.updateOne({ reportId }, updateDoc);
  } catch (writeErr) {
    console.error('[finalize] WRITE THREW:', writeErr.message);
    console.error('[finalize] stack:', writeErr.stack);
    throw writeErr;
  }

  console.log('[finalize] write result:', JSON.stringify({
    acknowledged: writeResult.acknowledged,
    matchedCount: writeResult.matchedCount,
    modifiedCount: writeResult.modifiedCount,
    upsertedId: writeResult.upsertedId,
  }));
  console.log('[finalize] ============================================');

  if (!writeResult.acknowledged || writeResult.matchedCount === 0) {
    throw httpError(500, 'FINALIZE_FAILED',
      `Could not finalize ${reportId} — write did not match any document in "${collection.collectionName}".`);
  }

  return { ...result, tier: finalTier, finalizedAt: now };
}

ReportSchema.statics.castVote = async function castVote(
  reportId,
  {
    userId, role = 'officer', decision, comment = '',
    subtypeAction = null, correctedSubtype = null, correctedTier = null,
    isHighValue = false, aiSubtypeAtVote = null, aiTierAtVote = null, aiSubtypeModelVersionAtVote = null,
  } = {}
) {
  if (!reportId || typeof reportId !== 'string') throw httpError(400, 'VALIDATION_ERROR', 'A valid reportId is required.');
  if (!userId || typeof userId !== 'string') throw httpError(400, 'VALIDATION_ERROR', 'A voter identity is required.');
  if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'VALIDATION_ERROR', "decision must be either 'approve' or 'reject'.");

  validateCorrectionPayload({ subtypeAction, correctedSubtype, correctedTier });

  const collection = mongoose.model('Report').collection;

  const vote = {
    userId, role, decision, comment: String(comment || '').trim().slice(0, 2000),
    votedAt: new Date(), editedAt: null,
    subtypeAction: subtypeAction || null,
    correctedSubtype: subtypeAction === 'corrected' ? correctedSubtype : null,
    correctedTier: subtypeAction === 'corrected' ? correctedTier : null,
    isHighValue: Boolean(isHighValue),
    aiSubtypeAtVote: aiSubtypeAtVote || null,
    aiTierAtVote: aiTierAtVote || null,
    aiSubtypeModelVersionAtVote: aiSubtypeModelVersionAtVote || null,
  };

  const pipeline = [
    { $set: { votes: { $concatArrays: [{ $ifNull: ['$votes', []] }, [{ $literal: vote }]] } } },
    {
      $set: {
        'consensusState.approvals': { $size: { $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.decision', 'approve'] } } } },
        'consensusState.rejections': { $size: { $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.decision', 'reject'] } } } },
        'consensusState.required': DECISIVE_VOTES,
      },
    },
    {
      $set: {
        status: {
          $switch: {
            branches: [
              { case: { $gte: ['$consensusState.approvals', DECISIVE_VOTES] }, then: 'blacklisted' },
              { case: { $gte: ['$consensusState.rejections', DECISIVE_VOTES] }, then: 'rejected' },
              { case: { $eq: ['$consensusState.approvals', 1] }, then: 'one_approval' },
            ],
            default: 'under_review',
          },
        },
      },
    },
    {
      $set: {
        resolvedAt: {
          $cond: [
            { $and: [ { $or: [ { $gte: ['$consensusState.approvals', DECISIVE_VOTES] }, { $gte: ['$consensusState.rejections', DECISIVE_VOTES] } ] }, { $eq: [{ $ifNull: ['$resolvedAt', null] }, null] } ] },
            '$$NOW', { $ifNull: ['$resolvedAt', null] }
          ],
        },
      },
    },
  ];

const result = await collection.findOneAndUpdate(
    { reportId, status: { $in: OPEN_STATUSES }, 'votes.userId': { $ne: userId } },
    pipeline, { returnDocument: 'after' }
  );

  const updated = unwrapFindOneAndUpdate(result);

  console.log('[castVote] ============================================');
  console.log('[castVote] reportId:', reportId);
  console.log('[castVote] updated is null?', updated === null);
  if (updated) {
    console.log('[castVote] updated.status:', updated.status);
    console.log('[castVote] updated.votes count:', (updated.votes || []).length);
    console.log('[castVote] RESOLVED_STATUSES:', RESOLVED_STATUSES);
    console.log('[castVote] should finalize?', RESOLVED_STATUSES.includes(updated.status));
  }
  console.log('[castVote] ============================================');

  if (updated) {
    if (RESOLVED_STATUSES.includes(updated.status)) {
      const agg = await finalizeAggregatedClassification(updated.reportId, updated.votes);
      updated.officerSubtypeAggregated = agg.subtype;
      updated.officerSubtypeAgreement = agg.subtypeAgreement;
      updated.officerTierAggregated = agg.tier;
      updated.officerTierAgreement = agg.tierAgreement;
      updated.officerSubtypeFinalizedAt = agg.finalizedAt;
    }
    return updated;
  }

  const existing = await collection.findOne({ reportId }, { projection: { status: 1, votes: 1 } });
  if (!existing) throw httpError(404, 'NOT_FOUND', 'Report not found.');
  if (!OPEN_STATUSES.includes(existing.status)) throw httpError(409, 'REPORT_FINALIZED', `Already finalized as "${existing.status}".`);
  if (Array.isArray(existing.votes) && existing.votes.some((v) => v.userId === userId)) throw httpError(409, 'DUPLICATE_VOTE', 'You have already voted.');

  throw httpError(409, 'VOTE_CONFLICT', 'The vote could not be recorded.');
};

ReportSchema.statics.changeVote = async function changeVote(
  reportId,
  {
    userId, decision, comment = '',
    subtypeAction = null, correctedSubtype = null, correctedTier = null,
    isHighValue = false, aiSubtypeAtVote = null, aiTierAtVote = null, aiSubtypeModelVersionAtVote = null,
  } = {}
) {
  if (!reportId || typeof reportId !== 'string') throw httpError(400, 'VALIDATION_ERROR', 'A valid reportId is required.');
  if (!userId || typeof userId !== 'string') throw httpError(400, 'VALIDATION_ERROR', 'A voter identity is required.');
  if (!['approve', 'reject'].includes(decision)) throw httpError(400, 'VALIDATION_ERROR', "decision must be either 'approve' or 'reject'.");

  validateCorrectionPayload({ subtypeAction, correctedSubtype, correctedTier });

  const collection = mongoose.model('Report').collection;
  const now = new Date();
  const nextComment = String(comment || '').trim().slice(0, 2000);

  const before = await collection.findOne({ reportId }, { projection: { status: 1, votes: 1, consensusState: 1 } });
  if (!before) throw httpError(404, 'NOT_FOUND', 'Report not found.');
  if (!OPEN_STATUSES.includes(before.status)) throw httpError(409, 'REPORT_FINALIZED', `Already finalized as "${before.status}".`);

  const existingVote = (before.votes || []).find((v) => v.userId === userId);
  if (!existingVote) throw httpError(409, 'NOT_VOTED_YET', 'You have not voted yet.');

  const previous = {
    decision: existingVote.decision,
    comment: existingVote.comment || '',
    votedAt: existingVote.votedAt || null,
    editedAt: existingVote.editedAt || null,
  };

  const pipeline = [
    {
      $set: {
        votes: {
          $map: {
            input: '$votes', as: 'v',
            in: {
              $cond: [
                { $eq: ['$$v.userId', userId] },
                {
                  $mergeObjects: [
                    '$$v',
                    {
                      decision, comment: nextComment, editedAt: now,
                      subtypeAction: subtypeAction || null,
                      correctedSubtype: subtypeAction === 'corrected' ? correctedSubtype : null,
                      correctedTier: subtypeAction === 'corrected' ? correctedTier : null,
                      isHighValue: Boolean(isHighValue),
                      aiSubtypeAtVote: aiSubtypeAtVote || null,
                      aiTierAtVote: aiTierAtVote || null,
                      aiSubtypeModelVersionAtVote: aiSubtypeModelVersionAtVote || null,
                    },
                  ],
                },
                '$$v',
              ],
            },
          },
        },
      },
    },
    {
      $set: {
        'consensusState.approvals': { $size: { $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.decision', 'approve'] } } } },
        'consensusState.rejections': { $size: { $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.decision', 'reject'] } } } },
        'consensusState.required': DECISIVE_VOTES,
      },
    },
    {
      $set: {
        status: {
          $switch: {
            branches: [
              { case: { $gte: ['$consensusState.approvals', DECISIVE_VOTES] }, then: 'blacklisted' },
              { case: { $gte: ['$consensusState.rejections', DECISIVE_VOTES] }, then: 'rejected' },
              { case: { $eq: ['$consensusState.approvals', 1] }, then: 'one_approval' },
            ],
            default: 'under_review',
          },
        },
      },
    },
    {
      $set: {
        resolvedAt: {
          $cond: [
            { $and: [ { $or: [ { $gte: ['$consensusState.approvals', DECISIVE_VOTES] }, { $gte: ['$consensusState.rejections', DECISIVE_VOTES] } ] }, { $eq: [{ $ifNull: ['$resolvedAt', null] }, null] } ] },
            '$$NOW', { $ifNull: ['$resolvedAt', null] }
          ],
        },
      },
    },
  ];

    const result = await collection.findOneAndUpdate(
    { reportId, status: { $in: OPEN_STATUSES }, 'votes.userId': userId },
    pipeline, { returnDocument: 'after' }
  );

  const updated = unwrapFindOneAndUpdate(result);

  console.log('[changeVote] ============================================');
  console.log('[changeVote] reportId:', reportId);
  console.log('[changeVote] updated is null?', updated === null);
  if (updated) {
    console.log('[changeVote] updated.status:', updated.status);
    console.log('[changeVote] updated.votes count:', (updated.votes || []).length);
    console.log('[changeVote] should finalize?', RESOLVED_STATUSES.includes(updated.status));
  }
  console.log('[changeVote] ============================================');

  if (updated) {
    if (RESOLVED_STATUSES.includes(updated.status)) {
      const agg = await finalizeAggregatedClassification(updated.reportId, updated.votes);
      updated.officerSubtypeAggregated = agg.subtype;
      updated.officerSubtypeAgreement = agg.subtypeAgreement;
      updated.officerTierAggregated = agg.tier;
      updated.officerTierAgreement = agg.tierAgreement;
      updated.officerSubtypeFinalizedAt = agg.finalizedAt;
    }
    return { updated, previous };
  }

  throw httpError(409, 'VOTE_CONFLICT', 'The report changed while your edit was being saved.');
};

ReportSchema.statics.applyWorkflowUpdate = async function applyWorkflowUpdate(reportId, { votes, consensusState, status }) {
  const allowedStatuses = ['pending', 'under_review', 'one_approval', 'two_approvals', 'blacklisted', 'approved', 'rejected'];
  if (status && !allowedStatuses.includes(status)) throw new Error(`Invalid status "${status}".`);
  const update = {};
  if (votes !== undefined) update.votes = votes;
  if (consensusState !== undefined) update.consensusState = consensusState;
  if (status !== undefined) {
    update.status = status;
    if (RESOLVED_STATUSES.includes(status)) update.resolvedAt = new Date();
  }
  if (Object.keys(update).length === 0) throw new Error('Requires at least one workflow field.');
  return mongoose.model('Report').collection.updateOne({ reportId }, { $set: update });
};

ReportSchema.statics.updateStatus = async function updateStatus(reportId, newStatus) {
  const allowed = ['pending', 'under_review', 'one_approval', 'two_approvals', 'blacklisted', 'approved', 'rejected'];
  if (!allowed.includes(newStatus)) throw new Error(`Invalid status "${newStatus}".`);
  const update = { status: newStatus };
  if (RESOLVED_STATUSES.includes(newStatus)) update.resolvedAt = new Date();
  return mongoose.model('Report').collection.updateOne({ reportId }, { $set: update });
};

// ─── Lazy repair: recompute aggregation for any resolved report that
//     is missing it (e.g. reports finalized before the write fix). ─
ReportSchema.statics.ensureFinalized = async function ensureFinalized(reportId) {
  const report = await this.findOne({ reportId }).lean();
  if (!report) return null;
  if (!RESOLVED_STATUSES.includes(report.status)) return report;
  if (report.officerTierAggregated && report.officerSubtypeAggregated) return report;

  console.log('[ensureFinalized] repairing', reportId, 'votes:', (report.votes || []).length);
  await finalizeAggregatedClassification(reportId, report.votes || []);
  return this.findOne({ reportId }).lean();
};

const ReportModel = mongoose.model('Report', ReportSchema);

ReportModel.OPEN_STATUSES = OPEN_STATUSES;
ReportModel.RESOLVED_STATUSES = RESOLVED_STATUSES;
ReportModel.CONSENSUS_REQUIRED = CONSENSUS_REQUIRED;
ReportModel.DECISIVE_VOTES = DECISIVE_VOTES;
ReportModel.computeAggregatedClassification = computeAggregatedClassification;

module.exports = ReportModel;