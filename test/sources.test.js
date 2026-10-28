import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeAircraft, parseRoute, FlightData, SOURCES } from "../src/sources.js";

test("normalizeAircraft maps readsb fields and ground state", () => {
  const a = normalizeAircraft({ hex: "800ABC", flight: "igo123 ", r: "VT-ABC", t: "a20n", alt_baro: "ground", gs: 12, track: 80, lat: 19, lon: 73, seen_pos: 1.2, dbFlags: 1, category: "A3" }, 1000);
  assert.equal(a.hex, "800abc");
  assert.equal(a.callsign, "IGO123");
  assert.equal(a.type, "A20N");
  assert.equal(a.ground, true);
  assert.equal(a.alt, 0);
  assert.equal(a.military, true);
  assert.equal(a.posAgeSec, 1.2);
  const b = normalizeAircraft({ hex: "1", lat: 1, lon: 2, alt_geom: 5000, geom_rate: -600 });
  assert.equal(b.alt, 5000);
  assert.equal(b.vr, -600);
  assert.equal(normalizeAircraft({ hex: "nopos" }), null);
});

test("parseRoute picks the leg that ends at NMI", () => {
  const r = parseRoute({ airport_codes: "VIDP-VANM", _airports: [{ icao: "VIDP", iata: "DEL", name: "Indira Gandhi Intl", location: "Delhi" }] });
  assert.equal(r.dest, "VANM");
  assert.equal(r.origin, "VIDP");
  assert.equal(r.originInfo.iata, "DEL");
  assert.equal(parseRoute({ airport_codes: "VANM-VIDP" }).dest, "VIDP");
  assert.equal(parseRoute({ airport_codes: "VOBL-VANM-VIDP" }).origin, "VOBL");
  assert.equal(parseRoute({ airport_codes: "unknown" }), null);
  assert.equal(parseRoute({ airport_codes: "VIDP-VANM", plausible: 0 }).plausible, false);
});

function fakeFetch(handlers) {
  return async (url) => {
    const h = handlers.find(([m]) => url.includes(m));
    if (!h) throw new TypeError("fetch failed");
    const [, status, body] = h;
    return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
  };
}

test("fetchPositions falls back to the second source and remembers it", async () => {
  const fd = new FlightData({ fetchImpl: fakeFetch([["adsb.lol/v2", 503, {}], ["airplanes.live", 200, { ac: [{ hex: "1", lat: 19, lon: 73, alt_baro: 3000 }] }]]) });
  const r = await fd.fetchPositions(1000);
  assert.equal(r.source, "airplanes.live");
  assert.equal(r.aircraft.length, 1);
  assert.equal(fd.preferred, SOURCES.findIndex((s) => s.name === "airplanes.live"));
  assert.equal(fd.status.sources["adsb.lol"].ok, false);
});

test("fetchPositions throws when every source fails", async () => {
  const fd = new FlightData({ fetchImpl: fakeFetch([]) });
  await assert.rejects(fd.fetchPositions(), /fetch failed/);
  assert.match(fd.status.lastError, /airplanes.live/);
});

test("fetchRoutes caches results and backs off on failure", async () => {
  let calls = 0;
  const fd = new FlightData({ fetchImpl: async (url, init) => {
    calls++;
    const planes = JSON.parse(init.body).planes;
    return { ok: true, status: 200, json: async () => planes.map((p) => ({ callsign: p.callsign, airport_codes: "VIDP-VANM" })) };
  } });
  const ac = [{ callsign: "IGO123", lat: 19, lon: 73, ground: false }, { callsign: "VTABC", lat: 19, lon: 73, ground: false }];
  await fd.fetchRoutes(ac, 1000);
  assert.equal(calls, 1);
  assert.equal(fd.routeMap().get("IGO123").dest, "VANM");
  assert.equal(fd.routeMap().has("VTABC"), false, "registration-style callsigns are not looked up");
  await fd.fetchRoutes(ac, 2000);
  assert.equal(calls, 1, "cached");
  const failing = new FlightData({ fetchImpl: async () => { throw new Error("boom"); } });
  await failing.fetchRoutes([{ callsign: "IGO999", lat: 1, lon: 1 }], 1000);
  await failing.fetchRoutes([{ callsign: "IGO998", lat: 1, lon: 1 }], 2000);
  assert.ok(failing.routesPausedUntil > 2000);
  assert.equal(failing.status.routesError, "boom");
});

test("fetch is invoked as a plain function, as Cloudflare Workers require", async () => {
  const strictFetch = async function () {
    if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
    return { ok: true, status: 200, json: async () => ({ ac: [] }) };
  };
  const fd = new FlightData({ fetchImpl: strictFetch });
  const r = await fd.fetchPositions(1000);
  assert.equal(r.source, "adsb.lol");
});
