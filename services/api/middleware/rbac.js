// Extended to include admin/superadmin for the Hierarchical Invitation-Based
// Provisioning System, alongside the original operational roles.
const VALID_ROLES = ['citizen', 'officer', 'analyst', 'auditor', 'admin', 'superadmin'];

/**
 * Factory: returns Express middleware that only allows requests through
 * when req.user.role (set upstream by verifyFirebaseToken) is one of
 * the roles passed in. Must run AFTER verifyFirebaseToken on the route.
 *
 * Usage: router.get('/queue', verifyFirebaseToken, requireRole('officer'), handler)
 *        router.post('/invite-officer', verifyFirebaseToken, requireRole('admin', 'superadmin'), handler)
 */
function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();

  const invalid = roles.filter((role) => !VALID_ROLES.includes(role));
  if (invalid.length > 0) {
    throw new Error(
      `requireRole() was configured with unknown role(s): ${invalid.join(', ')}. ` +
      `Valid roles are: ${VALID_ROLES.join(', ')}.`
    );
  }

  return function rbacGuard(req, res, next) {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication is required before role authorization can be evaluated.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: `Role '${req.user.role}' is not permitted to access this resource. Allowed roles: ${roles.join(', ')}.`,
      });
    }

    return next();
  };
}

/**
 * Defense-in-depth guard for the Auditor role: even though Auditor-only
 * routers should only ever be mounted with GET handlers, this middleware
 * explicitly rejects any non-GET verb reaching an Auditor-accessible
 * route, so the "structurally read-only, not just hidden buttons"
 * guarantee from the SRS holds even if a route is misconfigured later.
 */
function enforceAuditorReadOnly(req, res, next) {
  if (req.user && req.user.role === 'auditor' && req.method !== 'GET') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'The Auditor role is strictly read-only; mutating requests are rejected at the gateway.',
    });
  }
  return next();
}

/**
 * Factory: restricts an Officer to resources within their assigned
 * jurisdiction. Non-officer roles pass through untouched (Analyst and
 * Auditor are intentionally system-wide). `getResourceJurisdiction`
 * receives the request and must return the jurisdiction/region string
 * associated with the resource being accessed (e.g. from req.body,
 * req.query, or a value the previous handler attached to req).
 *
 * If either side of the comparison is missing, the guard fails open
 * (allows the request) rather than blocking on absent data — jurisdiction
 * scoping is a workflow convenience, not the system's core security
 * boundary (role itself is).
 */
function requireJurisdictionMatch(getResourceJurisdiction) {
  return function jurisdictionGuard(req, res, next) {
    if (!req.user || req.user.role !== 'officer') {
      return next();
    }

    const resourceJurisdiction = getResourceJurisdiction(req);

    if (!req.user.jurisdiction || !resourceJurisdiction) {
      return next();
    }

    if (req.user.jurisdiction !== resourceJurisdiction) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'This case falls outside your assigned jurisdiction.',
      });
    }

    return next();
  };
}

module.exports = {
  requireRole,
  enforceAuditorReadOnly,
  requireJurisdictionMatch,
  VALID_ROLES,
};