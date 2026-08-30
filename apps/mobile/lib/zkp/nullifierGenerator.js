// apps/mobile/lib/zkp/nullifierGenerator.js
//
// Derives the pseudonymous "nullifier" submitted with every report.
//
// Purpose: prove to the backend "this device has not already reported this
// exact scam target" WITHOUT revealing device identity. The backend stores
// only the nullifier hash and rejects duplicates (see Report.js nullifier
// uniqueness constraint in Phase 2) — it never sees the device secret that
// produced it.
//
// Design (client-side commitment scheme, matches the hash-chained,
// append-only audit log architecture):
//   nullifier = SHA256( deviceSecret || domainSeparator || targetFingerprint )
//
//   - deviceSecret: a random 256-bit value generated once on first launch
//     and stored in SecureStore. Never transmitted.
//   - domainSeparator: a fixed app-level string, so nullifiers from this
//     app can't collide with nullifiers from an unrelated context.
//   - targetFingerprint: a normalized hash of *what* is being reported
//     (e.g. the scam phone number/URL), so the same device can report
//     different scams, but can't report the exact same target twice.
//
// This is a lightweight commitment, not a full zk-SNARK circuit — it gives
// one-time-reporter guarantees per target without a proving system, which
// is sufficient for Phase 1. A full ZKP circuit (e.g. Semaphore) can later
// swap in behind this same function signature.

import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const DEVICE_SECRET_KEY = 'sentinelph_device_secret_v1';

// IMPORTANT: this is a domain separator, not a secret. It's a public,
// versioned string that scopes nullifiers to this app/protocol version so
// they can't collide with nullifiers from an unrelated context. It is safe
// to ship via EXPO_PUBLIC_* because it is inlined into the JS bundle and
// readable by anyone who unpacks the app.
//
// The actual secret — the per-device random value that makes a nullifier
// unforgeable and unlinkable to identity — is generated at runtime by
// getOrCreateDeviceSecret() below and lives only in expo-secure-store. It
// must NEVER be sourced from .env / EXPO_PUBLIC_*, since that would make it
// a static, extractable, shared-across-installs value — defeating the
// entire point of the nullifier.
const DOMAIN_SEPARATOR = process.env.EXPO_PUBLIC_ZKP_DOMAIN_SEPARATOR || 'sentinelph.citizen.report.v1';

/**
 * Retrieves the persisted device secret, generating and storing a new one
 * on first call. This secret is the sole source of the device's anonymous
 * identity and never leaves the device.
 */
export async function getOrCreateDeviceSecret() {
  let secret = await SecureStore.getItemAsync(DEVICE_SECRET_KEY);

  if (!secret) {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    secret = Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    await SecureStore.setItemAsync(DEVICE_SECRET_KEY, secret);
  }

  return secret;
}

/**
 * Normalizes a raw report target (phone number, URL, or free-text) into a
 * stable fingerprint so trivial formatting differences (spaces, dashes,
 * casing, protocol prefixes) don't produce distinct nullifiers for what is
 * effectively the same target.
 */
export function normalizeTarget(rawTarget) {
  return rawTarget
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[\s\-().]/g, '');
}

/**
 * Produces the nullifier string to submit with a report.
 * @param {string} rawTarget - the raw scam number/URL/message content.
 * @returns {Promise<string>} hex-encoded SHA-256 nullifier, prefixed 0x.
 */
export async function generateNullifier(rawTarget) {
  const deviceSecret = await getOrCreateDeviceSecret();
  const fingerprint = normalizeTarget(rawTarget);

  const preimage = `${deviceSecret}:${DOMAIN_SEPARATOR}:${fingerprint}`;

  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    preimage,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  return `0x${digest}`;
}

/**
 * Produces a separate "ZKP commitment hash" shown to the user in the
 * review step (Step 3 of the wizard) as a proof-of-authenticity artifact
 * distinct from the nullifier — this one binds the full report content so
 * any tampering after submission is detectable, without itself being used
 * for duplicate detection.
 */
export async function generateZkpCommitment({ scamType, content, timestamp }) {
  const deviceSecret = await getOrCreateDeviceSecret();
  const payload = `${deviceSecret}:${scamType}:${content}:${timestamp}`;

  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    payload,
    { encoding: Crypto.CryptoEncoding.HEX }
  );

  return `0x${digest}`;
}