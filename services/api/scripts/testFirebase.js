// services/api/scripts/testFirebase.js
require('dotenv').config();
const admin = require('firebase-admin');

console.log('=== Firebase Config Check ===');
console.log('PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);
console.log('CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('PRIVATE_KEY length:', process.env.FIREBASE_PRIVATE_KEY?.length);
console.log('PRIVATE_KEY starts with:', process.env.FIREBASE_PRIVATE_KEY?.substring(0, 40));
console.log('PRIVATE_KEY ends with:', process.env.FIREBASE_PRIVATE_KEY?.slice(-40));
console.log('Has literal \\n:', process.env.FIREBASE_PRIVATE_KEY?.includes('\\n'));
console.log('Has real newlines:', process.env.FIREBASE_PRIVATE_KEY?.includes('\n'));
console.log('');

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  console.log('✅ Firebase Admin initialized successfully.');

  const testToken = process.argv[2];
  if (testToken) {
    console.log('');
    console.log('Testing token verification...');
    admin.auth().verifyIdToken(testToken)
      .then((decoded) => {
        console.log('');
        console.log('✅ Token verified!');
        console.log('Decoded claims:', JSON.stringify(decoded, null, 2));
        process.exit(0);
      })
      .catch((err) => {
        console.error('');
        console.error('❌ Token verification failed:', err.message);
        process.exit(1);
      });
  } else {
    console.log('');
    console.log('No token provided — skipping token verification test.');
    console.log('To test a token: node scripts/testFirebase.js "<paste-token-here>"');
    process.exit(0);
  }
} catch (err) {
  console.error('');
  console.error('❌ Firebase Admin initialization failed:', err.message);
  console.error('Full error:', err);
  process.exit(1);
}