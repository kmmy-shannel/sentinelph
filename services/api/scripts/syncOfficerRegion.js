/**
 * Syncs an officer's region across Firebase custom claims AND the
 * MongoDB User document in one atomic operation.
 *
 * Usage:
 *   node scripts/syncOfficerRegion.js <email> "<Region Name>"
 *
 * Example:
 *   node scripts/syncOfficerRegion.js mendozagwenvictoria@gmail.com "Region I"
 */
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const admin = require('firebase-admin');
const mongoose = require('mongoose');
require('dotenv').config();

const { PH_REGIONS } = require('../../../shared/regions');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const [, , email, region] = process.argv;

if (!email || !region) {
  console.error('Usage: node scripts/syncOfficerRegion.js <email> "<Region Name>"');
  console.error(`Valid regions: ${PH_REGIONS.join(', ')}`);
  process.exit(1);
}

if (!PH_REGIONS.includes(region)) {
  console.error(`❌ "${region}" is not a valid region.`);
  console.error(`Valid regions: ${PH_REGIONS.join(', ')}`);
  process.exit(1);
}

(async () => {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Firebase custom claim
    const firebaseUser = await admin.auth().getUserByEmail(normalizedEmail);
    const existingClaims = firebaseUser.customClaims || {};
    await admin.auth().setCustomUserClaims(firebaseUser.uid, {
      ...existingClaims,
      jurisdiction: region,
    });
    console.log(`✅ Firebase claim updated: jurisdiction="${region}" for ${normalizedEmail}`);

    // 2. Mongo document
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME || 'sentinelph',
    });

    const result = await mongoose.connection
      .collection('users')
      .updateOne(
        { email: normalizedEmail },
        { $set: { jurisdiction: region } }
      );

    if (result.matchedCount === 0) {
      console.warn(`⚠️  No Mongo user doc found for ${normalizedEmail}. Firebase claim was still updated.`);
    } else {
      console.log(`✅ Mongo doc updated: jurisdiction="${region}"`);
    }

    console.log('⚠️  Officer must sign out and sign back in for the new claim to take effect.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();