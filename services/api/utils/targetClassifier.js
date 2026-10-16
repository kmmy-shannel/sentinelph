// services/api/utils/targetClassifier.js
//
// Classifies an incoming report into one of two target kinds:
//
//   'number' — the reported sender IS the scam target.
//   'brand'  — the SMS body impersonates a known brand.
//
// v2 (fix): the previous alphanumeric-header heuristic was too broad
// and classified short brand names like "BDO" as 'number' before the
// brand check could run. The heuristic now requires at least one of:
//   - a digit in the sender (e.g. "MAYA1234", "BPI-2024")
//   - a hyphen or underscore (e.g. "BDO-Alerts", "GCash_Alert")
//   - a length of 8 or more (e.g. "GCashAlert")
// Short, purely alphabetic senders ("BDO", "BPI", "SSS", "NBI") now
// fall through to the brand-in-content check.
'use strict';

const BRAND_ALLOWLIST = {
  gcash: 'GCash',
  'g-cash': 'GCash',
  gcashalert: 'GCash',
  maya: 'Maya',
  paymaya: 'Maya',
  'pay maya': 'Maya',
  bdo: 'BDO',
  'bdo online': 'BDO',
  bdoalerts: 'BDO',
  bdoalert: 'BDO',
  bpi: 'BPI',
  'bpi online': 'BPI',
  metrobank: 'Metrobank',
  landbank: 'LandBank',
  'land bank': 'LandBank',
  unionbank: 'UnionBank',
  'union bank': 'UnionBank',
  securitybank: 'Security Bank',
  'security bank': 'Security Bank',
  chinabank: 'China Bank',
  'china bank': 'China Bank',
  rcbc: 'RCBC',
  pnb: 'PNB',
  'philippine national bank': 'PNB',
  seabank: 'SeaBank',
  'sea bank': 'SeaBank',
  gotyme: 'GoTyme',
  'go tyme': 'GoTyme',
  tonik: 'Tonik',
  cimb: 'CIMB',
  ing: 'ING',
  hsbc: 'HSBC',
  citibank: 'Citibank',
  'standard chartered': 'Standard Chartered',
  sss: 'SSS',
  'social security system': 'SSS',
  gsis: 'GSIS',
  pagibig: 'Pag-IBIG',
  'pag-ibig': 'Pag-IBIG',
  bir: 'BIR',
  'bureau of internal revenue': 'BIR',
  nbi: 'NBI',
  pnp: 'PNP',
  lto: 'LTO',
  dfa: 'DFA',
  philhealth: 'PhilHealth',
  'phil health': 'PhilHealth',
  'philhealth alert': 'PhilHealth',
  lazada: 'Lazada',
  shopee: 'Shopee',
  'shopee express': 'Shopee Express',
  lzd: 'Lazada',
  jt: 'J&T Express',
  'j&t': 'J&T Express',
  'j&t express': 'J&T Express',
  lbc: 'LBC',
  '2go': '2GO',
  grab: 'Grab',
  foodpanda: 'foodpanda',
  'ninja van': 'Ninja Van',
  ninjavan: 'Ninja Van',
  globe: 'Globe',
  'globe telecom': 'Globe',
  smart: 'Smart',
  'smart communications': 'Smart',
  tnt: 'TNT',
  sun: 'Sun Cellular',
  'sun cellular': 'Sun Cellular',
  dito: 'DITO',
  'dito telecommunity': 'DITO',
  meralco: 'Meralco',
  maynilad: 'Maynilad',
  manilawater: 'Manila Water',
  'manila water': 'Manila Water',
  pldt: 'PLDT',
  converge: 'Converge',
  'converge ict': 'Converge',
  pldthome: 'PLDT Home',
  'pldt home': 'PLDT Home',
  apple: 'Apple',
  google: 'Google',
  microsoft: 'Microsoft',
  netflix: 'Netflix',
  spotify: 'Spotify',
};

function isPhoneNumberSender(sender) {
  if (typeof sender !== 'string') return false;
  const digits = sender.replace(/\D/g, '');
  if (digits.length < 7) return false;
  return /^[\d\s\-+().]+$/.test(sender.trim());
}

/**
 * Detects SMS sender IDs (also called "alphanumeric sender IDs").
 * These are what telcos assign to businesses for two-way SMS:
 *   "GCashAlert", "BDO-Alerts", "MAYA2024", "BPI_ONLINE_ALERTS"
 *
 * v2 heuristic is stricter. A short alphabetic string with no digits,
 * no separators, and no length signal (like "BDO" or "BPI") is more
 * likely a brand name typed by the citizen, not a real sender ID. It
 * now falls through to the brand check.
 */
function isAlphanumericHeader(sender) {
  if (typeof sender !== 'string') return false;
  const trimmed = sender.trim();
  if (trimmed.length < 3 || trimmed.length > 20) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/\s/.test(trimmed)) return false;   // headers have no spaces

  const hasDigit = /\d/.test(trimmed);
  const hasSeparator = /[-_]/.test(trimmed);

  // Real sender IDs almost always have a digit or a separator, OR they
  // are long enough to be an obvious concatenated brand name.
  if (hasDigit || hasSeparator) return true;
  if (trimmed.length >= 8) return true;

  // Otherwise (short, alphabetic, no separators): NOT a header.
  // Falls through to the brand check.
  return false;
}

function findBrandInText(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const haystack = text.toLowerCase();
  const keys = Object.keys(BRAND_ALLOWLIST).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (re.test(haystack)) {
      return BRAND_ALLOWLIST[key];
    }
  }
  return null;
}

/**
 * v3 ordering: brand check wins over sender-format.
 *
 * Rationale: if the sender is a human-typed string that also names a
 * known brand, the citizen is almost always reporting impersonation,
 * not the literal string as a phone number. The previous ordering
 * classified "BDO" as 'number' before the brand check ran.
 *
 * The tradeoff: a legit SMS from a real BDO sender ID ("BDO-Alerts")
 * that gets reported will now classify as 'brand', producing a
 * separate BlacklistEntry keyed on the sender string with brandName
 * set. That's acceptable — if a citizen reported it as suspicious, we
 * want the brand to appear in Impersonated Brands.
 */
function classifyTarget({ sender, content } = {}) {
  const trimmedSender = typeof sender === 'string' ? sender.trim() : '';

  // 1. Brand in the sender string? Check the sender first (a citizen
  //    who types "BDO" as the sender is naming the brand).
  const brandFromSender = findBrandInText(trimmedSender);
  if (brandFromSender) {
    return { targetKind: 'brand', brandName: brandFromSender };
  }

  // 2. Phone number? → 'number'
  if (isPhoneNumberSender(trimmedSender)) {
    return { targetKind: 'number', brandName: null };
  }

  // 3. Alphanumeric header with digits/separators? → 'number'
  if (isAlphanumericHeader(trimmedSender)) {
    return { targetKind: 'number', brandName: null };
  }

  // 4. Brand in the message body? → 'brand'
  const brandFromContent = findBrandInText(content);
  if (brandFromContent) {
    return { targetKind: 'brand', brandName: brandFromContent };
  }

  // 5. Fallback → 'number'
  return { targetKind: 'number', brandName: null };
}

module.exports = {
  classifyTarget,
  isPhoneNumberSender,
  isAlphanumericHeader,
  findBrandInText,
  BRAND_ALLOWLIST,
};