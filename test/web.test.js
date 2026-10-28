import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWebServer } from "../src/web/http.js";
import { Store } from "../src/store.js";
import { Tracker } from "../src/tracker.js";
import { buildConfig } from "../src/config.js";

const TOKEN = "test-admin-token-123456";
let server, base, store, sent;

before(async () => {
  store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), "flightnmi-web-"))).load();
  sent = [];
  const config = buildConfig({ ADMIN_TOKEN: TOKEN, SMTP_HOST: "smtp.test", SMTP_USER: "u", SMTP_PASS: "p" });
  const flightData = { status: { source: "adsb.lol", sources: {}, lastError: "" } };
  const health = { startedAt: Date.now() - 60000, lastPollOkAt: Date.now(), pollCount: 3, pollError: "" };
  const notifier = { async sendTest(r) { sent.push(r.name); return [{ recipient: r.name, channel: "email", ok: true }]; } };
  server = createWebServer({ config, store, tracker: new Tracker(), flightData, notifier, health });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const cookieOf = (res) => (res.headers.get("set-cookie") || "").split(";")[0];
const post = (p, body, cookie = "") => fetch(base + p, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie }, body: new URLSearchParams(body) });
const csrfFrom = (html) => /name="csrf" value="([^"]+)"/.exec(html)[1];

test("status page and health respond without authentication", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /FlightNMI/);
  assert.match(html, /Working\./);
  assert.doesNotMatch(html, /<script/, "no JavaScript on the page");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  const health = await fetch(base + "/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const status = await (await fetch(base + "/api/status")).json();
  assert.equal(status.channels.email, true);
  assert.equal(status.sentToday.email, 0);
  assert.match(html, /Emails sent today \(IST\): 0\./);
  assert.equal(status.recipients.length, 0);
});

test("admin requires the token; wrong tokens are rejected", async () => {
  const page = await (await fetch(base + "/admin")).text();
  assert.match(page, /Admin token/);
  const bad = await post("/admin/login", { token: "nope" });
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("set-cookie"), null);
  const unauth = await post("/admin/recipients", { csrf: "x" });
  assert.equal(unauth.status, 401);
});

test("login, save recipients, send a test, log out", async () => {
  const login = await post("/admin/login", { token: TOKEN });
  assert.equal(login.status, 303);
  const cookie = cookieOf(login);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(cookie, /^nmi_admin=/);

  const adminHtml = await (await fetch(base + "/admin", { headers: { cookie } })).text();
  const csrf = csrfFrom(adminHtml);

  const badCsrf = await post("/admin/recipients", { csrf: "wrong", "r0.name": "A", "r0.email": "a@x.co" }, cookie);
  assert.equal(badCsrf.status, 403);
  assert.equal(store.recipients.length, 0);

  const invalid = await post("/admin/recipients", { csrf, "r0.name": "A", "r0.email": "bad" }, cookie);
  assert.equal(invalid.status, 400);
  assert.match(await invalid.text(), /not a valid email/);

  const saved = await post("/admin/recipients", {
    csrf, "r0.name": "Asha", "r0.email": "asha@x.co", "r0.enabled": "on", "r0.serviceAlerts": "on",
    "r0.events.approaching": "on", "r0.events.landed": "on", "r0.categories.commercial": "on", "r0.categories.cargo": "on", "r0.categories.other": "on",
    "r1.name": "Ravi", "r1.whatsapp": "9876543210", "r1.enabled": "on", "r1.events.landed": "on", "r1.categories.commercial": "on",
  }, cookie);
  assert.equal(saved.status, 303);
  assert.equal(store.recipients.length, 2);
  assert.equal(store.recipients[0].events.go_around, false, "unchecked boxes are saved as off");
  assert.equal(store.recipients[1].whatsapp, "+919876543210");
  assert.equal(store.recipients[1].categories.cargo, false);

  const testRes = await post("/admin/test", { csrf, id: store.recipients[0].id }, cookie);
  assert.equal(testRes.status, 200);
  assert.deepEqual(sent, ["Asha"]);
  assert.match(await testRes.text(), /Test sent to Asha by email/);

  const status = await (await fetch(base + "/api/status")).json();
  assert.equal(status.recipients[0].email, "as**@x.co", "addresses are masked publicly");

  const out = await post("/admin/logout", { csrf }, cookie);
  assert.equal(out.status, 303);
  assert.match(out.headers.get("set-cookie"), /Max-Age=0/);
});

test("login attempts are rate limited", async () => {
  for (let i = 0; i < 5; i++) await post("/admin/login", { token: "wrong" });
  const res = await post("/admin/login", { token: TOKEN });
  assert.equal(res.status, 429);
});
