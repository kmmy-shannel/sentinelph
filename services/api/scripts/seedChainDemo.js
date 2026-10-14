// services/api/scripts/seedChainDemo.js
//
// Seeds a small, verified Report chain for testing the Chain Integrity page.
//
//   • Creates N reports with sequence 1..N
//   • Block 1 links to the genesis hash (64 zeros or GENESIS_HASH)
//   • Block N links to the hash of block N-1
//   • Each block's hash is computed by the SAME computeHash() the live
//     application uses, so verification is guaranteed to pass
//
// Usage:
//   cd services/api
//   node scripts/seedChainDemo.js
//
// Optional env override:
//   SEED_CHAIN_COUNT=10 node scripts/seedChainDemo.js

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');
const crypto = require('crypto');
const Report = require('../models/Report');
const { computeHash } = require('../utils/hashChain');

// How many blocks to seed. Override with SEED_CHAIN_COUNT=N.
const SEED_COUNT = Math.max(
  1,
  parseInt(process.env.SEED_CHAIN_COUNT, 10) || 6
);

// Matches Report.js's genesis fallback exactly.
const GENESIS_HASH =
  process.env.GENESIS_HASH || '0'.repeat(64);

// Realistic-looking demo reports. The exact content doesn't matter for
// hash-chain verification — only the shape does — but keeping it
// realistic makes the ReviewQueue / Admin pages more useful too.
const DEMO_REPORTS = [
  {
    reportedNumber: 'SHOPEE-PROMO',
    sender: 'SHOPEE-PROMO',
    scamType: 'UNKNOWN',
    category: 'UNKNOWN',
    channel: 'SMS',
    aiLabel: 'grey_area',
    aiSubtype: 'brand_marketing',
    aiRiskLevel: 'MEDIUM',
    aiConfidence: 0.62,
    text: 'SHOPEE: 10.10 SALE! Up to 90% off your favorite brands. Shop now at shopee.ph.',
  },
  {
    reportedNumber: '+63-917-555-0192',
    sender: '+63-917-555-0192',
    scamType: 'UNKNOWN',
    category: 'UNKNOWN',
    channel: 'SMS',
    aiLabel: 'malicious',
    aiSubtype: 'phishing_link',
    aiRiskLevel: 'HIGH',
    aiConfidence: 0.94,
    text: 'GCash: Your account is suspended. Verify at gcash-secure.icu/login',
  },
  {
    reportedNumber: 'Globe',
    sender: 'Globe',
    scamType: 'UNKNOWN',
    category: 'UNKNOWN',
    channel: 'SMS',
    aiLabel: 'malicious',
    aiSubtype: 'fake_prize_lottery',
    aiRiskLevel: 'HIGH',
    aiConfidence: 0.97,
    text: 'Congratulations! You won P500,000. Claim at bit.ly/claim-prize now!',
  },
  {
    reportedNumber: 'BDO-ALERTS',
    sender: 'BDO-ALERTS',
    scamType: 'UNKNOWN',
    category: 'UNKNOWN',
    channel: 'SMS',
    aiLabel: 'legitimate',
    aiSubtype: 'bank_activity_alert',
    aiRiskLevel: 'LOW',
    aiConfidence: 0.91,
    text: 'Your BDO account was debited P1,500.00 on 11/01. If unauthorized, call 89100.',
  },
  {
    reportedNumber: 'CLINIC-REMINDER',
    sender: 'CLINIC-REMINDER',
    scamType: 'UNKNOWN',
    category: 'UNKNOWN',
    channel: 'SMS',
    aiLabel: 'legitimate',
    aiSubtype: 'appointment_reminder',
    aiRiskLevel: 'LOW',
    aiConfidence: 0.88,
    text: 'Reminder: Your appointment at Makati Med is on Nov 15, 2PM.',
  },
  {
    reportedNumber: 'LAZADA-SHIP',
    sender: 'LAZADA-SHIP',
    scamType: 'UNKNOWN',
    category: 'UNKNOWN',
    channel: 'SMS',
    aiLabel: 'legitimate',
    aiSubtype: 'delivery_tracking',
    aiRiskLevel: 'LOW',
    aiConfidence: 0.86,
    text: 'Your Lazada order #12345 is out for delivery today.',
  },
];

function pickDemo(i) {
  return DEMO_REPORTS[i % DEMO_REPORTS.length];
}

/**
 * Build the canonical payload that getCanonicalPayload() would produce
 * for a Report with the given fields. We do this BEFORE creating the
 * document, because we need the hash to be computed from the exact
 * same shape the model uses.
 */
