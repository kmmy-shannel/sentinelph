// services/api/middleware/ipAllowlist.js
//
// Network gate for the Super Admin surface. Reads a comma-separated
// allowlist of IPs / CIDRs from SUPERADMIN_IP_ALLOWLIST. Empty value
// disables the gate entirely (development mode).
//
// Must be mounted BEFORE verifyFirebaseToken on the /superadmin router.

const ALLOWED = (process.env.SUPERADMIN_IP_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function toInt(ip) {
  return ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
}

function inCidr(ip, cidr) {
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - Number(bits)) - 1);
  return (toInt(ip) & mask) === (toInt(range) & mask);
}

function ipAllowlist(req, res, next) {
  // Dev / unset → allow through
  if (ALLOWED.length === 0) return next();

  // Trust X-Forwarded-For when behind a proxy / Cloudflare / ngrok.
  const fwd = req.headers['x-forwarded-for'];
  const ip = (fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '').trim();

  const ok = ALLOWED.some((c) =>
    c.includes('/') ? inCidr(ip, c) : c === ip
  );

  if (!ok) {
    console.warn('[ipAllowlist] blocked', ip);
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Your network is not permitted to access this resource.',
    });
  }
  return next();
}

module.exports = { ipAllowlist };