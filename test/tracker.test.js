import { test } from "node:test";
import assert from "node:assert/strict";
import { Tracker, onFinal, onApproach } from "../src/tracker.js";
import { distanceKm, destination } from "../src/geo.js";
import { straightIn, snapshot, NMI, BOM } from "./helpers.js";

const T0 = Date.UTC(2026, 0, 15, 9, 0);
const routeToNMI = new Map([["IGO1234", { origin: "VIDP", dest: "VANM", originInfo: null, plausible: true }]]);
const routeToBOM = new Map([["IGO1234", { origin: "VIDP", dest: "VABB", originInfo: null, plausible: true }]]);

/** Run a built track through a tracker, collecting events. Returns {events, tracker, lastT}. */
function run(track, routes = new Map(), tracker = new Tracker({ noticeMinutes: 20 })) {
  const events = [];
  let lastT = 0;
  for (const { t, ac } of track) {
    events.push(...tracker.update([ac], routes, T0 + t * 1000));
    lastT = t;
  }
  return { events, tracker, lastT };
}

test("straight-in from the east: one approaching alert, then a confirmed landing on runway 26", () => {
  const track = straightIn({ fromBearing: 80, heading: 260 });
  const { events, tracker, lastT } = run(track, routeToNMI);
  const approaching = events.filter((e) => e.type === "approaching");
  assert.equal(approaching.length, 1);
  assert.equal(approaching[0].basis, "route");
  assert.ok(approaching[0].etaMin <= 20 && approaching[0].etaMin >= 12, `eta ${approaching[0].etaMin}`);
  assert.ok(approaching[0].distanceKm > 50, "alerted while still well out");
  assert.equal(events.filter((e) => e.type === "landed").length, 0, "not landed while airborne");

  // Now it appears on the ground at the airport.
  const ground = snapshot({ ground: true, alt: 0, gs: 30, lat: NMI.lat, lon: NMI.lon });
  const landed = tracker.update([ground], routeToNMI, T0 + (lastT + 20) * 1000);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].type, "landed");
  assert.equal(landed[0].confidence, "confirmed");
  assert.equal(landed[0].runway, "26");
  assert.equal(landed[0].route.origin, "VIDP");
  // Nothing more for the same flight.
  assert.deepEqual(tracker.update([ground], routeToNMI, T0 + (lastT + 40) * 1000), []);
});

test("without a route, a descent lined up with the runway is enough", () => {
  const { events } = run(straightIn({ fromBearing: 260, heading: 80, startKm: 40 }));
  const a = events.find((e) => e.type === "approaching");
  assert.ok(a, "approaching detected from geometry");
  assert.ok(["approach", "final"].includes(a.basis));
  assert.equal(a.runway ?? "08", "08");
});

test("signal lost on short final is reported as a presumed landing", () => {
  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 30 }).filter(({ ac }) => distanceKm(ac, NMI) > 4);
  const { events, tracker, lastT } = run(track, routeToNMI);
  assert.equal(events.filter((e) => e.type === "landed").length, 0);
  assert.deepEqual(tracker.update([], routeToNMI, T0 + (lastT + 30) * 1000), [], "not yet: only 30 s silent");
  const later = tracker.update([], routeToNMI, T0 + (lastT + 120) * 1000);
  assert.equal(later.length, 1);
  assert.equal(later[0].type, "landed");
  assert.equal(later[0].confidence, "presumed");
  assert.ok(later[0].at > T0 + lastT * 1000 && later[0].at <= T0 + (lastT + 240) * 1000, "landing time estimated shortly after last contact");
  assert.equal(tracker.inbound().length, 0);
});

test("a Mumbai CSMIA arrival on runway 27 is ignored", () => {
  // BOM's 09/27 centreline runs about 11 km north of NMI's.
  const { events } = run(straightIn({ airport: BOM, fromBearing: 90, heading: 270, startKm: 60 }));
  assert.deepEqual(events, []);
});

test("a Mumbai CSMIA arrival on runway 32 is ignored even though it passes close to NMI", () => {
  const track = straightIn({ airport: BOM, fromBearing: 140, heading: 320, startKm: 45 });
  assert.ok(track.some(({ ac }) => distanceKm(ac, NMI) < 12), "test track really does pass near NMI");
  const { events } = run(track, routeToBOM);
  assert.deepEqual(events, []);
  assert.deepEqual(run(track).events, [], "even with no route information");
});

test("a flight filed to Mumbai overflying at height is ignored", () => {
  const track = straightIn({ fromBearing: 100, heading: 280, startKm: 120, cruiseAlt: 7000 }).filter(({ ac }) => distanceKm(ac, NMI) > 15);
  const { events } = run(track, routeToBOM);
  assert.deepEqual(events, []);
});

