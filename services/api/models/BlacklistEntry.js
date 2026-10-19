// services/api/models/BlacklistEntry.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

const VOTE_DECISIONS = ['approve', 'reject'];
const STATUSES = ['pending', 'under_review', 'blacklisted', 'rejected'];
const APPROVALS_REQUIRED = 2;
const REJECTIONS_REQUIRED = 2;

const VALID_TIERS = ['malicious', 'grey_area', 'legitimate'];

const VoteSchema = new Schema(
  {
    officerId: { type: String, required: true },
    decision: { type: String, enum: VOTE_DECISIONS, required: true },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    votedAt: { type: Date, default: Date.now },
    subtypeAction: { type: String, default: null },
    correctedSubtype: { type: String, default: null },
    correctedTier: { type: String, default: null },
    isHighValue: { type: Boolean, default: false },
  },
  { _id: false }
);

const BlacklistEntrySchema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: [true, 'phoneNumber is required.'],
      unique: true,
      trim: true,
      index: true,
    },
    region: { type: String, trim: true, default: null, index: true },
    status: { type: String, enum: STATUSES, default: 'pending', index: true },

    // ─── TARGET KIND (number vs brand) ─────────────────────────────
    targetKind: {
      type: String,
      enum: ['number', 'brand', null],
      default: 'number',
      index: true,
    },
    brandName: { type: String, trim: true, maxlength: 80, default: null, index: true },

    // ─── AI classification snapshot (as submitted) ─────────────────
    aiLabel: { type: String, trim: true, default: null, index: true },
    aiSubtype: { type: String, trim: true, default: null, index: true },
    aiRiskLevel: {
      type: String,
      enum: ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN', null],
      default: null,
    },
    aiConfidence: { type: Number, min: 0, max: 1, default: null },

    // ─── OFFICER FINAL CLASSIFICATION (source of truth after quorum) ─
    officerFinalTier: {
      type: String,
      enum: [...VALID_TIERS, null],
      default: null,
      index: true,
    },
    officerFinalSubtype: { type: String, default: null, index: true },
    officerFinalAgreement: { type: Number, default: 0 },
    officerFinalizedAt: { type: Date, default: null },
    // ────────────────────────────────────────────────────────────────

    votes: { type: [VoteSchema], default: [] },
    approvingOfficers: { type: [String], default: [] },
    reportCount: { type: Number, default: 0, min: 0 },
    blacklistedAt: { type: Date, default: null },
    hash: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: null },
  },
  { timestamps: true }
);

BlacklistEntrySchema.methods.registerVote = function registerVote(officerId, decision, comment = '') {
  if (!officerId || typeof officerId !== 'string') {
    const err = new Error('A valid officerId is required to vote.');
    err.statusCode = 400;
    throw err;
  }
  if (!VOTE_DECISIONS.includes(decision)) {
    const err = new Error("decision must be 'approve' or 'reject'.");
    err.statusCode = 400;
    throw err;
  }
  if (this.status === 'blacklisted' || this.status === 'rejected') {
    const err = new Error(`This candidate is already finalized as "${this.status}".`);
    err.statusCode = 409;
    throw err;
  }
  const alreadyVoted = (this.votes || []).some((v) => v.officerId === officerId);
  if (alreadyVoted) {
    const err = new Error('You have already voted on this candidate.');
    err.statusCode = 409;
    throw err;
  }

  this.votes.push({
    officerId,
    decision,
    comment: String(comment || '').trim().slice(0, 2000),
    votedAt: new Date(),
  });

  const approvals = this.votes.filter((v) => v.decision === 'approve').length;
  const rejections = this.votes.filter((v) => v.decision === 'reject').length;

  if (approvals >= APPROVALS_REQUIRED) {
    this.status = 'blacklisted';
    this.blacklistedAt = new Date();
    this.approvingOfficers = this.votes.filter((v) => v.decision === 'approve').map((v) => v.officerId);
  } else if (rejections >= REJECTIONS_REQUIRED) {
    this.status = 'rejected';
    this.approvingOfficers = this.votes.filter((v) => v.decision === 'reject').map((v) => v.officerId);
  } else if (approvals === 1) {
    this.status = 'under_review';
  }

  if (this.status === 'blacklisted' || this.status === 'rejected') {
    const payload = JSON.stringify({
      phoneNumber: this.phoneNumber,
      status: this.status,
      targetKind: this.targetKind || 'number',
      brandName: this.brandName || null,
      approvingOfficers: this.approvingOfficers,
      reportCount: this.reportCount,
      finalizedAt: this.blacklistedAt,
      officerFinalTier: this.officerFinalTier || null,
      officerFinalSubtype: this.officerFinalSubtype || null,
    });
    this.hash = crypto.createHash('sha256').update(payload).digest('hex');
  }

  return this;
};

