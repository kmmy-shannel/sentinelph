// services/api/models/Report.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { computeHash } = require('../utils/hashChain');

const { Schema } = mongoose;

const OPEN_STATUSES = ['pending', 'under_review', 'one_approval', 'two_approvals'];
const RESOLVED_STATUSES = ['blacklisted', 'approved', 'rejected'];
const CONSENSUS_REQUIRED = 3;

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

const AiFlagSchema = new Schema(
  {
    available: { type: Boolean, default: false },
    probabilityScore: { type: Number, min: 0, max: 1, default: null },
    label: {
      type: String,
     enum: [
    'legitimate', 'grey_area', 'malicious',
    'likely_scam', 'uncertain', 'likely_legitimate',
    'unavailable',
  ],
      default: 'unavailable',
    },
    isScam: { type: Boolean, default: null },
    confidenceScore: { type: Number, min: 0, max: 1, default: null },
    riskLevel: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    explanationReasons: {
      type: [
        new Schema(
          {
            category: { type: String, default: '' },
            description: { type: String, default: '' },
          },
          { _id: false }
        ),
      ],
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
  },
  { _id: false }
);

const ConsensusSchema = new Schema(
  {
    approvals: { type: Number, default: 0 },
    rejections: { type: Number, default: 0 },
    required: { type: Number, default: 3 },
  },
  { _id: false }
);

const ReportSchema = new Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      default: () => uuidv4(),
      immutable: true,
    },
    textData: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
      default: null,
      immutable: true,
    },
    reportedNumber: {
      type: String,
      required: [true, 'reportedNumber (the scam number/sender being reported) is required.'],
      trim: true,
      maxlength: 40,
      immutable: true,
    },
    location: {
      type: LocationSchema,
      default: () => ({}),
      immutable: true,
    },
    nullifier: {
      type: String,
      required: [true, 'nullifier is required (ZKP one-time-reporter proof).'],
      unique: true,
      trim: true,
      immutable: true,
    },
    aiFlag: {
      type: AiFlagSchema,
      default: () => ({}),
      immutable: true,
    },
    sequence: {
      type: Number,
      required: true,
      unique: true,
      immutable: true,
    },
    previousHash: {
      type: String,
      required: true,
      immutable: true,
    },
    hash: {
      type: String,
      unique: true,
      immutable: true,
    },

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

    citizenHash: {
      type: String,
      trim: true,
      index: true,
      immutable: true,
      select: false,
      default: null,
    },

    // 'pending' → 'under_review' → 'one_approval' → 'two_approvals' → terminal
    status: {
      type: String,
      enum: [
        'pending',
        'under_review',
        'one_approval',
        'two_approvals',
        'blacklisted',
        'approved',
        'rejected',
      ],
      default: 'pending',
    },

    resolvedAt: { type: Date, default: null },

    votes: { type: [VoteSchema], default: [] },
    consensusState: { type: ConsensusSchema, default: () => ({}) },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

ReportSchema.path('createdAt', { immutable: true });

ReportSchema.index({ reportedNumber: 1, status: 1 });
ReportSchema.index({ status: 1, sequence: -1 });
ReportSchema.index({ status: 1, resolvedAt: -1 });

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
  if (!this.isNew) {
    return next(
      new Error(
        'Report documents are immutable and cannot be modified after creation. ' +
          'Use Report.castVote() or Report.collection.updateOne() for ' +
          'sanctioned workflow-field changes.'
      )
    );
  }

  if (!this.previousHash) {
    return next(new Error('previousHash must be set (from the chain tail) before saving a Report.'));
  }

  if (typeof this.sequence !== 'number') {
    return next(new Error('sequence must be set before saving a Report.'));
  }

  if (!this.createdAt) {
    this.createdAt = new Date();
  }

  try {
    this.hash = computeHash(this.getCanonicalPayload(), this.previousHash);
    return next();
  } catch (err) {
    return next(err);
  }
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

/**
 * CANONICAL VOTE ENTRY POINT — 3-Officer Consensus (majority 2-of-3)
 *
 * ALL 3 officers must vote. The majority decides:
 *   2+ approvals  → 'blacklisted'
 *   2+ rejections → 'rejected'
 *
 * Intermediate states (fewer than 3 votes cast):
 *   2 approvals → 'two_approvals'
 *   1 approval  → 'one_approval'
 *   otherwise   → 'under_review'
 *
 * The 3rd officer is the FINALIZER — the case can't close before
 * all 3 votes are in. Stamps `resolvedAt` on the FIRST terminal transition.
 */
