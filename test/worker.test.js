import { test } from "node:test";
import assert from "node:assert/strict";
import { WatcherCore, DurableStore, STATE_KEY, RUNTIME_KEY, INTERNAL_HOST } from "../src/worker/core.js";
import { createFetchHandler } from "../src/web/fetch.js";
import { createWebApp } from "../src/web/app.js";
import { BaseStore } from "../src/store.js";
import { Tracker } from "../src/tracker.js";
import { buildConfig } from "../src/config.js";
import { straightIn, snapshot } from "./helpers.js";

/** In-memory stand-in for Durable Object storage. */
function fakeStorage() {
  const map = new Map();
  let alarm = null;
  return {
    map,
    async get(k) { return map.has(k) ? structuredClone(map.get(k)) : undefined; },
    async put(k, v) { map.set(k, structuredClone(v)); },
    async getAlarm() { return alarm; },
    async setAlarm(t) { alarm = t; },
    get alarm() { return alarm; },
  };
}

const toReadsb = (a) => ({ hex: a.hex, flight: a.callsign, r: a.reg, t: a.type, lat: a.lat, lon: a.lon, alt_baro: a.ground ? "ground" : a.alt, gs: a.gs, track: a.track, baro_rate: a.vr, seen_pos: 0 });

function fakeFetch(world) {
  return async (url, init) => {
    const u = String(url);
    if (u.includes("/v2/point/")) return { ok: true, status: 200, json: async () => ({ ac: world.aircraft.map(toReadsb) }) };
    if (u.includes("routeset")) return { ok: true, status: 200, json: async () => JSON.parse(init.body).planes.map((p) => ({ callsign: p.callsign, airport_codes: "VIDP-VANM" })) };
    if (u.includes("api.brevo.com")) { world.emails.push(JSON.parse(init.body)); return { ok: true, status: 201, text: async () => JSON.stringify({ messageId: "m" }) }; }
    throw new Error("unexpected " + u);
  };
}

const ENV = { ADMIN_TOKEN: "a-long-enough-secret-token", BREVO_API_KEY: "xkeysib-test", EMAIL_FROM: "FlightNMI <me@gmail.com>", POLL_SECONDS: "20", RECIPIENTS_JSON: '[{"name":"Asha","email":"asha@x.co"}]' };

test("DurableStore persists only when flushed and reloads", async () => {
  const storage = fakeStorage();
  const s = new DurableStore(storage);
  await s.load();
  s.setRecipients([{ name: "A", email: "a@x.co" }]);
  assert.equal(storage.map.has(STATE_KEY), false, "nothing written until flush");
  await s.flush();
  assert.equal(storage.map.get(STATE_KEY).recipients[0].name, "A");
  const again = await new DurableStore(storage).load();
  assert.equal(again.recipients[0].email, "a@x.co");
});

test("the core arms an alarm on init, polls on tick, emails, and persists everything", async () => {
  let now = Date.now();
  const storage = fakeStorage();
  const world = { aircraft: [], emails: [] };
  const core = new WatcherCore({ storage, env: ENV, fetchImpl: fakeFetch(world), now: () => now });
  await core.init();
  assert.equal(core.configError, null);
  assert.ok(storage.alarm > now - 1 && storage.alarm <= now + 1000, "alarm armed shortly after start");
  assert.equal(core.store.recipients[0].name, "Asha", "seeded from RECIPIENTS_JSON");
  assert.equal(storage.map.get(STATE_KEY).recipients.length, 1, "seed persisted");

  const track = straightIn({ fromBearing: 80, heading: 260, startKm: 120, callsign: "IGO6123", type: "A21N" });
  for (const { t, ac } of track) { now = now + 20000; world.aircraft = [ac]; await core.tick(); }
  assert.equal(storage.alarm, now + 20000, "next alarm set one poll interval ahead");
  assert.equal(world.emails.length, 1);
  assert.match(world.emails[0].subject, /^NMI arrival: 6E 6123 from Delhi/);
  assert.deepEqual(world.emails[0].to, [{ email: "asha@x.co" }]);
  const runtime = storage.map.get(RUNTIME_KEY);
  assert.equal(runtime.tracker.tracks.length, 1);
  assert.equal(storage.map.get(STATE_KEY).log.length, 1, "delivery log persisted");

  // A brand-new core (the Durable Object was evicted) picks up where it left off.
  const core2 = new WatcherCore({ storage, env: ENV, fetchImpl: fakeFetch(world), now: () => now });
  await core2.init();
  assert.equal(core2.service.tracker.inbound()[0].callsign, "IGO6123");
  assert.equal(core2.service.health.pollCount, track.length);
  world.aircraft = [snapshot({ callsign: "IGO6123", type: "A21N", ground: true, alt: 0, gs: 20 })];
  now += 20000; await core2.tick();
  assert.equal(world.emails.length, 2);
  assert.match(world.emails[1].subject, /^NMI landed: 6E 6123/);
});

