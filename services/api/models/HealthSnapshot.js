const mongoose = require('mongoose');
const { Schema } = mongoose;

const HealthSnapshotSchema = new Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  overall: { type: String, enum: ['operational', 'degraded'], required: true },
  servicesOperational: { type: Number, required: true },
  servicesTotal: { type: Number, required: true },
});

module.exports = mongoose.model('HealthSnapshot', HealthSnapshotSchema);