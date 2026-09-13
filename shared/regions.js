// shared/regions.js
//
// Single source of truth for Philippine administrative region identifiers.
// Shared by services/api, apps/web, and apps/mobile so the value written
// by an admin (invite form) is byte-identical to the value used by the
// officer's query filter and by the citizen's GPS-derived report.

const PH_REGIONS = [
  'NCR',
  'CAR',
  'Region I',
  'Region II',
  'Region III',
  'Region IV-A',
  'MIMAROPA',
  'Region V',
  'Region VI',
  'Region VII',
  'Region VIII',
  'Region IX',
  'Region X',
  'Region XI',
  'Region XII',
  'Region XIII',
  'BARMM',
];

// Sentinel for reports whose citizen couldn't be located or denied GPS.
// Officers in EVERY region see reports tagged with this sentinel, so
// nothing is ever invisible to the review queue.
const UNCLASSIFIED_REGION = 'UNCLASSIFIED';

// Admin's jurisdiction — grants cross-region visibility.
const ALL_REGIONS = 'ALL';

function isValidRegion(value) {
  return PH_REGIONS.includes(value);
}

module.exports = {
  PH_REGIONS,
  UNCLASSIFIED_REGION,
  ALL_REGIONS,
  isValidRegion,
};