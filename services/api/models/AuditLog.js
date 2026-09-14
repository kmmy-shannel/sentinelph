const mongoose = require('mongoose');

const { Schema } = mongoose;

const AuditLogSchema = new Schema(
  {
    userId: {
      type: String,
      required: [true, 'userId is required.'],
      trim: true,
      immutable: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['citizen', 'officer', 'analyst', 'auditor', 'admin', 'superadmin', 'system'],
      required: [true, 'role is required.'],
      immutable: true,
      index: true,
    },
    action: {
      type: String,
      required: [true, 'action is required.'],
      trim: true,
      maxlength: 120,
      immutable: true,
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 64,
      default: null,
      immutable: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: null,
      immutable: true,
    },
  },
  { versionKey: false }
);

AuditLogSchema.index({ timestamp: -1 });
AuditLogSchema.index({ 'metadata.category': 1 });
AuditLogSchema.index({ 'metadata.target': 1 });

AuditLogSchema.statics.record = async function record({ userId, role, action, ipAddress = null, metadata = null }) {
  return this.create({ userId, role, action, ipAddress, metadata });
};

function blockDirectMutation(next) {
  next(new Error('AuditLog entries are append-only. Update/delete operations are not permitted.'));
}

AuditLogSchema.pre('findOneAndUpdate', blockDirectMutation);
AuditLogSchema.pre('updateOne', blockDirectMutation);
AuditLogSchema.pre('updateMany', blockDirectMutation);
AuditLogSchema.pre('deleteOne', blockDirectMutation);
AuditLogSchema.pre('deleteMany', blockDirectMutation);
AuditLogSchema.pre('findOneAndDelete', blockDirectMutation);
AuditLogSchema.pre('findOneAndRemove', blockDirectMutation);

module.exports = mongoose.model('AuditLog', AuditLogSchema);