BlacklistEntrySchema.statics.upsertFromReport = async function upsertFromReport(report) {
  if (!report || !report.reportedNumber) return null;

  const phoneNumber = String(report.reportedNumber).trim();
  if (!phoneNumber) return null;

  const finalStatus = report.status === 'blacklisted' ? 'blacklisted' : 'rejected';

  const approvingOfficers = Array.isArray(report.votes)
    ? report.votes.filter((v) => v.decision === 'approve').map((v) => v.userId).filter(Boolean)
    : [];

  const officerNotes = Array.isArray(report.votes)
    ? report.votes.map((v) => String(v.comment || '').trim()).filter(Boolean).join(' · ')
    : '';
  const notes = officerNotes.slice(0, 2000) || null;

  const reportCount = await this.db
    .model('Report')
    .countDocuments({ reportedNumber: phoneNumber });

  const voteSnapshot = (report.votes || []).map((v) => ({
    officerId: v.userId,
    decision: v.decision,
    comment: v.comment || '',
    votedAt: v.votedAt || new Date(),
    subtypeAction: v.subtypeAction || null,
    correctedSubtype: v.correctedSubtype || null,
    correctedTier: v.correctedTier || null,
    isHighValue: Boolean(v.isHighValue),
  }));

  const targetKind = report.targetKind === 'brand' ? 'brand' : 'number';
  const brandName = targetKind === 'brand' ? (report.brandName || null) : null;

  const ai = report.aiFlag || {};
  const aiLabel = ai.label || null;
  const aiSubtype = ai.subtype || null;
  const aiRiskLevel = ai.riskLevel || null;
  const aiConfidence = typeof ai.confidenceScore === 'number' ? ai.confidenceScore : null;

  // Officer final classification — this is what the registry should display.
  const officerFinalTier = report.officerTierAggregated || null;
  const officerFinalSubtype = report.officerSubtypeAggregated || null;
  const officerFinalAgreement = Math.max(
    report.officerTierAgreement || 0,
    report.officerSubtypeAgreement || 0
  );
  const officerFinalizedAt = report.officerSubtypeFinalizedAt || report.resolvedAt || null;

  let entry = await this.findOne({ phoneNumber });

  if (!entry) {
    entry = new this({
      phoneNumber,
      region: report.jurisdiction || null,
      status: finalStatus,
      targetKind,
      brandName,
      votes: voteSnapshot,
      approvingOfficers,
      reportCount,
      notes,
      blacklistedAt: finalStatus === 'blacklisted' ? new Date() : null,
      aiLabel,
      aiSubtype,
      aiRiskLevel,
      aiConfidence,
      officerFinalTier,
      officerFinalSubtype,
      officerFinalAgreement,
      officerFinalizedAt,
    });
  } else {
    if (entry.status !== 'blacklisted' && entry.status !== 'rejected') {
      entry.status = finalStatus;
      entry.votes = voteSnapshot;
      entry.approvingOfficers = approvingOfficers;
      entry.reportCount = reportCount;
      entry.notes = notes;
      entry.targetKind = targetKind;
      entry.brandName = brandName;
      entry.aiLabel = aiLabel;
      entry.aiSubtype = aiSubtype;
      entry.aiRiskLevel = aiRiskLevel;
      entry.aiConfidence = aiConfidence;
      entry.officerFinalTier = officerFinalTier;
      entry.officerFinalSubtype = officerFinalSubtype;
      entry.officerFinalAgreement = officerFinalAgreement;
      entry.officerFinalizedAt = officerFinalizedAt;
      if (finalStatus === 'blacklisted' && !entry.blacklistedAt) {
        entry.blacklistedAt = new Date();
      }
    } else {
      entry.reportCount = reportCount;
      if (!entry.targetKind) entry.targetKind = targetKind;
      if (!entry.brandName && brandName) entry.brandName = brandName;
      if (!entry.aiLabel && aiLabel) entry.aiLabel = aiLabel;
      if (!entry.aiSubtype && aiSubtype) entry.aiSubtype = aiSubtype;
      if (!entry.aiRiskLevel && aiRiskLevel) entry.aiRiskLevel = aiRiskLevel;
      if (entry.aiConfidence == null && aiConfidence != null) entry.aiConfidence = aiConfidence;
      if (!entry.notes && notes) entry.notes = notes;
      // Even on an already-finalized entry, backfill the officer fields
      // if they were missing (fixes rows finalized before this migration).
      if (!entry.officerFinalTier && officerFinalTier) entry.officerFinalTier = officerFinalTier;
      if (!entry.officerFinalSubtype && officerFinalSubtype) entry.officerFinalSubtype = officerFinalSubtype;
      if (!entry.officerFinalAgreement && officerFinalAgreement) entry.officerFinalAgreement = officerFinalAgreement;
      if (!entry.officerFinalizedAt && officerFinalizedAt) entry.officerFinalizedAt = officerFinalizedAt;
    }
  }

  const payload = JSON.stringify({
    phoneNumber: entry.phoneNumber,
    status: entry.status,
    targetKind: entry.targetKind || 'number',
    brandName: entry.brandName || null,
    approvingOfficers: entry.approvingOfficers,
    reportCount: entry.reportCount,
    finalizedAt: entry.blacklistedAt,
    officerFinalTier: entry.officerFinalTier || null,
    officerFinalSubtype: entry.officerFinalSubtype || null,
  });
  entry.hash = crypto.createHash('sha256').update(payload).digest('hex');

  await entry.save();
  return entry;
};

BlacklistEntrySchema.index({ status: 1, updatedAt: -1 });
BlacklistEntrySchema.index({ phoneNumber: 1, status: 1 });
BlacklistEntrySchema.index({ aiLabel: 1, status: 1 });
BlacklistEntrySchema.index({ officerFinalTier: 1, status: 1 });
BlacklistEntrySchema.index({ targetKind: 1, status: 1, blacklistedAt: -1 });
BlacklistEntrySchema.index({ targetKind: 1, region: 1, status: 1 });

const BlacklistEntry =
  mongoose.models.BlacklistEntry ||
  mongoose.model('BlacklistEntry', BlacklistEntrySchema);

module.exports = BlacklistEntry;