ReportSchema.statics.castVote = async function castVote(
  reportId,
  { userId, role = 'officer', decision, comment = '' } = {}
) {
  if (!reportId || typeof reportId !== 'string') {
    throw httpError(400, 'VALIDATION_ERROR', 'A valid reportId is required to vote.');
  }
  if (!userId || typeof userId !== 'string') {
    throw httpError(400, 'VALIDATION_ERROR', 'A voter identity is required to register a vote.');
  }
  if (!['approve', 'reject'].includes(decision)) {
    throw httpError(400, 'VALIDATION_ERROR', "decision must be either 'approve' or 'reject'.");
  }

  const collection = mongoose.model('Report').collection;

  const vote = {
    userId,
    role,
    decision,
    comment: String(comment || '').trim().slice(0, 2000),
    votedAt: new Date(),
  };

  const pipeline = [
    {
      $set: {
        votes: {
          $concatArrays: [{ $ifNull: ['$votes', []] }, [{ $literal: vote }]],
        },
      },
    },
    {
      $set: {
        'consensusState.approvals': {
          $size: {
            $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.decision', 'approve'] } },
          },
        },
        'consensusState.rejections': {
          $size: {
            $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.decision', 'reject'] } },
          },
        },
        'consensusState.required': CONSENSUS_REQUIRED,
      },
    },
    {
      $set: {
        status: {
          $switch: {
            branches: [
              // ── Finalized ONLY when all 3 have voted AND majority agrees ──
              {
                case: {
                  $and: [
                    { $gte: [{ $size: '$votes' }, 3] },
                    { $gte: ['$consensusState.approvals', 2] },
                  ],
                },
                then: 'blacklisted',
              },
              {
                case: {
                  $and: [
                    { $gte: [{ $size: '$votes' }, 3] },
                    { $gte: ['$consensusState.rejections', 2] },
                  ],
                },
                then: 'rejected',
              },
              // ── Intermediate states (still waiting for the 3rd vote) ──
              { case: { $eq: ['$consensusState.approvals', 2] }, then: 'two_approvals' },
              { case: { $eq: ['$consensusState.approvals', 1] }, then: 'one_approval' },
            ],
            default: 'under_review',
          },
        },
      },
    },
    {
      // Stamp resolvedAt only on the FIRST transition to terminal.
      $set: {
        resolvedAt: {
          $cond: [
            {
              $and: [
                { $gte: [{ $size: '$votes' }, 3] },
                {
                  $or: [
                    { $gte: ['$consensusState.approvals', 2] },
                    { $gte: ['$consensusState.rejections', 2] },
                  ],
                },
                { $eq: [{ $ifNull: ['$resolvedAt', null] }, null] },
              ],
            },
            '$$NOW',
            { $ifNull: ['$resolvedAt', null] },
          ],
        },
      },
    },
  ];

  const result = await collection.findOneAndUpdate(
    {
      reportId,
      status: { $in: OPEN_STATUSES },
      'votes.userId': { $ne: userId },
    },
    pipeline,
    { returnDocument: 'after' }
  );

  const updated = unwrapFindOneAndUpdate(result);
  if (updated) return updated;

  const existing = await collection.findOne(
    { reportId },
    { projection: { status: 1, votes: 1 } }
  );

  if (!existing) {
    throw httpError(404, 'NOT_FOUND', 'Report not found.');
  }
  if (!OPEN_STATUSES.includes(existing.status)) {
    throw httpError(
      409,
      'REPORT_FINALIZED',
      `This report is already finalized as "${existing.status}" and no longer accepts votes.`
    );
  }
  if (Array.isArray(existing.votes) && existing.votes.some((v) => v.userId === userId)) {
    throw httpError(
      409,
      'DUPLICATE_VOTE',
      'You have already voted on this report. A single officer cannot vote twice.'
    );
  }

  throw httpError(409, 'VOTE_CONFLICT', 'The vote could not be recorded. Please refresh and try again.');
};

ReportSchema.statics.applyWorkflowUpdate = async function applyWorkflowUpdate(
  reportId,
  { votes, consensusState, status }
) {
  const allowedStatuses = [
    'pending',
    'under_review',
    'one_approval',
    'two_approvals',
    'blacklisted',
    'approved',
    'rejected',
  ];
  if (status && !allowedStatuses.includes(status)) {
    throw new Error(`Invalid status "${status}". Allowed: ${allowedStatuses.join(', ')}`);
  }

  const update = {};
  if (votes !== undefined) update.votes = votes;
  if (consensusState !== undefined) update.consensusState = consensusState;
  if (status !== undefined) {
    update.status = status;
    if (RESOLVED_STATUSES.includes(status)) {
      update.resolvedAt = new Date();
    }
  }

  if (Object.keys(update).length === 0) {
    throw new Error('applyWorkflowUpdate requires at least one workflow field to change.');
  }

  return mongoose.model('Report').collection.updateOne(
    { reportId },
    { $set: update }
  );
};

ReportSchema.statics.updateStatus = async function updateStatus(reportId, newStatus) {
  const allowed = [
    'pending',
    'under_review',
    'one_approval',
    'two_approvals',
    'blacklisted',
    'approved',
    'rejected',
  ];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status "${newStatus}". Allowed: ${allowed.join(', ')}`);
  }

  const update = { status: newStatus };
  if (RESOLVED_STATUSES.includes(newStatus)) {
    update.resolvedAt = new Date();
  }

  return mongoose.model('Report').collection.updateOne(
    { reportId },
    { $set: update }
  );
};

const ReportModel = mongoose.model('Report', ReportSchema);

ReportModel.OPEN_STATUSES = OPEN_STATUSES;
ReportModel.RESOLVED_STATUSES = RESOLVED_STATUSES;
ReportModel.CONSENSUS_REQUIRED = CONSENSUS_REQUIRED;

module.exports = ReportModel;