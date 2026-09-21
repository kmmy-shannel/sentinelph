// services/api/models/BlacklistEntry.js
'use strict';

const mongoose = require('mongoose');

const STATUS_VALUES = [
  'pending',
  'one_approval',
  'under_review',
  'blacklisted',
  'rejected',
];

const blacklistEntrySchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    region: {
      type: String,
      default: null,
      trim: true,
    },
    scamType: {
      type: String,
      default: 'UNKNOWN',
      trim: true,
    },
    status: {
      type: String,
      enum: STATUS_VALUES,
      default: 'pending',
      index: true,
    },
    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    approvingOfficers: {
      type: [String],
      default: [],
    },
    sourceReportIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Report',
      default: [],
    },
    hash: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: '',
      maxlength: 2000,
    },
    blacklistedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'blacklistentries',
  }
);

/**
 * Called as BlacklistEntry.upsertFromReport(updated) from
 * reportReviewController.js after a report hits 'blacklisted'.
 * Officer approvals are read from report.votes where decision === 'approve'.
 * Idempotent — safe to call repeatedly for the same report.
 */
blacklistEntrySchema.statics.upsertFromReport = async function (report) {
  if (!report || !report.reportedNumber) {
    throw new Error('upsertFromReport: report.reportedNumber is required');
  }

  const phoneNumber = String(report.reportedNumber).trim();

  const approvingOfficers = Array.isArray(report.votes)
    ? Array.from(
        new Set(
          report.votes
            .filter((v) => v && v.decision === 'approve' && v.userId)
            .map((v) => String(v.userId))
        )
      )
    : [];

  const ReportModel = mongoose.models.Report;
  let reportCount = 1;
  if (ReportModel) {
    try {
      reportCount = await ReportModel.countDocuments({ reportedNumber: phoneNumber });
    } catch (_) {
      // Non-fatal — leave reportCount at 1 if the count fails
    }
  }

  const now = new Date();

  const update = {
    $setOnInsert: {
      phoneNumber,
      region: report.region || null,
      scamType: report.scamType || 'UNKNOWN',
    },
    $set: {
      status: 'blacklisted',
      approvingOfficers,
      reportCount,
      blacklistedAt: now,
    },
  };

  const hash = report.hash || report.contentHash || null;
  if (hash) update.$set.hash = hash;
  if (report._id) update.$addToSet = { sourceReportIds: report._id };

  return this.findOneAndUpdate(
    { phoneNumber },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports =
  mongoose.models.BlacklistEntry ||
  mongoose.model('BlacklistEntry', blacklistEntrySchema);