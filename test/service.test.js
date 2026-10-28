import { test } from "node:test";
import assert from "node:assert/strict";
import { ArrivalService } from "../src/service.js";
import { BaseStore } from "../src/store.js";
import { buildConfig } from "../src/config.js";
import { Tracker } from "../src/tracker.js";
import { FlightData } from "../src/sources.js";
import { straightIn, snapshot } from "./helpers.js";

const config = buildConfig({ ADMIN_TOKEN: "a-long-enough-secret-token", NOTICE_MINUTES: "20" });

/** readsb-style record from a test snapshot. */
const toReadsb = (a) => ({ hex: a.hex, flight: a.callsign, r: a.reg, t: a.type, lat: a.lat, lon: a.lon, alt_baro: a.ground ? "ground" : a.alt, gs: a.gs, track: a.track, baro_rate: a.vr, seen_pos: 0 });

/** A fetch that serves whatever aircraft list is current, plus a route lookup. */
function fakeWorld() {
  const world = { aircraft: [], calls: { positions: 0, routes: 0 }, fail: false };
  world.fetch = async (url, init) => {
    if (world.fail) throw new TypeError("fetch failed");
    if (String(url).includes("/v2/point/")) {
      world.calls.positions++;
      return { ok: true, status: 200, json: async () => ({ ac: world.aircraft.map(toReadsb) }) };
    }
    if (String(url).includes("routeset")) {
      world.calls.routes++;
      const planes = JSON.parse(init.body).planes;
      return { ok: true, status: 200, json: async () => planes.map((p) => ({ callsign: p.callsign, airport_codes: "VIDP-VANM", _airports: [{ icao: "VIDP", iata: "DEL", name: "Indira Gandhi Intl", location: "Delhi" }] })) };
    }
    throw new Error("unexpected url " + url);
  };
  return world;
}

const fakeEmail = () => { const sent = []; return { name: "email", sent, async send(m) { sent.push(m); return { id: "x" }; } }; };

test("a full arrival produces exactly one approaching and one landed email per recipient", async () => {
  const world = fakeWorld();
  const store = new BaseStore();
  store.setRecipients([{ name: "Asha", email: "asha@x.co" }, { name: "Ravi", email: "ravi@x.co" }]);
  const email = fakeEmail();
  const svc = new ArrivalService({ config, store, email, fetchImpl: world.fetch, retryDelays: [] });

  const T0 = Date.now();
  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 120, callsign: "IGO6123", type: "A21N" });
  for (const { t, ac } of track) { world.aircraft = [ac]; await svc.poll(T0 + t * 1000); }
  const last = track[track.length - 1].t;
  world.aircraft = [snapshot({ callsign: "IGO6123", type: "A21N", ground: true, alt: 0, gs: 20 })];
  await svc.poll(T0 + (last + 20) * 1000);
  await svc.notifier.idle();

  assert.equal(email.sent.length, 4);
  assert.match(email.sent[0].subject, /^NMI arrival: 6E 6123 from Delhi \(DEL\) is about \d+ min out$/);
  assert.match(email.sent[2].subject, /^NMI landed: 6E 6123 from Delhi \(DEL\) at /);
  assert.match(email.sent[2].text, /Size: narrow-body jet, Airbus A321neo, about 232 seats/);
  assert.deepEqual(email.sent.map((m) => m.to), ["asha@x.co", "ravi@x.co", "asha@x.co", "ravi@x.co"]);
  assert.equal(world.calls.routes, 1, "route looked up once and cached");
  assert.equal(svc.health.lastPollOkAt, T0 + (last + 20) * 1000);
  assert.equal(store.counter("email", new Date().toISOString().slice(0, 10)) >= 0, true);
});

test("a restart in the middle of a flight does not repeat alerts", async () => {
  const world = fakeWorld();
  const store = new BaseStore();
  store.setRecipients([{ name: "Asha", email: "asha@x.co" }]);
  const email = fakeEmail();
  const T0 = Date.now();
  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 120 });
  let svc = new ArrivalService({ config, store, email, fetchImpl: world.fetch, retryDelays: [] });
  const half = Math.floor(track.length / 2);
  for (const { t, ac } of track.slice(0, half)) { world.aircraft = [ac]; await svc.poll(T0 + t * 1000); }
  await svc.notifier.idle();
  assert.equal(email.sent.length, 1, "approaching sent before the restart");

  // "Restart": new service, same store, fresh tracker (as on Node) ...
  svc = new ArrivalService({ config, store, email, fetchImpl: world.fetch, retryDelays: [] });
  for (const { t, ac } of track.slice(half)) { world.aircraft = [ac]; await svc.poll(T0 + t * 1000); }
  await svc.notifier.idle();
  assert.equal(email.sent.length, 1, "the approaching alert is not sent again");
});

test("snapshot and restore carry the tracker, routes and health across a stop", async () => {
  const world = fakeWorld();
  const store = new BaseStore();
  const svc = new ArrivalService({ config, store, fetchImpl: world.fetch, retryDelays: [] });
  const T0 = Date.now();
  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 60 });
  for (const { t, ac } of track.slice(0, 5)) { world.aircraft = [ac]; await svc.poll(T0 + t * 1000); }
  const snap = JSON.parse(JSON.stringify(svc.snapshot()));

  const again = new ArrivalService({ config, store, fetchImpl: world.fetch, retryDelays: [] }).restore(snap);
  assert.equal(again.tracker.inbound().length, 1);
  assert.equal(again.tracker.tracks.get("800abc").minAlt, svc.tracker.tracks.get("800abc").minAlt);
  assert.equal(again.flightData.routeMap().get("IGO1234").dest, "VANM");
  assert.equal(again.health.pollCount, 5);
  assert.equal(again.health.startedAt, svc.health.startedAt);
  // Infinity survives the JSON round trip for a brand-new track.
  const fresh = new Tracker(); fresh.update([snapshot({ hex: "abc123", alt: 30000, vr: 0 })], new Map(), T0);
  assert.equal(new Tracker().restore(JSON.parse(JSON.stringify(fresh.toJSON()))).tracks.get("abc123").minAlt, 30000);
  assert.equal(new FlightData().restore({ preferred: 99 }).preferred, 0, "bad values ignored");
});

test("an outage is announced once after ten minutes and recovery once", async () => {
  const world = fakeWorld();
  const store = new BaseStore();
  store.setRecipients([{ name: "Asha", email: "asha@x.co" }]);
  const email = fakeEmail();
  const svc = new ArrivalService({ config, store, email, fetchImpl: world.fetch, retryDelays: [] });
  const T0 = Date.now();
  await svc.poll(T0);
  world.fail = true;
  for (let m = 1; m <= 12; m++) await svc.poll(T0 + m * 60000);
  await svc.notifier.idle();
  assert.equal(email.sent.length, 1);
  assert.match(email.sent[0].subject, /flight data has been unavailable for 1[0-2] min/);
  world.fail = false;
  await svc.poll(T0 + 13 * 60000);
  await svc.poll(T0 + 14 * 60000);
  await svc.notifier.idle();
  assert.equal(email.sent.length, 2);
  assert.match(email.sent[1].subject, /flight data is back/);
  assert.equal(svc.health.outageSince, 0);
});
