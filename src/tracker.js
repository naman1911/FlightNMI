// Pure arrival-detection state machine. Feed it aircraft snapshots; it emits
// events. It has no timers, no network and no I/O, so it is fully testable.
//
// Events:
//   approaching - a flight heading for NMI is within NOTICE minutes of landing
//   landed      - it is on the ground at NMI, or its signal was lost on short
//                 final (community receivers often lose aircraft below ~1000 ft)
//   go_around   - it was on final, then climbed away again
import { NMI, BOM } from "./airports.js";
import { distanceKm, bearing, headingDiff, runwayFrame, KM_PER_NM } from "./geo.js";

export const DEFAULT_RULES = {
  noticeMinutes: 20,
  maxPositionAgeSec: 60,
  // On final: lined up with runway 08/26, low, close and flying toward the field.
  finalMaxAlongKm: 28,
  finalMaxCrossKm: 2.5,
  finalMaxAltFt: 5000,
  finalTrackTolDeg: 25,
  // On approach without a route: close, descending, pointed straight at NMI
  // (its track passes within approachPathKm of the field), at a height that
  // fits a descent into NMI, and not equally pointed at Mumbai CSMIA.
  approachMaxKm: 30,
  approachMaxAltFt: 7000,
  approachPathKm: 3,
  approachDescentFpm: -250,
  approachFtPerKm: 172 * 1.3,
  approachAltPadFt: 1000,
  // Route filed to NMI: trust it once reasonably close and not pointing away.
  routeMaxKm: 185,
  routeMaxAltFt: 30000,
  // Landing.
  landedGroundKm: 6,
  lostLowAltFt: 1800,
  lostLowKm: 10,
  lostAfterSec: 90,
  // Go-around.
  goAroundClimbFpm: 400,
  goAroundRiseFt: 600,
  goAroundMaxMinAltFt: 2500,
  // Housekeeping.
  staleSec: 15 * 60,
  doneKeepSec: 2 * 60 * 60,
};

export function onFinal(a, rules = DEFAULT_RULES) {
  if (a.track == null || a.alt == null || a.alt > rules.finalMaxAltFt) return null;
  const { along, cross } = runwayFrame(NMI, NMI.runwayHeading, a);
  if (Math.abs(along) > rules.finalMaxAlongKm || Math.abs(cross) > rules.finalMaxCrossKm) return null;
  // East of the field you land on 26 (heading 260), west of it on 08 (heading 080).
  const want = along > 0 ? (NMI.runwayHeading + 180) % 360 : NMI.runwayHeading;
  if (headingDiff(a.track, want) > rules.finalTrackTolDeg) return null;
  return { runway: along > 0 ? NMI.runways[1] : NMI.runways[0], alongKm: Math.abs(along) };
}

/** Where a point lies relative to the aircraft's current track: km ahead and km off to the side. */
export function pathOffset(a, point) {
  const f = runwayFrame(a, a.track, point);
  return { ahead: f.along, offside: Math.abs(f.cross) };
}

export function onApproach(a, d, rules = DEFAULT_RULES) {
  if (a.track == null || a.alt == null || d > rules.approachMaxKm || a.alt > rules.approachMaxAltFt) return false;
  const descending = a.vr != null ? a.vr < rules.approachDescentFpm : a.alt < 4000;
  if (!descending) return false;
  if (a.alt > d * rules.approachFtPerKm + rules.approachAltPadFt) return false; // too high to be landing here
  const toNMI = pathOffset(a, NMI);
  if (toNMI.ahead <= 0 || toNMI.offside > rules.approachPathKm) return false;
  const toBOM = pathOffset(a, BOM);
  if (toBOM.ahead > 0 && toBOM.offside <= rules.approachPathKm && distanceKm(a, BOM) < d) return false; // could just as well be Mumbai
  return true;
}

export function etaMinutes(distKm, gs, isFinal) {
  if (distKm == null) return null;
  const speed = Math.max(gs || 0, 80) * KM_PER_NM; // km/h, floor avoids silly ETAs on slow readings
  const mins = (distKm / speed) * 60;
  return Math.max(1, Math.round(isFinal ? mins : mins * 1.1 + 2));
}

