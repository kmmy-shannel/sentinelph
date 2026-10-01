const mongoose = require('mongoose');

// AI feedback is deliberately kept outside Report. Reports are hash-chained and
// immutable; an administrator's assessment is operational metadata, not a
// change to the citizen-submitted evidence.
const AdminAiReviewSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true, unique: true, index: true, trim: true },
    agency: { type: String, required: true, trim: true, index: true },
    jurisdiction: { type: String, default: null, trim: true },
    originalLabel: { type: String, default: 'unavailable', trim: true },
    selectedLabel: { type: String, required: true, trim: true, maxlength: 60 },
    reviewedBy: { type: String, required: true, trim: true, immutable: true },
    reviewedAt: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

AdminAiReviewSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function blockMutation(next) {
  next(new Error('AI review records are append-only.'));
});

module.exports = mongoose.models.AdminAiReview || mongoose.model('AdminAiReview', AdminAiReviewSchema);
