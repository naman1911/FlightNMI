// Talks to the community ADS-B aggregators. Both speak the same readsb
// "v2" JSON, so one normaliser covers them; the first one that answers is
// used and remembered, the other is the fallback.
import { NMI } from "./airports.js";
import { log } from "./log.js";

const RADIUS_NM = 100; // ~185 km: enough to catch "20 minutes out" at jet speeds
export const SOURCES = [
  { name: "adsb.lol", url: `https://api.adsb.lol/v2/point/${NMI.lat}/${NMI.lon}/${RADIUS_NM}` },
  { name: "airplanes.live", url: `https://api.airplanes.live/v2/point/${NMI.lat}/${NMI.lon}/${RADIUS_NM}` },
];
const ROUTE_URL = "https://api.adsb.lol/api/0/routeset";
const ROUTE_TTL_MS = 30 * 60 * 1000;
const ROUTE_BACKOFF_MS = 5 * 60 * 1000;
const AIRLINE_CALLSIGN = /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/;

/** Convert one readsb aircraft record into the flat shape the tracker uses. */
export function normalizeAircraft(a, now = Date.now()) {
  if (a == null || typeof a.lat !== "number" || typeof a.lon !== "number") return null;
  const ground = a.alt_baro === "ground";
  const alt = ground ? 0 : [a.alt_baro, a.alt_geom].find((v) => typeof v === "number") ?? null;
  const callsign = String(a.flight || "").trim().toUpperCase();
  return {
    hex: String(a.hex || "").toLowerCase(),
    callsign,
    reg: a.r || "",
    type: String(a.t || "").toUpperCase(),
    category: a.category || "",
    military: Boolean((a.dbFlags || 0) & 1),
    lat: a.lat,
    lon: a.lon,
    ground,
    alt,
    gs: typeof a.gs === "number" ? a.gs : null,
    track: typeof a.track === "number" ? a.track : null,
    vr: typeof a.baro_rate === "number" ? a.baro_rate : typeof a.geom_rate === "number" ? a.geom_rate : null,
    posAgeSec: typeof a.seen_pos === "number" ? a.seen_pos : typeof a.seen === "number" ? a.seen : 0,
    at: now,
  };
}

/** Parse one routeset answer into {origin, dest, originInfo, plausible} or null. */
export function parseRoute(r) {
  const codes = String(r?.airport_codes || "").split("-").filter((c) => /^[A-Z]{4}$/.test(c));
  if (codes.length < 2) return null;
  const i = codes.lastIndexOf(NMI.icao);
  const destIdx = i >= 1 ? i : codes.length - 1;
  const dest = codes[destIdx];
  const origin = codes[destIdx - 1];
  const info = (r._airports || []).find((p) => p.icao === origin) || null;
  return {
    origin,
    dest,
    originInfo: info ? { iata: info.iata || "", name: info.name || "", location: info.location || "" } : null,
    plausible: !(r.plausible === 0 || r.plausible === false),
  };
}

/** Human-readable reason for a failed request, including the network cause fetch hides. */
export function describeError(e) {
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return "timed out";
  const cause = e?.cause?.code || e?.cause?.message;
  return cause ? `${e.message} (${cause})` : e?.message || String(e);
}

export class FlightData {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 10000 } = {}) {
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.preferred = 0;
    this.routes = new Map(); // callsign -> {route|null, at}
    this.routesPausedUntil = 0;
    this.status = { source: "", lastOkAt: 0, lastError: "", sources: {} };
  }

  async request(url, init = {}, timeoutMs = this.timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await this.fetch(url, { ...init, signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "FlightNMI/2 (+https://github.com/naman1911/FlightNMI)", ...(init.headers || {}) } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Fetch current positions. Throws only when every source fails. */
  async fetchPositions(now = Date.now()) {
    let lastErr = null;
    for (let k = 0; k < SOURCES.length; k++) {
      const i = (this.preferred + k) % SOURCES.length;
      const src = SOURCES[i];
      try {
        const json = await this.request(src.url);
        if (json?.error) throw new Error(String(json.error));
        const aircraft = (json.ac || []).map((a) => normalizeAircraft(a, now)).filter(Boolean);
        this.status.sources[src.name] = { ok: true, at: now };
        this.status.source = src.name;
        this.status.lastOkAt = now;
        this.status.lastError = "";
        this.preferred = i;
        return { aircraft, source: src.name };
      } catch (e) {
        const msg = describeError(e);
        this.status.sources[src.name] = { ok: false, at: now, error: msg };
        lastErr = new Error(`${src.name}: ${msg}`);
        log.warn("flight source failed", { source: src.name, error: msg });
      }
    }
    this.status.lastError = lastErr?.message || "no source reachable";
    throw lastErr || new Error("no source reachable");
  }

  /** Look up filed routes for airline-style callsigns we have not cached. */
  async fetchRoutes(aircraft, now = Date.now()) {
    for (const [cs, r] of this.routes) if (now - r.at > ROUTE_TTL_MS) this.routes.delete(cs);
    if (now < this.routesPausedUntil) return;
    const need = aircraft.filter((a) => !a.ground && AIRLINE_CALLSIGN.test(a.callsign) && !this.routes.has(a.callsign));
    const unique = [...new Map(need.map((a) => [a.callsign, a])).values()].slice(0, 100);
    if (!unique.length) return;
    try {
      const body = JSON.stringify({ planes: unique.map((a) => ({ callsign: a.callsign, lat: a.lat, lng: a.lon })) });
      const arr = await this.request(ROUTE_URL, { method: "POST", headers: { "content-type": "application/json" }, body }, 15000);
      const found = new Map((Array.isArray(arr) ? arr : []).map((r) => [String(r.callsign || "").trim().toUpperCase(), r]));
      for (const a of unique) this.routes.set(a.callsign, { route: parseRoute(found.get(a.callsign)), at: now });
      this.status.routesOkAt = now;
    } catch (e) {
      this.routesPausedUntil = now + ROUTE_BACKOFF_MS;
      this.status.routesError = describeError(e);
      log.warn("route lookup failed; approach geometry alone until it recovers", { error: this.status.routesError });
    }
  }

  /** Map of callsign -> route for the tracker (only entries with a route). */
  routeMap() {
    const m = new Map();
    for (const [cs, r] of this.routes) if (r.route) m.set(cs, r.route);
    return m;
  }
}
