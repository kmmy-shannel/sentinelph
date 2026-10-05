const HealthSnapshot = require('../models/HealthSnapshot');
const User = require('../models/User');

async function captureHealthSnapshot() {
  let dbOk = false;
  const start = Date.now();
  try {
    await User.db.db.admin().ping();
    dbOk = true;
  } catch {}

  // Real measurement only for the DB; other services are placeholders.
  const servicesTotal = 6;
  const servicesOperational = dbOk ? 6 : 5;

  await HealthSnapshot.create({
    overall: dbOk ? 'operational' : 'degraded',
    servicesOperational,
    servicesTotal,
  });
}

module.exports = { captureHealthSnapshot };