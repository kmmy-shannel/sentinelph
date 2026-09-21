// services/api/utils/citizenHash.js
'use strict';

const crypto = require('crypto');

const DEFAULT_SALT = 'sentinelph_default_salt';
let saltWarningShown = false;

/**
 * Returns the HMAC key. Falls back to the public default salt when
 * CITIZEN_SALT is not configured, but shouts about it once per process:
 * a hash derived from an IPv4 address is trivially reversible by brute
 * force (~4.3B candidates) whenever the salt is known, and the default
 * salt lives in the repository.
 */
function getSalt() {
  if (process.env.CITIZEN_SALT) return process.env.CITIZEN_SALT;

  if (!saltWarningShown) {
    saltWarningShown = true;
    const level = process.env.NODE_ENV === 'production' ? 'error' : 'warn';
    console[level](
      '[citizenHash] CITIZEN_SALT is not set - falling back to the public default salt. ' +
        'Set CITIZEN_SALT to a long random secret in every deployed environment.'
    );
  }
  return DEFAULT_SALT;
}

/**
 * citizenHash = HMAC-SHA256(salt, req.user.uid || req.ip)
 *
 * Pseudonymous, not anonymous: anyone holding the salt and a candidate
 * uid/IP can recompute the hash, so the salt must be treated as a secret.
 * Returns null when neither a uid nor an IP is available.
 */
function computeCitizenHash(req) {
  const identifier = (req && req.user && req.user.uid) || (req && req.ip);
  if (!identifier) return null;

  return crypto.createHmac('sha256', getSalt()).update(String(identifier)).digest('hex');
}

module.exports = { computeCitizenHash };