const crypto = require('crypto');
const admin = require('firebase-admin');

let initialized = false;

function normalizePrivateKey(raw) {
  if (!raw) return undefined;

  let key = raw.trim();

  // 1. Strip wrapping quotes (common when copied from .env)
  key = key.replace(/^["']|["']$/g, '');

  // 2. Turn literal "\n" into real newlines
  key = key.replace(/\\n/g, '\n');

  // 3. If newlines were flattened into spaces, rebuild the PEM
  if (!key.includes('\n')) {
    const body = key
      .replace('-----BEGIN PRIVATE KEY-----', '')
      .replace('-----END PRIVATE KEY-----', '')
      .replace(/\s+/g, '');
    key =
      '-----BEGIN PRIVATE KEY-----\n' +
      body.match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----\n';
  }

  return key;
}

function initFirebase() {
  if (initialized) return admin;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin credentials are missing. Check FIREBASE_PROJECT_ID, ' +
      'FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
    );
  }

  // Fail loudly at startup instead of on the first request
  try {
    crypto.createPrivateKey(privateKey);
  } catch (e) {
    console.error('[Firebase] FIREBASE_PRIVATE_KEY is not a valid PEM key.', {
      length: privateKey.length,
      hasBegin: privateKey.includes('BEGIN PRIVATE KEY'),
      hasEnd: privateKey.includes('END PRIVATE KEY'),
      lineCount: privateKey.split('\n').length,
    });
    throw e;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }

  initialized = true;
  return admin;
}

module.exports = { initFirebase, admin };