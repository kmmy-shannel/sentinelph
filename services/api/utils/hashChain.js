const crypto = require('crypto');

/**
 * Recursively normalizes a value into a deterministic, hashable shape:
 * - Dates become ISO-8601 strings.
 * - Mongoose ObjectIds (or anything exposing toHexString) become hex strings.
 * - Arrays keep their order (order is semantically meaningful).
 * - Plain objects have their keys sorted alphabetically, and Mongoose's
 *   internal `_id` / `__v` bookkeeping fields are stripped so that the
 *   same logical data always canonicalizes identically regardless of
 *   whether it came from a fresh in-memory document or a `.lean()` read.
 */
function canonicalize(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value.toHexString === 'function') {
    // Mongoose ObjectId
    return value.toHexString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value)
      .filter((key) => key !== '_id' && key !== '__v')
      .sort();

    const out = {};
    sortedKeys.forEach((key) => {
      out[key] = canonicalize(value[key]);
    });
    return out;
  }

  return value;
}

/** Produces the deterministic JSON string used as hashing input. */
function canonicalizeToString(payload) {
  return JSON.stringify(canonicalize(payload));
}

/**
 * Computes H_n = SHA-256(canonicalize(Data_n) || H_{n-1}).
 * @param {object} payload - The immutable data fields of the record (Data_n).
 * @param {string} previousHash - H_{n-1}, the hash of the prior record in the chain.
 * @returns {string} The resulting hex-encoded SHA-256 digest (H_n).
 */
function computeHash(payload, previousHash) {
  if (typeof previousHash !== 'string' || previousHash.length === 0) {
    throw new Error('computeHash() requires a non-empty previousHash string.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('computeHash() requires a payload object.');
  }

  const canonicalString = canonicalizeToString(payload);

  return crypto
    .createHash('sha256')
    .update(canonicalString + previousHash)
    .digest('hex');
}

/**
 * Returns the genesis hash used for the very first record in any chain.
 * Configurable via GENESIS_HASH env var; defaults to 64 zero characters.
 */
function getGenesisHash() {
  return process.env.GENESIS_HASH || '0'.repeat(64);
}

/**
 * Walks an ordered list of chain entries and verifies:
 *   1. Each entry's declared previousHash matches the actual hash of
 *      the entry immediately before it in the sequence.
 *   2. Each entry's stored hash matches a fresh recomputation of
 *      SHA-256(canonicalPayload || previousHash).
 *
 * @param {Array<{id: string, sequence: number, previousHash: string, hash: string, canonicalPayload: object}>} entries
 * @returns {{valid: boolean, totalChecked: number, breaks: Array<object>}}
 */
function verifyChainRange(entries) {
  const breaks = [];
  let expectedPreviousHash = null;

  entries.forEach((entry, index) => {
    if (index === 0) {
      // The first entry in *this range* is trusted to declare the hash
      // it links back to (it may not be record 0 of the full chain if
      // a partial range was requested).
      expectedPreviousHash = entry.previousHash;
    }

    if (entry.previousHash !== expectedPreviousHash) {
      breaks.push({
        sequence: entry.sequence,
        id: entry.id,
        reason: 'PREVIOUS_HASH_MISMATCH',
        expected: expectedPreviousHash,
        found: entry.previousHash,
      });
    }

    let recomputedHash;
    try {
      recomputedHash = computeHash(entry.canonicalPayload, entry.previousHash);
    } catch (err) {
      breaks.push({
        sequence: entry.sequence,
        id: entry.id,
        reason: 'RECOMPUTE_FAILED',
        detail: err.message,
      });
      expectedPreviousHash = entry.hash;
      return;
    }

    if (recomputedHash !== entry.hash) {
      breaks.push({
        sequence: entry.sequence,
        id: entry.id,
        reason: 'HASH_MISMATCH',
        expected: recomputedHash,
        found: entry.hash,
      });
    }

    expectedPreviousHash = entry.hash;
  });

  return {
    valid: breaks.length === 0,
    totalChecked: entries.length,
    breaks,
  };
}

/**
 * High-level helper: pulls Report documents from the given Mongoose model
 * (optionally scoped to a sequence range), rebuilds each one's canonical
 * payload, and runs verifyChainRange() over them. The Report model is
 * passed in as a parameter (rather than required directly) to avoid a
 * circular dependency between this utility and models/Report.js, and so
 * this helper can be reused by both the reports and auditor route modules.
 *
 * @param {import('mongoose').Model} ReportModel
 * @param {{startSequence?: number, endSequence?: number}} [options]
 */
async function verifyReportChain(ReportModel, options = {}) {
  const { startSequence, endSequence } = options;

  const query = {};
  if (typeof startSequence === 'number' || typeof endSequence === 'number') {
    query.sequence = {};
    if (typeof startSequence === 'number') query.sequence.$gte = startSequence;
    if (typeof endSequence === 'number') query.sequence.$lte = endSequence;
  }

  const docs = await ReportModel.find(query).sort({ sequence: 1 }).lean();

  const entries = docs.map((doc) => ({
    id: doc.reportId,
    sequence: doc.sequence,
    previousHash: doc.previousHash,
    hash: doc.hash,
    canonicalPayload: {
      reportId: doc.reportId,
      textData: doc.textData,
      reportedNumber: doc.reportedNumber,
      location: doc.location,
      nullifier: doc.nullifier,
      aiFlag: doc.aiFlag,
      sequence: doc.sequence,
      createdAt: doc.createdAt,
    },
  }));

  const result = verifyChainRange(entries);

  return {
    ...result,
    rangeChecked: {
      startSequence: typeof startSequence === 'number' ? startSequence : null,
      endSequence: typeof endSequence === 'number' ? endSequence : null,
    },
  };
}

module.exports = {
  canonicalize,
  canonicalizeToString,
  computeHash,
  getGenesisHash,
  verifyChainRange,
  verifyReportChain,
};