import { test } from "node:test";
import assert from "node:assert/strict";
import { describeEvent, describeOutage, describeTest, formatTime } from "../src/notify/format.js";
import { classifyFlight } from "../src/classify.js";

const route = { origin: "VIDP", dest: "VANM", originInfo: null, plausible: true };
const base = { hex: "800abc", callsign: "IGO6123", reg: "VT-ABC", aircraftType: "A21N", route, distanceKm: 95.4, altFt: 12000, at: Date.UTC(2026, 0, 15, 9, 0) };
const cls = classifyFlight({ callsign: "IGO6123", type: "A21N" });

test("formatTime renders IST", () => {
  assert.equal(formatTime(Date.UTC(2026, 0, 15, 9, 0)), "14:30 IST");
});

test("approaching message says who, from where, when", () => {
  const { subject, text } = describeEvent({ ...base, type: "approaching", etaMin: 18, basis: "route" }, cls, { publicUrl: "https://nmi.example" });
  assert.equal(subject, "NMI arrival: 6E 6123 from Delhi (DEL) is about 18 min out");
  assert.match(text, /IndiGo\. A21N \(VT-ABC\)\. Commercial flight\./);
  assert.match(text, /Expected to land around 14:48 IST/);
  assert.match(text, /95 km from the airport at 12,000 ft/);
  assert.match(text, /filed route/);
  assert.match(text, /https:\/\/nmi\.example/);
  assert.doesNotMatch(text, /<[a-z]/, "plain text only");
});

test("landed message distinguishes confirmed from presumed", () => {
  const a = describeEvent({ ...base, type: "landed", confidence: "confirmed", runway: "26" }, cls);
  assert.equal(a.subject, "NMI landed: 6E 6123 from Delhi (DEL) at 14:30 IST");
  assert.match(a.text, /Runway 26\. Seen on the ground/);
  const b = describeEvent({ ...base, type: "landed", confidence: "presumed" }, cls);
  assert.match(b.text, /signal was lost on short final/);
});

test("go-around and cargo labelling", () => {
  const cargo = classifyFlight({ callsign: "FDX5231", type: "B77L" });
  const { subject, text } = describeEvent({ ...base, callsign: "FDX5231", type: "go_around", runway: "08", route: null }, cargo);
  assert.equal(subject, "NMI go-around: FX 5231 climbed away from runway 08 at 14:30 IST");
  assert.match(text, /FedEx Express\. A21N \(VT-ABC\)\. Cargo flight\./);
});

test("service and test messages", () => {
  assert.match(describeOutage(12, "adsb.lol: timed out").text, /unavailable for 12 min/);
  assert.match(describeTest({ name: "Asha" }).subject, /test message for Asha/);
});
