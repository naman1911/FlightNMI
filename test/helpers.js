// Builders for synthetic flight tracks used by the tracker tests.
import { NMI, BOM } from "../src/airports.js";
import { destination } from "../src/geo.js";

const FT_PER_KM_3DEG = 172; // a 3 degree glide path loses about 172 ft per km

export function snapshot(over = {}) {
  return { hex: "800abc", callsign: "IGO1234", reg: "VT-ABC", type: "A20N", category: "A3", military: false,
    lat: NMI.lat, lon: NMI.lon, ground: false, alt: 1000, gs: 140, track: 260, vr: -700, posAgeSec: 0, at: 0, ...over };
}

/**
 * A straight-in approach: starts `startKm` from `airport` on bearing
 * `fromBearing`, flies heading `heading` toward it, descending on a 3 degree
 * path (capped at `cruiseAlt`), one snapshot every `stepSec` seconds.
 * Returns [{t, ac}] with t in seconds from the first point.
 */
export function straightIn({ airport = NMI, fromBearing = 80, heading = 260, startKm = 120, cruiseAlt = 24000, stepSec = 20, hex = "800abc", callsign = "IGO1234", type = "A20N", reg = "VT-ABC", endKm = 0.5 } = {}) {
  const out = [];
  let dist = startKm, t = 0;
  while (dist > endKm) {
    const p = destination(airport, fromBearing, dist);
    const alt = Math.min(cruiseAlt, Math.round(dist * FT_PER_KM_3DEG) + 20);
    const gs = dist > 60 ? 280 : dist > 20 ? 220 : 140;
    out.push({ t, ac: snapshot({ hex, callsign, type, reg, lat: p.lat, lon: p.lon, alt, gs, track: heading, vr: alt > cruiseAlt - 1 ? 0 : -700 }) });
    dist -= (gs * 1.852 * stepSec) / 3600;
    t += stepSec;
  }
  return out;
}

export { NMI, BOM };
