import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";
import { Notifier, mask } from "../src/notify/index.js";
import { classifyFlight } from "../src/classify.js";

const store = () => new Store(fs.mkdtempSync(path.join(os.tmpdir(), "flightnmi-"))).load();
const fakeChannel = (name, failTimes = 0) => {
  const sent = [];
  let fails = failTimes;
  return { name, sent, async send(msg) { if (fails-- > 0) throw new Error("temporary"); sent.push(msg); return { id: `${name}-${sent.length}` }; } };
};
const event = { type: "landed", at: 0, hex: "1", callsign: "IGO1", reg: "VT-A", aircraftType: "A20N", route: null, distanceKm: 1, altFt: 0, confidence: "confirmed", runway: "26" };
const cargoEvent = { ...event, callsign: "FDX1" };

test("mask hides most of an address", () => {
  assert.equal(mask("asha.k@example.com"), "as****@example.com");
  assert.equal(mask("+919876543210"), "+91*******210");
});

test("fan-out honours per-recipient channels and preferences", async () => {
  const s = store();
  s.setRecipients([
    { name: "Both", email: "b@x.co", whatsapp: "+919876543210" },
    { name: "EmailOnly", email: "e@x.co", categories: { cargo: false } },
    { name: "Paused", email: "p@x.co", enabled: false },
  ]);
  const email = fakeChannel("email"), whatsapp = fakeChannel("whatsapp");
  const n = new Notifier({ store: s, email, whatsapp, retryDelays: [] });
  const r1 = await n.sendEvent(event, classifyFlight({ callsign: "IGO1", type: "A20N" }));
  assert.equal(r1.length, 3);
  assert.deepEqual(r1.map((d) => `${d.recipient}/${d.channel}`), ["Both/email", "Both/whatsapp", "EmailOnly/email"]);
  assert.ok(r1.every((d) => d.ok));
  assert.equal(email.sent[0].to, "b@x.co");
  assert.match(email.sent[0].subject, /^NMI landed: 6E 1/);
  assert.equal(email.sent[0].text, whatsapp.sent[0].text, "same text on every channel");
  const r2 = await n.sendEvent(cargoEvent, classifyFlight({ callsign: "FDX1", type: "B77L" }));
  assert.deepEqual(r2.map((d) => d.recipient), ["Both", "Both"], "EmailOnly opted out of cargo");
  assert.equal(s.log.length, 2);
});

test("delivery retries, then records the failure without throwing", async () => {
  const s = store();
  s.setRecipients([{ name: "A", email: "a@x.co" }]);
  const flaky = fakeChannel("email", 2);
  const n = new Notifier({ store: s, email: flaky, retryDelays: [0, 0] });
  const r = await n.sendEvent(event, classifyFlight({ callsign: "IGO1" }));
  assert.equal(r[0].ok, true);
  assert.equal(r[0].attempts, 3);
  const dead = fakeChannel("email", 99);
  const n2 = new Notifier({ store: s, email: dead, retryDelays: [0] });
  const r2 = await n2.sendEvent(event, classifyFlight({ callsign: "IGO1" }));
  assert.equal(r2[0].ok, false);
  assert.equal(r2[0].error, "temporary");
  assert.equal(s.log[0].deliveries[0].ok, false);
});

test("an unconfigured channel is reported, not silently skipped", async () => {
  const s = store();
  s.setRecipients([{ name: "A", whatsapp: "+919876543210" }]);
  const n = new Notifier({ store: s, email: fakeChannel("email"), whatsapp: null, retryDelays: [] });
  const r = await n.sendEvent(event, classifyFlight({ callsign: "IGO1" }));
  assert.equal(r[0].ok, false);
  assert.match(r[0].error, /not configured/);
});

test("service alerts go only to recipients who want them; tests go to one person", async () => {
  const s = store();
  s.setRecipients([{ name: "A", email: "a@x.co", serviceAlerts: false }, { name: "B", email: "b@x.co" }]);
  const email = fakeChannel("email");
  const n = new Notifier({ store: s, email, retryDelays: [] });
  const r = await n.sendServiceAlert("outage", { minutes: 11, details: "adsb.lol: timed out" });
  assert.deepEqual(r.map((d) => d.recipient), ["B"]);
  const t = await n.sendTest(s.recipients[0]);
  assert.equal(t[0].recipient, "A");
  assert.match(email.sent[1].subject, /test message for A/);
});

test("events are delivered in order even when sent concurrently", async () => {
  const s = store();
  s.setRecipients([{ name: "A", email: "a@x.co" }]);
  const email = fakeChannel("email");
  const n = new Notifier({ store: s, email, retryDelays: [] });
  await Promise.all([
    n.sendEvent({ ...event, type: "approaching", etaMin: 10 }, classifyFlight({ callsign: "IGO1" })),
    n.sendEvent(event, classifyFlight({ callsign: "IGO1" })),
  ]);
  assert.match(email.sent[0].subject, /arrival/);
  assert.match(email.sent[1].subject, /landed/);
});
