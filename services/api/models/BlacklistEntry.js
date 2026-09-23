// services/api/models/BlacklistEntry.js
const mongoose = require('mongoose');
const crypto = require('crypto');

const { Schema } = mongoose;

const VOTE_DECISIONS = ['approve', 'reject'];
const STATUSES = ['pending', 'under_review', 'blacklisted', 'rejected'];
const APPROVALS_REQUIRED = 2;
const REJECTIONS_REQUIRED = 2;

const VoteSchema = new Schema(
  {
    officerId: { type: String, required: true },
    decision: { type: String, enum: VOTE_DECISIONS, required: true },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    votedAt: { type: Date, default: Date.now },
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
    region: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
      index: true,
    },
    votes: { type: [VoteSchema], default: [] },
    approvingOfficers: { type: [String], default: [] },
    reportCount: { type: Number, default: 0, min: 0 },
    blacklistedAt: { type: Date, default: null },
    hash: { type: String, trim: true, default: null },
    notes: { type: String, trim: true, maxlength: 2000, default: null },
  },
  {
    timestamps: true,
  }
);

BlacklistEntrySchema.methods.registerVote = function registerVote(
  officerId,
  decision,
  comment = ''
) {
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
    this.approvingOfficers = this.votes
      .filter((v) => v.decision === 'approve')
      .map((v) => v.officerId);
  } else if (rejections >= REJECTIONS_REQUIRED) {
    this.status = 'rejected';
  } else if (approvals === 1) {
    this.status = 'under_review';
  }

  if (this.status === 'blacklisted' || this.status === 'rejected') {
    const payload = JSON.stringify({
      phoneNumber: this.phoneNumber,
      status: this.status,
      approvingOfficers: this.approvingOfficers,
      reportCount: this.reportCount,
      finalizedAt: this.blacklistedAt,
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
    ? report.votes
        .filter((v) => v.decision === 'approve')
        .map((v) => v.userId)
        .filter(Boolean)
    : [];

  const reportCount = await this.db
    .model('Report')
    .countDocuments({ reportedNumber: phoneNumber });

  let entry = await this.findOne({ phoneNumber });

  if (!entry) {
    entry = new this({
      phoneNumber,
      region: report.jurisdiction || null,
      status: finalStatus,
      votes: (report.votes || []).map((v) => ({
        officerId: v.userId,
        decision: v.decision,
        comment: v.comment || '',
        votedAt: v.votedAt || new Date(),
      })),
      approvingOfficers,
      reportCount,
      blacklistedAt: finalStatus === 'blacklisted' ? new Date() : null,
    });
  } else {
    if (entry.status !== 'blacklisted' && entry.status !== 'rejected') {
      entry.status = finalStatus;
      entry.votes = (report.votes || []).map((v) => ({
        officerId: v.userId,
        decision: v.decision,
        comment: v.comment || '',
        votedAt: v.votedAt || new Date(),
      }));
      entry.approvingOfficers = approvingOfficers;
      entry.reportCount = reportCount;
      if (finalStatus === 'blacklisted' && !entry.blacklistedAt) {
        entry.blacklistedAt = new Date();
      }
    } else {
      entry.reportCount = reportCount;
    }
  }

  const payload = JSON.stringify({
    phoneNumber: entry.phoneNumber,
    status: entry.status,
    approvingOfficers: entry.approvingOfficers,
    reportCount: entry.reportCount,
    finalizedAt: entry.blacklistedAt,
  });
  entry.hash = crypto.createHash('sha256').update(payload).digest('hex');

  await entry.save();
  return entry;
};

BlacklistEntrySchema.index({ status: 1, updatedAt: -1 });
BlacklistEntrySchema.index({ phoneNumber: 1, status: 1 });

const BlacklistEntry =
  mongoose.models.BlacklistEntry ||
  mongoose.model('BlacklistEntry', BlacklistEntrySchema);

module.exports = BlacklistEntry;