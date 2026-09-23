// services/api/models/Report.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { computeHash } = require('../utils/hashChain');

const { Schema } = mongoose;

// Workflow status buckets shared by the vote pipeline, the review-queue
// listing, and the blacklist promotion logic.
const OPEN_STATUSES = ['pending', 'under_review', 'one_approval'];
const RESOLVED_STATUSES = ['blacklisted', 'approved', 'rejected'];
const CONSENSUS_REQUIRED = 2;

function httpError(statusCode, code, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

/**
 * The MongoDB driver's findOneAndUpdate returns the document directly in
 * driver v6+, but a `{ value, ok, lastErrorObject }` envelope in v4/v5.
 * Normalize both shapes to "document or null".
 */
function unwrapFindOneAndUpdate(result) {
  if (!result) return null;
  const isEnvelope =
    Object.prototype.hasOwnProperty.call(result, 'value') &&
    Object.prototype.hasOwnProperty.call(result, 'ok');
  return isEnvelope ? result.value || null : result;
}

/**
 * AiFlagSchema - Phase 4 AI Microservice Advisory Assessment
 * Stores the response metadata from the FastAPI AI Scam Detection
 * microservice. Captured in the canonical payload before hashing to
 * ensure auditability.
 *
 * Fields mirror the normalized `aiFlag` object produced by
 * services/api/utils/aiServiceClient.js.
 */
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

    // Layer-1 convenience fields (mirrors FastAPI PredictResponse)
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

    // OCR metadata
    ocrUsed: { type: Boolean, default: false },
    ocrText: { type: String, default: null },
    ocrExtractedChars: { type: Number, default: 0 },

    // Model provenance + guardrails
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
    // Mobile sends { latitude, longitude } — accept both naming conventions.
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
    required: { type: Number, default: 2 },
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

    // ---- Data_n fields (participate in the hash computation) ----
    // textData is NOT required: a citizen may submit a screenshot-only
    // report. The controller fills it from OCR when available and leaves
    // it null otherwise. All other immutable/hashed fields remain strict.
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

    // ---- Chain-linkage fields (immutable, hashed) ----
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

    // ---- Non-hashed display / workflow fields ----
    // These are NOT part of getCanonicalPayload(), so they can be added
    // without invalidating existing chain records.
    sender: { type: String, trim: true, maxlength: 40, default: null },
    scammerNumber: { type: String, trim: true, maxlength: 40, default: null },
    evidenceText: { type: String, trim: true, maxlength: 2000, default: null },
    content: { type: String, trim: true, maxlength: 2000, default: null },

    scamType: { type: String, trim: true, maxlength: 60, default: 'UNKNOWN' },
    category: { type: String, trim: true, maxlength: 60, default: 'UNKNOWN' },
    channel: { type: String, trim: true, maxlength: 20, default: 'SMS' },
    jurisdiction: { type: String, trim: true, maxlength: 60, default: 'PH' },

    evidenceFiles: { type: [String], default: [] },

    // Screenshot evidence — stored as a base64 data-URI so the officer
    // Review Queue can render it without a separate storage lookup.
    // Consider GridFS/S3 for production scale.
    evidenceImage: { type: String, default: null },
    hasEvidenceImage: { type: Boolean, default: false },

    // Chain metadata convenience copies (not hashed)
    nullifierHash: { type: String, trim: true, default: null },
    zkpHash: { type: String, trim: true, default: null },
    aiScore: { type: Number, min: 0, max: 1, default: null },

    // Pseudonymous reporter identifier: HMAC-SHA256(CITIZEN_SALT, uid || ip).
    // - NOT part of getCanonicalPayload(), so the hash chain is unaffected.
    // - Indexed so per-citizen rate limiting stays a cheap count query.
    // - select:false keeps it out of every default query result (officer
    //   queue, exports, audit views); it must be requested explicitly.
    citizenHash: {
      type: String,
      trim: true,
      index: true,
      immutable: true,
      select: false,
      default: null,
    },

    // ---- Workflow state ----
    // 'pending' → 'under_review' | 'one_approval' → 'blacklisted' | 'rejected'
    // 'approved' is retained as an alias for 'blacklisted' so the vote
    // route can map its decision without loss.
    status: {
      type: String,
      enum: [
        'pending',
        'under_review',
        'one_approval',
        'blacklisted',
        'approved',
        'rejected',
      ],
      default: 'pending',
    },

    votes: { type: [VoteSchema], default: [] },
    consensusState: { type: ConsensusSchema, default: () => ({}) },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// createdAt participates in the canonical hash payload, so it must never change.
ReportSchema.path('createdAt', { immutable: true });

// Compound index for workflow lookups
ReportSchema.index({ reportedNumber: 1, status: 1 });
ReportSchema.index({ status: 1, sequence: -1 });

/**
 * Rebuilds the exact object that was (or will be) hashed for this record.
 * Kept byte-for-byte identical to the previous version so existing chain
 * records continue to verify.
 */
ReportSchema.methods.getCanonicalPayload = function getCanonicalPayload() {
  // Return a plain, fully-detached object. Mongoose subdocuments
  // (location, aiFlag) carry internal `$__` pointers back to their
  // parent document; passing them straight into computeHash() causes
  // canonicalize() to walk that circular graph and blow the call
  // stack. `.toObject()` on each subdocument flattens it to a plain
  // object that hashes deterministically — the JSON produced is
  // identical to what the hash chain has always used, so existing
  // records continue to verify.
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
// Cryptographic integrity hook — runs only on creation.
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

// Write-once enforcement — block direct update/delete mutations.
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
 * CANONICAL VOTE ENTRY POINT (Two-Officer Consensus).
 *
 * Records one officer's vote on this report and recomputes the consensus
 * counters and workflow status in a SINGLE atomic update (an aggregation-
 * pipeline update, MongoDB 4.2+), so two officers voting at the same
 * instant can never overwrite each other's vote or leave counters/status
 * out of sync.
 *
 * Guards enforced inside the same atomic filter:
 *   - the report must still be open (pending / under_review / one_approval)
 *   - the officer must not already appear in `votes`
 *
 * Status rules (identical to the legacy BlacklistEntry state machine):
 *   approvals >= 2 -> 'blacklisted'
 *   rejections >= 2 -> 'rejected'
 *   approvals === 1 -> 'one_approval'
 *   otherwise       -> 'under_review'
 *
 * Returns the updated report document (plain object). Throws an Error
 * with .statusCode / .code on 400, 404 and 409 conditions.
 *
 * This bypasses Mongoose middleware on purpose (it is the sanctioned
 * exception to the append-only guard) and only ever touches the
 * workflow fields: votes, consensusState, status.
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

  // $literal is REQUIRED around the vote: inside an aggregation pipeline a
  // string beginning with "$" (e.g. an officer comment of "$100 scam") would
  // otherwise be parsed as a field path / expression.
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
              { case: { $gte: ['$consensusState.approvals', CONSENSUS_REQUIRED] }, then: 'blacklisted' },
              { case: { $gte: ['$consensusState.rejections', CONSENSUS_REQUIRED] }, then: 'rejected' },
              { case: { $eq: ['$consensusState.approvals', 1] }, then: 'one_approval' },
            ],
            default: 'under_review',
          },
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

  // No document matched — work out why so the caller gets a precise error.
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

