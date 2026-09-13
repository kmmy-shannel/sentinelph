const { initFirebase } = require('../config/firebase');

// Extended to include admin/superadmin for the Hierarchical Invitation-Based
// Provisioning System (admin.js routes) on top of the original operational roles.
const VALID_ROLES = ['citizen', 'officer', 'analyst', 'auditor', 'admin', 'superadmin'];

/**
 * Verifies the Firebase ID token sent in the Authorization header
 * ("Authorization: Bearer <token>"), attaches the decoded user
 * (uid, email, role, jurisdiction) to req.user, and rejects the
 * request if the token is missing, invalid, expired, or carries
 * an unrecognized role claim.
 *
 * Role is expected as a Firebase custom claim, e.g.:
 *   admin.auth().setCustomUserClaims(uid, { role: 'officer', jurisdiction: 'QC-01' })
 */
async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected "Bearer <token>".',
      });
    }

    const idToken = authHeader.split('Bearer ')[1]?.trim();

    if (!idToken) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No ID token provided.',
      });
    }

    const admin = initFirebase();
    const decoded = await admin.auth().verifyIdToken(idToken, true);

    const role = decoded.role;

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Token is valid but carries no recognized role claim. Valid roles: ${VALID_ROLES.join(', ')}.`,
      });
    }

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      role,
      jurisdiction: decoded.jurisdiction || null,
      phoneVerified: Boolean(decoded.phone_number),
    };

    return next();
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Firebase ID token has expired. Please re-authenticate.',
      });
    }

    if (err.code === 'auth/argument-error' || err.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_INVALID',
        message: 'Firebase ID token is invalid or has been revoked.',
      });
    }

    console.error('[Auth Middleware] Unexpected verification error:', err);
    return res.status(500).json({
      success: false,
      error: 'AUTH_VERIFICATION_FAILED',
      message: 'Could not verify authentication token.',
    });
  }
}
/**
 * Variant of verifyFirebaseToken that decodes and validates the token
 * but does NOT require a recognized `role` claim. Used exclusively by
 * the /auth/bootstrap-citizen endpoint, which is what NEW users call
 * to have their `role: 'citizen'` claim assigned on first signup.
 *
 * Without this variant, a brand-new signup could never obtain the claim
 * (chicken-and-egg: verifyFirebaseToken rejects because the claim is
 * missing, and the claim can never be set because the endpoint is
 * behind verifyFirebaseToken).
 */
async function verifyFirebaseTokenWithoutRole(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected "Bearer <token>".',
      });
    }

    const idToken = authHeader.split('Bearer ')[1]?.trim();
    if (!idToken) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'No ID token provided.',
      });
    }

    const admin = initFirebase();
    const decoded = await admin.auth().verifyIdToken(idToken, true);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      role: decoded.role || null, // may legitimately be null here
      jurisdiction: decoded.jurisdiction || null,
      phoneVerified: Boolean(decoded.phone_number),
    };

    return next();
  } catch (err) {
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Firebase ID token has expired. Please re-authenticate.',
      });
    }
    if (err.code === 'auth/argument-error' || err.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_INVALID',
        message: 'Firebase ID token is invalid or has been revoked.',
      });
    }
    console.error('[Auth Middleware] Unexpected verification error (no-role):', err);
    return res.status(500).json({
      success: false,
      error: 'AUTH_VERIFICATION_FAILED',
      message: 'Could not verify authentication token.',
    });
  }
}
module.exports = {
  verifyFirebaseToken,
  verifyFirebaseTokenWithoutRole,   // ← ADD THIS LINE
  VALID_ROLES,
};