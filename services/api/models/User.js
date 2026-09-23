const mongoose = require('mongoose');

const { Schema } = mongoose;

const USER_ROLES = ['citizen', 'officer', 'admin', 'superadmin'];
const USER_STATUSES = ['active', 'pending_activation', 'suspended'];

const userSchema = new Schema(
  {
    firebaseUid: {
      type: String,
      required: [true, 'firebaseUid is required.'],
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'email is required.'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'fullName is required.'],
      trim: true,
    },
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: `role must be one of: ${USER_ROLES.join(', ')}`,
      },
      default: 'officer',
    },
    badgeId: {
      type: String,
      required: [true, 'badgeId is required.'],
      trim: true,
    },
    agency: {
      type: String,
      required: [true, 'agency is required.'],
      trim: true,
    },
    jurisdiction: {
      type: String,
      default: 'National / Regional',
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: USER_STATUSES,
        message: `status must be one of: ${USER_STATUSES.join(', ')}`,
      },
      default: 'pending_activation',
      index: true,
    },
    lastSeenAuditLog: {
      type: Date,
      default: null,
    },
    lastSeenBlacklist: {
      type: Date,
      default: null,
    },
    lastSeenAllTab: {
      type: Date,
      default: null,
    },
    lastSeenResolvedTab: {
      type: Date,
      default: null,
    },
    lastSeenVotedTab: {
      type: Date,
      default: null,
    },
    lastSeenNotifications: {
      type: Date,
      default: null,
    },
    readNotificationIds: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    firebaseUid: this.firebaseUid,
    email: this.email,
    fullName: this.fullName,
    role: this.role,
    badgeId: this.badgeId,
    agency: this.agency,
    jurisdiction: this.jurisdiction,
    status: this.status,
    lastSeenAuditLog: this.lastSeenAuditLog,
    lastSeenBlacklist: this.lastSeenBlacklist,
    lastSeenAllTab: this.lastSeenAllTab,
    lastSeenResolvedTab: this.lastSeenResolvedTab,
    lastSeenVotedTab: this.lastSeenVotedTab,
    lastSeenNotifications: this.lastSeenNotifications,
    readNotificationIds: this.readNotificationIds,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
module.exports.USER_ROLES = USER_ROLES;
module.exports.USER_STATUSES = USER_STATUSES;