/**
 * @deprecated Use Report.castVote(). This full-array overwrite is not
 * concurrency-safe (two simultaneous voters can clobber each other) and is
 * retained only for backward compatibility with older scripts.
 *
 * Sanctioned exception for Two-Officer workflow updates.
 * NOTE: This bypasses Mongoose middleware and writes directly to the
 * underlying collection — only workflow fields are allowed to change.
 */
ReportSchema.statics.applyWorkflowUpdate = async function applyWorkflowUpdate(
  reportId,
  { votes, consensusState, status }
) {
  const allowedStatuses = [
    'pending',
    'under_review',
    'one_approval',
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
  if (status !== undefined) update.status = status;

  if (Object.keys(update).length === 0) {
    throw new Error('applyWorkflowUpdate requires at least one workflow field to change.');
  }

  return mongoose.model('Report').collection.updateOne(
    { reportId },
    { $set: update }
  );
};

/**
 * Legacy sanctioned status-update path — kept for backward compatibility.
 */
ReportSchema.statics.updateStatus = async function updateStatus(reportId, newStatus) {
  const allowed = [
    'pending',
    'under_review',
    'one_approval',
    'blacklisted',
    'approved',
    'rejected',
  ];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status "${newStatus}". Allowed: ${allowed.join(', ')}`);
  }

  return mongoose.model('Report').collection.updateOne(
    { reportId },
    { $set: { status: newStatus } }
  );
};

const ReportModel = mongoose.model('Report', ReportSchema);

// Shared constants, exposed so controllers never re-declare the buckets.
ReportModel.OPEN_STATUSES = OPEN_STATUSES;
ReportModel.RESOLVED_STATUSES = RESOLVED_STATUSES;
ReportModel.CONSENSUS_REQUIRED = CONSENSUS_REQUIRED;

module.exports = ReportModel;