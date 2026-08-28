const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { computeHash } = require('../utils/hashChain');

const { Schema } = mongoose;

/**
 * AiFlagSchema - Phase 4 AI Microservice Advisory Assessment
 * Stores the response metadata from the FastAPI AI Scam Detection microservice.
 * Captured in canonical payload before hashing to ensure auditability.
 */
const AiFlagSchema = new Schema(
  {
    // Whether the AI service responded successfully for this report.
    available: {
      type: Boolean,
      default: false,
    },

    // Model-estimated probability (0.0-1.0) that the report content is scam-like.
    probabilityScore: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    // Categorical triage label derived from probabilityScore via fixed thresholds
    label: {
      type: String,
      enum: ['likely_scam', 'uncertain', 'likely_legitimate', 'unavailable'],
      default: 'unavailable',
    },

    // Whether OCR was performed on an attached screenshot
    ocrUsed: {
      type: Boolean,
      default: false,
    },

    // Which trained model produced this assessment (training run_id)
    modelVersion: {
      type: String,
      default: null,
    },

    // Hardcoded guardrail flag confirming this is advisory-only output
    advisoryOnly: {
      type: Boolean,
      default: true,
    },

    // Timestamp of when the AI assessment was made (or attempted)
    checkedAt: {
      type: Date,
      default: null,
    },

    // Machine-readable error code when available=false (e.g. 'TIMEOUT' | 'MODEL_NOT_TRAINED')
    error: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const LocationSchema = new Schema(
  {
    address: { type: String, trim: true, maxlength: 300, default: null },
    region: { type: String, trim: true, maxlength: 120, default: null },
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
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
    textData: {
      type: String,
      required: [true, 'textData is required.'],
      trim: true,
      minlength: 1,
      maxlength: 2000,
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

    // ---- Chain-linkage fields ----
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

    // ---- Workflow state ----
    status: {
      type: String,
      enum: ['pending', 'under_review', 'one_approval', 'blacklisted', 'rejected'],
      default: 'pending',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// createdAt participates in the canonical hash payload, so it must never change.
ReportSchema.path('createdAt', { immutable: true });

// Compound index for workflow lookups
ReportSchema.index({ reportedNumber: 1, status: 1 });

/**
 * Rebuilds the exact object that was (or will be) hashed for this record.
 * Used both by the pre-save hook at creation time and by the chain
 * verification utility when re-checking historical records.
 */
ReportSchema.methods.getCanonicalPayload = function getCanonicalPayload() {
  return {
    reportId: this.reportId,
    textData: this.textData,
    reportedNumber: this.reportedNumber,
    location: this.location,
    nullifier: this.nullifier,
    aiFlag: this.aiFlag,
    sequence: this.sequence,
    createdAt: this.createdAt,
  };
};

// Cryptographic integrity hook
ReportSchema.pre('save', function preSaveHashChain(next) {
  if (!this.isNew) {
    return next(new Error('Report documents are immutable and cannot be modified after creation.'));
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

// Write-once enforcement
function blockDirectMutation(next) {
  next(new Error('Report documents are append-only. Direct update/delete operations are not permitted.'));
}

ReportSchema.pre('findOneAndUpdate', blockDirectMutation);
ReportSchema.pre('updateMany', blockDirectMutation);
ReportSchema.pre('deleteOne', blockDirectMutation);
ReportSchema.pre('deleteMany', blockDirectMutation);
ReportSchema.pre('findOneAndDelete', blockDirectMutation);
ReportSchema.pre('findOneAndRemove', blockDirectMutation);

/**
 * Sanctioned exception for Two-Officer status updates.
 */
ReportSchema.statics.updateStatus = async function updateStatus(reportId, newStatus) {
  const allowed = ['pending', 'under_review', 'one_approval', 'blacklisted', 'rejected'];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid status "${newStatus}". Allowed: ${allowed.join(', ')}`);
  }

  return mongoose.model('Report').collection.updateOne(
    { reportId },
    { $set: { status: newStatus } }
  );
};

module.exports = mongoose.model('Report', ReportSchema);