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

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('Connected to MongoDB');

    const reports = await Report.find({ status: 'blacklisted' }).lean();
    console.log(`Found ${reports.length} blacklisted reports`);

    if (reports.length === 0) {
      console.log('Nothing to backfill.');
      return;
    }

    // Group by phone number — a number may have multiple blacklisted reports.
    const byNumber = new Map();
    for (const r of reports) {
      const phone = String(r.reportedNumber || '').trim();
      if (!phone) continue;
      if (!byNumber.has(phone)) byNumber.set(phone, []);
      byNumber.get(phone).push(r);
    }

    console.log(`Backfilling ${byNumber.size} unique phone numbers...`);

    for (const [phoneNumber, numberReports] of byNumber.entries()) {
      // Most recent blacklisted report is the canonical source.
      const canonical = numberReports.sort(
        (a, b) => new Date(b.resolvedAt || b.updatedAt || b.createdAt) -
                  new Date(a.resolvedAt || a.updatedAt || a.createdAt)
      )[0];

      const reportCount = await Report.countDocuments({ reportedNumber: phoneNumber });

      const voteSnapshot = numberReports.flatMap(r =>
        (r.votes || []).map(v => ({
          officerId: v.userId,
          decision: v.decision,
          comment: v.comment || '',
          votedAt: v.votedAt || new Date(),
        }))
      );

      const approvingOfficers = voteSnapshot
        .filter(v => v.decision === 'approve')
        .map(v => v.officerId)
        .filter(Boolean);

      const officerNotes = voteSnapshot
        .map(v => String(v.comment || '').trim())
        .filter(Boolean)
        .join(' · ')
        .slice(0, 2000) || null;

      const blacklistedAt = canonical.resolvedAt
        || canonical.updatedAt
        || canonical.createdAt
        || new Date();

      // ─── AI classification from the canonical report ────────────
      const ai = canonical.aiFlag || {};
      const aiLabel = ai.label || null;
      const aiSubtype = ai.subtype || null;
      const aiRiskLevel = ai.riskLevel || null;
      const aiConfidence =
        typeof ai.confidenceScore === 'number' ? ai.confidenceScore : null;
      // ────────────────────────────────────────────────────────────

      const result = await BlacklistEntry.findOneAndUpdate(
        { phoneNumber },
        {
          $set: {
            region: canonical.jurisdiction || null,
            status: 'blacklisted',
            votes: voteSnapshot,
            approvingOfficers,
            reportCount,
            notes: officerNotes,
            blacklistedAt,
            aiLabel,
            aiSubtype,
            aiRiskLevel,
            aiConfidence,
          },
          $setOnInsert: { phoneNumber },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log(
        `  ✓ ${phoneNumber}  (${reportCount} reports, ${voteSnapshot.length} votes, `
        + `ai=${aiLabel || '—'}/${aiSubtype || '—'})`
      );
    }

    // Re-stamp hashes for every blacklisted entry.
    const crypto = require('crypto');
    const entries = await BlacklistEntry.find({ status: 'blacklisted' });
    for (const entry of entries) {
      const payload = JSON.stringify({
        phoneNumber: entry.phoneNumber,
        status: entry.status,
        approvingOfficers: entry.approvingOfficers,
        reportCount: entry.reportCount,
        finalizedAt: entry.blacklistedAt,
      });
      entry.hash = crypto.createHash('sha256').update(payload).digest('hex');
      await entry.save();
    }

    console.log(`Stamped hashes on ${entries.length} entries.`);
    console.log('Done.');
  } catch (err) {
    console.error('Failed:', err.message);
    console.error(err.stack);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
})();