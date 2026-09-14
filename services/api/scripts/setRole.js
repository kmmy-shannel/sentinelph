/**
 * One-time admin script to assign Firebase custom claims to existing
 * users. Used to backfill roles for accounts created before the
 * bootstrap-citizen flow existed.
 *
 * Usage:
 *   node scripts/setRole.js citizen <email-or-uid>
 *   node scripts/setRole.js officer <email-or-uid> <jurisdiction>
 */
const admin = require('firebase-admin');
require('dotenv').config();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const VALID_ROLES = ['citizen', 'officer', 'analyst', 'auditor', 'admin', 'superadmin'];

const [, , role, identifier, jurisdiction] = process.argv;

if (!role || !identifier) {
  console.error('Usage: node setRole.js <role> <email-or-uid> [jurisdiction]');
  process.exit(1);
}
if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Valid: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

(async () => {
  try {
    const user = identifier.includes('@')
      ? await admin.auth().getUserByEmail(identifier)
      : await admin.auth().getUser(identifier);

    const claims = { role };
    if (jurisdiction) claims.jurisdiction = jurisdiction;

    await admin.auth().setCustomUserClaims(user.uid, claims);
    console.log(
      `✅ role=${role}${jurisdiction ? ` jurisdiction=${jurisdiction}` : ''} set for ${user.email || user.uid}`
    );
    console.log('⚠️  User must sign out and sign back in so the new ID token includes the claim.');
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  }
})();