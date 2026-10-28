import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store, validateRecipient, normalizePhone, MAX_RECIPIENTS } from "../src/store.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "flightnmi-"));

test("normalizePhone handles Indian numbers and whatsapp: prefixes", () => {
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.equal(normalizePhone("whatsapp:+91 98765-43210"), "+919876543210");
  assert.equal(normalizePhone("919876543210"), "+919876543210");
  assert.equal(normalizePhone("0044 7700 900123"), "+447700900123");
  assert.equal(normalizePhone(""), "");
});

test("validateRecipient requires a name and at least one address", () => {
  assert.equal(validateRecipient({ name: "", email: "a@b.co" }).ok, false);
  assert.equal(validateRecipient({ name: "A" }).ok, false);
  assert.equal(validateRecipient({ name: "A", email: "not-an-email" }).ok, false);
  assert.equal(validateRecipient({ name: "A", whatsapp: "12345" }).ok, false);
  const v = validateRecipient({ name: " Asha ", email: "ASHA@Example.com", whatsapp: "9876543210", events: { landed: false } });
  assert.equal(v.ok, true);
  assert.equal(v.value.email, "asha@example.com");
  assert.equal(v.value.whatsapp, "+919876543210");
  assert.deepEqual(v.value.events, { approaching: true, landed: false, go_around: true });
  assert.deepEqual(v.value.categories, { commercial: true, cargo: true, other: true });
  assert.equal(v.value.enabled, true);
});

test("store enforces the recipient limit and rejects duplicates", () => {
  const s = new Store(tmp()).load();
  const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => ({ name: `P${i}`, email: `p${i}@x.co` }));
  assert.equal(s.setRecipients(many).ok, false);
  assert.equal(s.setRecipients([{ name: "A", email: "a@x.co" }, { name: "B", email: "a@x.co" }]).ok, false);
  assert.equal(s.setRecipients([{ name: "A", email: "a@x.co" }, { name: "B", whatsapp: "+919876543210" }]).ok, true);
  assert.equal(s.recipients.length, 2);
});

test("state survives a reload and seen keys dedupe", () => {
  const dir = tmp();
  const s = new Store(dir).load();
  s.setRecipients([{ name: "A", email: "a@x.co" }]);
  const now = Date.now();
  assert.equal(s.markSeen("k1", now), true);
  assert.equal(s.markSeen("k1", now + 1000), false);
  s.addLog({ kind: "landed", subject: "x", deliveries: [] });
  s.flush();
  const again = new Store(dir).load();
  assert.equal(again.recipients[0].name, "A");
  assert.equal(again.log.length, 1);
  assert.equal(again.markSeen("k1"), false);
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith(".tmp")), "no temp files left behind");
});

test("seedIfEmpty only seeds an empty store", () => {
  const s = new Store(tmp()).load();
  assert.equal(s.seedIfEmpty([{ name: "A", email: "a@x.co" }]).seeded, true);
  assert.equal(s.seedIfEmpty([{ name: "B", email: "b@x.co" }]).seeded, false);
  assert.equal(s.recipients[0].name, "A");
});

test("old seen keys are pruned", () => {
  const s = new Store(tmp()).load();
  s.markSeen("old", 0);
  s.pruneSeen(24 * 3600 * 1000);
  assert.equal(s.hasSeen("old"), false);
});

test("daily delivery counters roll over by day", () => {
  const s = new Store(tmp()).load();
  s.bumpCounter("email", "2026-10-28");
  s.bumpCounter("email", "2026-10-28");
  assert.equal(s.counter("email", "2026-10-28"), 2);
  assert.equal(s.counter("email", "2026-10-29"), 0);
  s.bumpCounter("email", "2026-10-29");
  assert.equal(s.counter("email", "2026-10-29"), 1);
  assert.equal(s.counter("whatsapp", "2026-10-29"), 0);
});
