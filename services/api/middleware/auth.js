const { initFirebase } = require('../config/firebase');

const VALID_ROLES = ['citizen', 'officer', 'analyst', 'auditor'];

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

module.exports = { verifyFirebaseToken, VALID_ROLES };