// services/api/services/chainVerifier.js
const Report = require('../models/Report');
const { computeHash } = require('../utils/hashChain');

/**
 * Recompute Hₙ = SHA256(canonicalize(Dataₙ) ‖ Hₙ₋₁) over a range of the
 * Report chain and compare each recomputed hash to the stored one.
 *
 * @param {Object} opts
 * @param {number|null} opts.fromBlock - starting sequence (null → whole chain)
 * @param {number|null} opts.toBlock   - ending sequence   (null → whole chain)
 * @returns {Promise<{
 *   status: 'pass'|'fail',
 *   breakIndex: number|null,
 *   checked: number,
 *   fromBlock: number,
 *   toBlock: number,
 *   durationMs: number,
 *   headHash: string
 * }>}
 */
async function verifyChain({ fromBlock, toBlock } = {}) {
  const startedAt = Date.now();

  // ── Resolve range ────────────────────────────────────────
  if (fromBlock == null || toBlock == null) {
    const bounds = await Report.aggregate([
      {
        $group: {
          _id: null,
          min_i: { $min: '$sequence' },
          max_i: { $max: '$sequence' },
        },
      },
    ]);

    const minSeq = bounds[0]?.min_i;
    const maxSeq = bounds[0]?.max_i;

    // Guard: an empty ledger (no docs) OR a ledger whose minimum
    // sequence is not a positive integer is invalid. Reject explicitly
    // instead of falling through to `fromBlock = 0` (which produced
    // the "Missing predecessor block #-1" error).
    if (
      typeof minSeq !== 'number' ||
      typeof maxSeq !== 'number' ||
      !Number.isFinite(minSeq) ||
      !Number.isFinite(maxSeq) ||
      minSeq < 1 ||
      maxSeq < minSeq
    ) {
      throw Object.assign(
        new Error(
          'Cannot verify chain — ledger has no valid starting block. ' +
            `min=${minSeq}, max=${maxSeq}.`
        ),
        { status: 400 }
      );
    }

    fromBlock = minSeq;
    toBlock = maxSeq;
  }

  fromBlock = Number(fromBlock);
  toBlock = Number(toBlock);

  if (!Number.isFinite(fromBlock) || !Number.isFinite(toBlock)) {
    throw Object.assign(
      new Error('Invalid range: from/to must be numbers'),
      { status: 400 }
    );
  }

  // Guard: reject any explicit range that starts below 1. This catches
  // a malformed client request or a stale cached payload.
  if (fromBlock < 1) {
    throw Object.assign(
      new Error(`Invalid range: fromBlock must be >= 1 (got ${fromBlock}).`),
      { status: 400 }
    );
  }

  if (fromBlock > toBlock) {
    throw Object.assign(
      new Error(`Invalid range: from (${fromBlock}) > to (${toBlock}).`),
      { status: 400 }
    );
  }

  // ── Seed the previous hash ───────────────────────────────
  let prevHash;
  if (fromBlock === 1) {
    // Genesis seed — used only for the true first block of the chain.
    prevHash = process.env.GENESIS_HASH || '0'.repeat(64);
  } else {
    // For any other starting block, use the stored hash of the
    // immediately preceding block. This is what makes ranged
    // verification link correctly back to the full chain.
    const predecessor = await Report.findOne({
      sequence: fromBlock - 1,
    }).lean();
    if (!predecessor) {
      throw Object.assign(
        new Error(
          `Cannot verify from block #${fromBlock} — predecessor block #${
            fromBlock - 1
          } is missing from the ledger.`
        ),
        { status: 400 }
      );
    }
    prevHash = predecessor.hash;
  }

  // ── Fetch the slice (ascending) ──────────────────────────
  const rows = await Report.find({
    sequence: { $gte: fromBlock, $lte: toBlock },
  })
    .sort({ sequence: 1 })
    .lean();

  if (rows.length === 0) {
    throw Object.assign(
      new Error('No blocks in requested range'),
      { status: 404 }
    );
  }

  // ── Walk the chain ───────────────────────────────────────
  let breakIndex = null;

  for (const row of rows) {
    // Rebuild the exact object that Report.js hashed.
    // getCanonicalPayload() is an instance method, so we wrap the
    // lean doc back into a Report to reuse the same logic.
    const doc = new Report(row);
    const canonical = doc.getCanonicalPayload();

    const recomputed = computeHash(canonical, prevHash);

    if (recomputed !== row.hash) {
      breakIndex = Number(row.sequence);
      break;
    }
    prevHash = row.hash;
  }

  return {
    status: breakIndex === null ? 'pass' : 'fail',
    breakIndex,
    checked: rows.length,
    fromBlock,
    toBlock,
    durationMs: Date.now() - startedAt,
    headHash: prevHash,
  };
}

module.exports = { verifyChain };