export class Tracker {
  constructor(rules = {}) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    this.tracks = new Map(); // hex -> track
  }

  /** Flights currently believed to be inbound, for the status page. */
  inbound() {
    return [...this.tracks.values()]
      .filter((t) => !t.done && (t.phase === "approaching" || t.phase === "final"))
      .map((t) => ({ hex: t.hex, callsign: t.callsign, reg: t.reg, type: t.type, phase: t.phase, runway: t.finalRunway || null,
        distanceKm: t.last.d, altFt: t.last.alt, etaMin: t.last.eta, route: t.route || null, lastSeen: t.lastSeen }))
      .sort((x, y) => (x.etaMin ?? 999) - (y.etaMin ?? 999));
  }

  _newTrack(a, now) {
    return { hex: a.hex, callsign: a.callsign, reg: a.reg, type: a.type, category: a.category, military: a.military,
      firstSeen: now, lastSeen: now, phase: "seen", minAlt: Infinity, wasFinal: false, wasApproaching: false,
      notified: {}, done: false, route: null, last: {} };
  }

  _isInbound(a, d, fin, app, route) {
    if (route && route.dest === NMI.icao) {
      const closing = d < 15 || a.track == null || headingDiff(a.track, bearing(a, NMI)) < 75;
      if (closing && d <= this.rules.routeMaxKm && a.alt <= this.rules.routeMaxAltFt && (route.plausible || fin || app)) return "route";
    } else if (route && route.dest && !fin) {
      return null; // filed to somewhere else; only a visible final approach overrides that
    }
    if (fin) return "final";
    if (app) return "approach";
    return null;
  }

  /**
   * @param {Array} aircraft normalised snapshots (see sources.js)
   * @param {Map} routes callsign -> {origin, dest, originInfo, plausible}
   * @param {number} now epoch ms
   * @returns {Array} events
   */
  update(aircraft, routes = new Map(), now = Date.now()) {
    const R = this.rules;
    const events = [];
    const present = new Set();

    for (const a of aircraft) {
      if (!a.hex || a.posAgeSec > R.maxPositionAgeSec) continue;
      let t = this.tracks.get(a.hex);
      const callsignChanged = t && a.callsign && t.callsign && a.callsign !== t.callsign;
      const d = distanceKm(a, NMI);
      const flewAway = t && t.done && !a.ground && a.alt != null && a.alt > 8000 && d > 40;
      if (callsignChanged || flewAway) { this.tracks.delete(a.hex); t = undefined; }
      if (!t) { t = this._newTrack(a, now); this.tracks.set(a.hex, t); }
      present.add(a.hex);

      if (a.callsign) t.callsign = a.callsign;
      if (a.reg) t.reg = a.reg;
      if (a.type) t.type = a.type;
      if (a.category) t.category = a.category;
      t.lastSeen = now;
      const fin = a.ground ? null : onFinal(a, R);
      const route = t.callsign ? routes.get(t.callsign) || null : null;
      if (route) t.route = route;
      t.last = { lat: a.lat, lon: a.lon, alt: a.alt, gs: a.gs, track: a.track, vr: a.vr, ground: a.ground, d,
        eta: a.ground ? 0 : etaMinutes(d, a.gs, Boolean(fin)) };
      if (t.done) continue;

      if (a.ground) {
        if (d <= R.landedGroundKm && (t.wasFinal || t.wasApproaching)) {
          t.done = true; t.phase = "landed";
          events.push(this._event("landed", t, now, { confidence: "confirmed", runway: t.finalRunway || null }));
        }
        continue; // on the ground anywhere else (or never seen airborne): a departure or taxiing, not ours
      }
      if (a.alt == null) continue;

      const app = onApproach(a, d, R);
      const basis = this._isInbound(a, d, fin, app, route);
      t.minAlt = Math.min(t.minAlt, a.alt);

      if (fin) { t.wasFinal = true; t.finalRunway = fin.runway; t.phase = "final"; }
      else if (basis) { t.wasApproaching = true; if (t.phase !== "final") t.phase = "approaching"; }

      // Go-around: was lined up and low, now climbing well above its lowest point.
      if (!fin && t.wasFinal && t.minAlt <= R.goAroundMaxMinAltFt && a.vr != null && a.vr >= R.goAroundClimbFpm && a.alt >= t.minAlt + R.goAroundRiseFt) {
        t.wasFinal = false; t.minAlt = a.alt; t.phase = "go_around";
        if (!t.notified.go_around) {
          t.notified.go_around = true;
          events.push(this._event("go_around", t, now, { runway: t.finalRunway || null }));
        }
        continue;
      }

      if (basis && !t.notified.approaching) {
        const eta = t.last.eta;
        if (fin || (eta != null && eta <= R.noticeMinutes)) {
          t.notified.approaching = true;
          events.push(this._event("approaching", t, now, { etaMin: eta, basis, runway: fin?.runway || null }));
        }
      }
    }

    // Aircraft that vanished.
    for (const t of this.tracks.values()) {
      if (present.has(t.hex)) continue;
      const gone = now - t.lastSeen;
      if (!t.done && t.wasFinal && t.last.alt != null && t.last.alt <= R.lostLowAltFt && t.last.d <= R.lostLowKm && gone >= R.lostAfterSec * 1000) {
        t.done = true; t.phase = "landed";
        const travelSec = Math.round((t.last.d / (Math.max(t.last.gs || 0, 100) * KM_PER_NM)) * 3600);
        events.push(this._event("landed", t, t.lastSeen + Math.min(travelSec, 240) * 1000, { confidence: "presumed", runway: t.finalRunway || null }));
      } else if (!t.done && gone > R.staleSec * 1000) {
        this.tracks.delete(t.hex);
      } else if (t.done && gone > R.doneKeepSec * 1000) {
        this.tracks.delete(t.hex);
      }
    }
    return events;
  }

  _event(type, t, at, extra) {
    return {
      type,
      at,
      hex: t.hex,
      callsign: t.callsign,
      reg: t.reg,
      aircraftType: t.type,
      emitterCategory: t.category,
      military: t.military,
      route: t.route,
      distanceKm: t.last.d,
      altFt: t.last.alt,
      ...extra,
    };
  }
}
