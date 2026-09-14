/**
 * seedWebUsers.js
 *
 * One-time bootstrap script that creates the initial superadmin and admin
 * accounts (Firebase Auth + MongoDB profile) so the Hierarchical
 * Invitation-Based Provisioning System has someone able to log in and
 * invite everyone else. NEVER run this in production — it halts
 * immediately if NODE_ENV === 'production'.
 *
 * Usage:
 *   node scripts/seedWebUsers.js
 */

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const { initFirebase } = require('../config/firebase');
const User = require('../models/User');

if (process.env.NODE_ENV === 'production') {
  console.error(
    '[seedWebUsers] Refusing to run: NODE_ENV=production. ' +
    'This script is for local/dev/staging bootstrap only.'
  );
  process.exit(1);
}

const REQUIRED_ENV_VARS = [
  'SEED_SUPERADMIN_EMAIL',
  'SEED_SUPERADMIN_PASS',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PASS',
  'MONGO_URI',
];

function assertRequiredEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[seedWebUsers] Missing required env var(s): ${missing.join(', ')}`);
    process.exit(1);
  }
}

/**
 * Fetches the Firebase Auth user by email, creating it if it doesn't
 * exist, and ensures it carries the correct role/jurisdiction custom
 * claims.
 */
async function fetchOrCreateFirebaseUser(admin, { email, password, fullName, role }) {
  let firebaseUser;

  try {
    firebaseUser = await admin.auth().getUserByEmail(email);
    console.log(`[seedWebUsers] Found existing Firebase user: ${email}`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') {
      throw err;
    }
    firebaseUser = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
    });
    console.log(`[seedWebUsers] Created new Firebase user: ${email}`);
  }

  await admin.auth().setCustomUserClaims(firebaseUser.uid, {
    role,
    jurisdiction: 'National / Regional',
  });

  return firebaseUser;
}

/**
 * Upserts the corresponding MongoDB profile with status: 'active', since
 * seeded accounts are trusted bootstrap accounts, not invited officers.
 */
async function upsertMongoProfile({ firebaseUid, email, fullName, role, badgeId, agency }) {
  const user = await User.findOneAndUpdate(
    { firebaseUid },
    {
      firebaseUid,
      email,
      fullName,
      role,
      badgeId,
      agency,
      jurisdiction: 'National / Regional',
      status: 'active',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`[seedWebUsers] Upserted MongoDB profile for ${email} (role: ${role}, status: active).`);
  return user;
}

async function run() {
  assertRequiredEnv();

  const admin = initFirebase();

  console.log('[seedWebUsers] Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || undefined,
  });
  console.log('[seedWebUsers] Connected.');

  const seedTargets = [
    {
      email: process.env.SEED_SUPERADMIN_EMAIL.trim().toLowerCase(),
      password: process.env.SEED_SUPERADMIN_PASS,
      fullName: 'SentinelPH Superadmin',
      role: 'superadmin',
      badgeId: 'SUPERADMIN-000',
      agency: 'SentinelPH Systems',
    },
    {
      email: process.env.SEED_ADMIN_EMAIL.trim().toLowerCase(),
      password: process.env.SEED_ADMIN_PASS,
      fullName: 'SentinelPH Admin',
      role: 'admin',
      badgeId: 'ADMIN-000',
      agency: 'SentinelPH Systems',
    },
  ];

  for (const target of seedTargets) {
    const firebaseUser = await fetchOrCreateFirebaseUser(admin, target);
    await upsertMongoProfile({
      firebaseUid: firebaseUser.uid,
      email: target.email,
      fullName: target.fullName,
      role: target.role,
      badgeId: target.badgeId,
      agency: target.agency,
    });
  }

  console.log('[seedWebUsers] Done.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('[seedWebUsers] Fatal error:', err);
  process.exit(1);
});