function buildCanonicalPayload({
  reportId,
  textData,
  reportedNumber,
  location,
  nullifier,
  aiFlag,
  sequence,
  createdAt,
}) {
  return {
    reportId,
    textData,
    reportedNumber,
    location,
    nullifier,
    aiFlag,
    sequence,
    createdAt,
  };
}

async function seedChain() {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[seedChainDemo] Refusing to run: NODE_ENV=production. This is a DEV/DEMO seeder.'
    );
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error('[seedChainDemo] MONGO_URI is not set.');
    process.exit(1);
  }

  console.log('[seedChainDemo] Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB_NAME || undefined,
  });
  console.log('[seedChainDemo] Connected.');

  // ── Safety: refuse to seed if any report already exists ──────────
  const existing = await Report.countDocuments();
  if (existing > 0) {
    console.error(
      `[seedChainDemo] Refusing to run: ${existing} report(s) already exist. ` +
        `Wipe the collection first with:\n` +
        `  db.reports.deleteMany({})\n` +
        `  db.auditlogs.deleteMany({ 'metadata.category': 'Chain' })`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`[seedChainDemo] Seeding ${SEED_COUNT} block(s)…`);

  let previousHash = GENESIS_HASH;

  for (let i = 0; i < SEED_COUNT; i++) {
    const sequence = i + 1;
    const demo = pickDemo(i);
    const createdAt = new Date(Date.now() - (SEED_COUNT - i) * 3600_000); // 1 hour apart, oldest first

    const reportId = `SEED-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const nullifier = `seed-nullifier-${sequence}-${crypto.randomBytes(8).toString('hex')}`;

    const location = {
      address: null,
      region: 'Region I',
      lat: null,
      lng: null,
      latitude: null,
      longitude: null,
    };

    const aiFlag = {
      available: true,
      probabilityScore: demo.aiConfidence,
      label: demo.aiLabel,
      subtype: demo.aiSubtype,
      subtypeConfidence: demo.aiConfidence,
      subtypeModelVersion: 'passthrough',
      isScam: demo.aiLabel === 'malicious',
      confidenceScore: demo.aiConfidence,
      riskLevel: demo.aiRiskLevel,
      explanationReasons: [],
      ocrUsed: false,
      ocrText: null,
      ocrExtractedChars: 0,
      modelVersion: 'sentinelph-distilbert-3class-seed',
      advisoryOnly: true,
      checkedAt: createdAt,
      error: null,
    };

    // Build the exact shape getCanonicalPayload() returns.
    const canonicalPayload = buildCanonicalPayload({
      reportId,
      textData: demo.text,
      reportedNumber: demo.reportedNumber,
      location,
      nullifier,
      aiFlag,
      sequence,
      createdAt,
    });

    // Compute the hash using the SAME helper the live app uses.
    const hash = computeHash(canonicalPayload, previousHash);

    // Insert the document bypassing the immutability pre-save hook.
    // We use the raw collection because the pre('save') hook requires
    // `previousHash` and `sequence` to be set on `this` in a specific
    // order that only the app's own submission pipeline provides.
    await Report.collection.insertOne({
      reportId,
      textData: demo.text,
      reportedNumber: demo.reportedNumber,
      sender: demo.sender,
      scammerNumber: demo.sender,
      evidenceText: demo.text,
      content: demo.text,
      scamType: demo.scamType,
      category: demo.category,
      channel: demo.channel,
      jurisdiction: 'Region I',
      location,
      nullifier,
      aiFlag,
      sequence,
      previousHash,
      hash,
      status: 'pending',
      resolvedAt: null,
      votes: [],
      consensusState: { approvals: 0, rejections: 0, required: 3 },
      evidenceFiles: [],
      evidenceImage: null,
      hasEvidenceImage: false,
      nullifierHash: null,
      zkpHash: null,
      aiScore: demo.aiConfidence,
      citizenHash: null,
      reporterName: null,
      reporterEmail: null,
      reporterShared: false,
      officerAction: null,
      officerSubtype: null,
      officerLabel: null,
      officerId: null,
      officerVerifiedAt: null,
      isHighValue: false,
      officerSubtypeAggregated: null,
      officerSubtypeAgreement: 0,
      officerSubtypeFinalizedAt: null,
      createdAt,
    });

    console.log(
      `[seedChainDemo] ✓ #${sequence} ${reportId} · hash ${hash.slice(0, 12)}…`
    );

    previousHash = hash;
  }

  console.log('[seedChainDemo] Done.');
  console.log('');
  console.log('  Next steps:');
  console.log('  1. Reload /superadmin/chain-integrity — TOTAL BLOCKS should be', SEED_COUNT);
  console.log('  2. Click "Run Verification" — expect a green PASS banner.');
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
}

seedChain().catch((err) => {
  console.error('[seedChainDemo] Fatal:', err);
  process.exit(1);
});