test("a departure from NMI never produces an alert", () => {
  const tracker = new Tracker();
  let t = 0;
  const events = [];
  events.push(...tracker.update([snapshot({ ground: true, alt: 0, gs: 5, track: 80 })], new Map(), T0));
  for (let km = 1; km < 60; km += 2) {
    t += 20;
    const p = destination(NMI, 80, km);
    events.push(...tracker.update([snapshot({ lat: p.lat, lon: p.lon, alt: Math.min(12000, km * 300), gs: 200, track: 80, vr: 2000 })], new Map(), T0 + t * 1000));
  }
  assert.deepEqual(events, []);
});

test("go-around: one go_around alert, then a landing on the second try, approaching alerted once", () => {
  const tracker = new Tracker({ noticeMinutes: 20 });
  const first = straightIn({ fromBearing: 80, heading: 260, startKm: 40 }).filter(({ ac }) => distanceKm(ac, NMI) > 2.5);
  const { events, lastT } = run(first, routeToNMI, tracker);
  assert.equal(events.filter((e) => e.type === "approaching").length, 1);
  // Climb away over the field.
  let t = lastT, alt = 700;
  const all = [...events];
  for (let km = 2; km < 12; km += 1.5) {
    t += 20; alt += 500;
    const p = destination(NMI, 260, km);
    all.push(...tracker.update([snapshot({ lat: p.lat, lon: p.lon, alt, gs: 170, track: 260, vr: 1500 })], routeToNMI, T0 + t * 1000));
  }
  const ga = all.filter((e) => e.type === "go_around");
  assert.equal(ga.length, 1);
  assert.equal(ga[0].runway, "26");
  // Second approach from the east and a confirmed landing.
  const second = straightIn({ fromBearing: 80, heading: 260, startKm: 25 });
  for (const { t: dt, ac } of second) all.push(...tracker.update([ac], routeToNMI, T0 + (t + 300 + dt) * 1000));
  const end = t + 300 + second[second.length - 1].t + 20;
  all.push(...tracker.update([snapshot({ ground: true, alt: 0, gs: 20 })], routeToNMI, T0 + end * 1000));
  assert.equal(all.filter((e) => e.type === "approaching").length, 1, "approaching is not repeated");
  assert.equal(all.filter((e) => e.type === "landed").length, 1);
  assert.equal(all.filter((e) => e.type === "go_around").length, 1);
});

test("a new callsign on the same airframe starts a new flight", () => {
  const tracker = new Tracker();
  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 30 });
  const { lastT } = run(track, routeToNMI, tracker);
  tracker.update([snapshot({ ground: true, alt: 0 })], routeToNMI, T0 + (lastT + 20) * 1000);
  // Later it comes back as a different flight number.
  const back = straightIn({ fromBearing: 80, heading: 260, startKm: 30, callsign: "IGO5678" });
  const events = [];
  for (const { t, ac } of back) events.push(...tracker.update([ac], new Map(), T0 + (lastT + 4000 + t) * 1000));
  assert.equal(events.filter((e) => e.type === "approaching").length, 1);
  assert.equal(events[0].callsign, "IGO5678");
});

test("stale positions and aircraft that drift away are dropped", () => {
  const tracker = new Tracker();
  tracker.update([snapshot({ posAgeSec: 120 })], new Map(), T0);
  assert.equal(tracker.tracks.size, 0, "position older than a minute is not used");
  const far = destination(NMI, 80, 100);
  tracker.update([snapshot({ lat: far.lat, lon: far.lon, alt: 20000, vr: 0 })], new Map(), T0);
  assert.equal(tracker.tracks.size, 1);
  tracker.update([], new Map(), T0 + 16 * 60 * 1000);
  assert.equal(tracker.tracks.size, 0, "forgotten after 15 minutes out of sight");
});

test("inbound() lists approaching flights with ETA for the status page", () => {
  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 60 }).slice(0, 10);
  const { tracker } = run(track, routeToNMI);
  const list = tracker.inbound();
  assert.equal(list.length, 1);
  assert.equal(list[0].callsign, "IGO1234");
  assert.ok(list[0].etaMin > 0);
  assert.equal(list[0].route.origin, "VIDP");
});

test("onFinal and onApproach primitives", () => {
  const east = destination(NMI, 80, 10);
  assert.equal(onFinal(snapshot({ lat: east.lat, lon: east.lon, alt: 1800, track: 260 })).runway, "26");
  assert.equal(onFinal(snapshot({ lat: east.lat, lon: east.lon, alt: 1800, track: 80 })), null, "flying away is not final");
  assert.equal(onFinal(snapshot({ lat: east.lat, lon: east.lon, alt: 6000, track: 260 })), null, "too high");
  const west = destination(NMI, 260, 10);
  assert.equal(onFinal(snapshot({ lat: west.lat, lon: west.lon, alt: 1800, track: 80 })).runway, "08");
  const south = destination(NMI, 170, 20);
  assert.equal(onApproach(snapshot({ lat: south.lat, lon: south.lon, alt: 5000, track: 350, vr: -800 }), 20), true);
  assert.equal(onApproach(snapshot({ lat: south.lat, lon: south.lon, alt: 5000, track: 170, vr: -800 }), 20), false);
});
