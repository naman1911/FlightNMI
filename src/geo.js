// Geometry helpers. Distances are in kilometres, angles in degrees.
const R_EARTH_KM = 6371.0088;
export const KM_PER_NM = 1.852;
export const FT_PER_M = 3.28084;

export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;

/** Great-circle distance between two {lat, lon} points, in km. */
export function distanceKm(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, 0-360 degrees true. */
export function bearing(a, b) {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest difference between two headings, 0-180. */
export function headingDiff(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/**
 * Position of `p` relative to a runway through `origin` with true heading
 * `headingDeg`, on a flat local grid. `along` is km along the runway axis
 * (positive in the runway heading direction), `cross` is km off the axis.
 */
export function runwayFrame(origin, headingDeg, p) {
  const x = (p.lon - origin.lon) * 111.32 * Math.cos(rad(origin.lat));
  const y = (p.lat - origin.lat) * 110.574;
  const ux = Math.sin(rad(headingDeg));
  const uy = Math.cos(rad(headingDeg));
  return { along: x * ux + y * uy, cross: x * uy - y * ux };
}

/** Move a point by `km` along `headingDeg`. Used for building test tracks. */
export function destination(p, headingDeg, km) {
  const lat = p.lat + (km * Math.cos(rad(headingDeg))) / 110.574;
  const lon = p.lon + (km * Math.sin(rad(headingDeg))) / (111.32 * Math.cos(rad(p.lat)));
  return { lat, lon };
}
