// services/api/scripts/backfillBlacklist.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const Report = require('../models/Report');
const BlacklistEntry = require('../models/BlacklistEntry');

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.error('MONGO_URI is missing. Check services/api/.env');
      process.exit(1);
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('Connected to MongoDB');

    const blacklisted = await Report.find({ status: 'blacklisted' }).lean();
    console.log(`Found ${blacklisted.length} blacklisted reports`);

    for (const r of blacklisted) {
      const exists = await BlacklistEntry.findOne({ phoneNumber: r.reportedNumber });
      if (!exists) {
        await BlacklistEntry.create({
          phoneNumber: r.reportedNumber,
          region: r.jurisdiction || null,
          status: 'blacklisted',
          reportCount: 1,
          blacklistedAt: new Date(),
        });
        console.log('Created entry for', r.reportedNumber);
      } else {
        console.log('Already exists:', r.reportedNumber);
      }
    }

    console.log('Done');
  } catch (err) {
    console.error('Failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();