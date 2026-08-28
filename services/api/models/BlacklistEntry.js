const mongoose = require('mongoose');

const { Schema } = mongoose;

const VoteSchema = new Schema(
  {
    officerId: { type: String, required: true, trim: true },
    decision: { type: String, enum: ['approve', 'reject'], required: true },
    comment: { type: String, trim: true, maxlength: 500, default: '' },
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
      maxlength: 40,
      index: true,
    },

    region: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },

    status: {
      type: String,
      enum: ['pending', 'under_review', 'one_approval', 'blacklisted', 'rejected'],
      default: 'pending',
      index: true,
    },

    // Full vote log — one entry per distinct officer, enforced in registerVote().
    consensusVotes: {
      type: [VoteSchema],
      default: [],
    },

    // Distinct officer IDs whose vote is currently "approve" — kept in
    // sync automatically by registerVote(); this is the field the SRS's
    // Two-Officer Approval logic checks against a length-2 quorum.
    approvedBy: {
      type: [String],
      default: [],
    },

    blacklistedAt: {
      type: Date,
      default: null,
    },

    reportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Applies a single officer's vote to the Two-Officer Consensus State
 * Machine (see SRS Section 4.c):
 *   - A given officerId may vote exactly once per candidate; voting
 *     again is rejected outright (guards against accidental or
 *     malicious self-approval).
 *   - 2 distinct "approve" votes -> Blacklisted (and blacklistedAt is stamped).
 *   - 2 distinct "reject" votes  -> Rejected (terminal; no further votes accepted).
 *   - 1 distinct "approve" vote  -> OneApproval (awaiting a second officer).
 *   - Otherwise                  -> UnderReview.
 *
 * Throws an Error with .statusCode set on invalid transitions so route
 * handlers can translate it directly into an HTTP response.
 */
BlacklistEntrySchema.methods.registerVote = function registerVote(officerId, decision, comment) {
  if (!officerId || typeof officerId !== 'string') {
    const err = new Error('officerId is required to register a vote.');
    err.statusCode = 400;
    throw err;
  }

  if (!['approve', 'reject'].includes(decision)) {
    const err = new Error("decision must be either 'approve' or 'reject'.");
    err.statusCode = 400;
    throw err;
  }

  if (this.status === 'blacklisted' || this.status === 'rejected') {
    const err = new Error(`This candidate is already finalized as "${this.status}" and no longer accepts votes.`);
    err.statusCode = 409;
    throw err;
  }

  const alreadyVoted = this.consensusVotes.some((vote) => vote.officerId === officerId);
  if (alreadyVoted) {
    const err = new Error('This officer has already cast a vote on this candidate. A single officer cannot vote twice.');
    err.statusCode = 409;
    throw err;
  }

  this.consensusVotes.push({
    officerId,
    decision,
    comment: comment || '',
    votedAt: new Date(),
  });

  const distinctApprovals = [
    ...new Set(
      this.consensusVotes.filter((vote) => vote.decision === 'approve').map((vote) => vote.officerId)
    ),
  ];
  const distinctRejections = [
    ...new Set(
      this.consensusVotes.filter((vote) => vote.decision === 'reject').map((vote) => vote.officerId)
    ),
  ];

  this.approvedBy = distinctApprovals;

  if (distinctApprovals.length >= 2) {
    this.status = 'blacklisted';
    this.blacklistedAt = new Date();
  } else if (distinctRejections.length >= 2) {
    this.status = 'rejected';
  } else if (distinctApprovals.length === 1) {
    this.status = 'one_approval';
  } else {
    this.status = 'under_review';
  }

  return this;
};

module.exports = mongoose.model('BlacklistEntry', BlacklistEntrySchema);