test("the core serves pages, the health check and the internal cron hook", async () => {
  const storage = fakeStorage();
  const core = new WatcherCore({ storage, env: ENV, fetchImpl: fakeFetch({ aircraft: [], emails: [] }) });
  await core.init();
  const home = await core.handleFetch(new Request("https://flightnmi.example.workers.dev/"));
  assert.equal(home.status, 200);
  assert.match(await home.text(), /FlightNMI/);
  const health = await core.handleFetch(new Request("https://flightnmi.example.workers.dev/health"));
  assert.equal(health.status, 503, "no successful poll yet");
  const cron = await core.handleFetch(new Request(`https://${INTERNAL_HOST}/__cron`, { method: "POST" }));
  assert.equal(await cron.text(), "armed");
  const spoof = await core.handleFetch(new Request("https://flightnmi.example.workers.dev/__cron", { method: "POST" }));
  assert.equal(spoof.status, 404, "the internal hook is not reachable from outside");
});

test("missing secrets give a readable setup page instead of a crash", async () => {
  const core = new WatcherCore({ storage: fakeStorage(), env: { POLL_SECONDS: "20" } });
  await core.init();
  assert.ok(core.configError);
  const res = await core.handleFetch(new Request("https://x.workers.dev/"));
  assert.equal(res.status, 503);
  assert.match(await res.text(), /ADMIN_TOKEN is required/);
  await core.tick(); // must not throw
  assert.equal(await core.ensureArmed(), false);
});

test("SMTP settings are ignored on Cloudflare with a warning", async () => {
  const core = new WatcherCore({ storage: fakeStorage(), env: { ADMIN_TOKEN: "a-long-enough-secret-token", SMTP_HOST: "smtp.gmail.com", SMTP_USER: "u", SMTP_PASS: "p" } });
  await core.init();
  assert.equal(core.config.email, null);
});

test("fetch adapter: login flow with Secure cookie over https and body limit", async () => {
  const config = buildConfig({ ADMIN_TOKEN: "a-long-enough-secret-token" });
  const store = new BaseStore();
  const handle = createFetchHandler(createWebApp({ config, store, tracker: new Tracker(), flightData: { status: { source: "", sources: {}, lastError: "" } }, notifier: {}, health: { startedAt: 0, lastPollOkAt: 0, pollCount: 0 } }));
  const bad = await handle(new Request("https://x.workers.dev/admin/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "1.2.3.4" }, body: "token=wrong" }));
  assert.equal(bad.status, 401);
  const ok = await handle(new Request("https://x.workers.dev/admin/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "1.2.3.4" }, body: "token=a-long-enough-secret-token" }));
  assert.equal(ok.status, 303);
  const cookie = ok.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /; Secure/, "https request gets a Secure cookie");
  const admin = await handle(new Request("https://x.workers.dev/admin", { headers: { cookie: cookie.split(";")[0] } }));
  assert.match(await admin.text(), /Save recipients/);
  const huge = await handle(new Request("https://x.workers.dev/admin/login", { method: "POST", headers: { "content-length": String(1 << 20) }, body: "x" }));
  assert.equal(huge.status, 413);
});
