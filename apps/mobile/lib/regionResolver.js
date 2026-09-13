// apps/mobile/lib/regionResolver.js
//
// Offline PH region resolver using approximate bounding boxes.
// Used to assign a report to the correct regional officer queue
// without any paid geocoding API.
//
// The boxes are intentionally generous rectangles — a few coastal
// edge cases may snap to an adjacent region, but the UNCLASSIFIED
// fallback and the officer's manual override in ProfileScreen make
// this acceptable. Zero network calls, zero API keys, zero cost.

export const PH_REGIONS = [
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

export const UNCLASSIFIED_REGION = 'UNCLASSIFIED';

// Format: [minLat, maxLat, minLng, maxLng]
const REGION_BOUNDS = [
  { name: 'NCR',         bbox: [14.35, 14.78, 120.90, 121.10] },
  { name: 'CAR',         bbox: [16.20, 18.60, 120.40, 121.30] },
  { name: 'Region I',    bbox: [15.40, 18.60, 119.70, 121.00] },
  { name: 'Region II',   bbox: [16.00, 18.70, 121.00, 122.80] },
  { name: 'Region III',  bbox: [14.60, 16.30, 119.80, 121.20] },
  { name: 'Region IV-A', bbox: [13.50, 15.10, 120.50, 122.20] },
  { name: 'MIMAROPA',    bbox: [ 8.00, 14.00, 117.00, 122.50] },
  { name: 'Region V',    bbox: [12.30, 14.50, 122.00, 124.50] },
  { name: 'Region VI',   bbox: [ 9.50, 11.90, 121.50, 123.50] },
  { name: 'Region VII',  bbox: [ 9.20, 11.30, 123.00, 124.60] },
  { name: 'Region VIII', bbox: [ 9.80, 12.70, 124.00, 126.00] },
  { name: 'Region IX',   bbox: [ 5.30,  8.80, 121.00, 124.00] },
  { name: 'Region X',    bbox: [ 6.00,  9.50, 123.50, 126.00] },
  { name: 'Region XI',   bbox: [ 5.00,  7.60, 125.00, 126.80] },
  { name: 'Region XII',  bbox: [ 5.50,  7.90, 124.00, 125.50] },
  { name: 'Region XIII', bbox: [ 8.20, 10.20, 125.00, 126.60] },
  { name: 'BARMM',       bbox: [ 4.50,  7.90, 121.00, 124.30] },
];

function isInBox(lat, lng, bbox) {
  const [minLat, maxLat, minLng, maxLng] = bbox;
  return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

/**
 * Resolves a lat/lng to a canonical PH region name. Returns
 * 'UNCLASSIFIED' if the point is outside every box or inputs are invalid.
 */
export function resolveRegionFromCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return UNCLASSIFIED_REGION;
  }
  for (const { name, bbox } of REGION_BOUNDS) {
    if (isInBox(lat, lng, bbox)) return name;
  }
  return UNCLASSIFIED_REGION;
}