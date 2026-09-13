/**
 * Debug helper — dumps the last N reports with their region fields.
 * Usage: node scripts/checkRegions.js
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
require('dotenv').config();

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || 'sentinelph',
  });

  const reports = await mongoose.connection
    .collection('reports')
    .find({})
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  console.log(`\n=== Last ${reports.length} reports ===\n`);
  reports.forEach((r) => {
    console.log(`Report: ${r.reportId}  (${r.createdAt?.toISOString()})`);
    console.log(`  sender:      ${r.sender || '(none)'}`);
    console.log(`  location:    ${JSON.stringify(r.location)}`);
    console.log(`  jurisdiction: ${r.jurisdiction}`);
    console.log('');
  });

  await mongoose.disconnect();
  process.exit(0);
})();