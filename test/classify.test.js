import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyFlight } from "../src/classify.js";

test("IndiGo passenger flight is commercial with a readable label", () => {
  const c = classifyFlight({ callsign: "IGO6123", type: "A21N" });
  assert.equal(c.category, "commercial");
  assert.equal(c.label, "6E 6123");
  assert.equal(c.operator, "IndiGo");
});

test("all-cargo operator is cargo regardless of type", () => {
  const c = classifyFlight({ callsign: "FDX5231", type: "B77L" });
  assert.equal(c.category, "cargo");
  assert.equal(c.label, "FX 5231");
  const b = classifyFlight({ callsign: "BDA201", type: "B737" });
  assert.equal(b.category, "cargo");
  assert.equal(b.operator, "Blue Dart Aviation");
});

test("mixed operator: freighter type is cargo, widebody passenger type is commercial", () => {
  assert.equal(classifyFlight({ callsign: "QTR8301", type: "B77L" }).category, "cargo");
  assert.equal(classifyFlight({ callsign: "QTR556", type: "B788" }).category, "commercial");
  assert.equal(classifyFlight({ callsign: "UAE9830", type: "B744" }).category, "cargo");
});

test("non-airline callsigns, helicopters and military are 'other'", () => {
  assert.equal(classifyFlight({ callsign: "VTABC", type: "C56X" }).category, "other");
  assert.equal(classifyFlight({ callsign: "", reg: "N123AB", type: "GLF6" }).label, "N123AB");
  assert.equal(classifyFlight({ callsign: "IGO123", type: "A21N", category: "A7" }).reason, "helicopter");
  assert.equal(classifyFlight({ callsign: "IGO123", type: "EC35" }).reason, "helicopter");
  assert.equal(classifyFlight({ callsign: "IFC123", type: "C17", military: true }).reason, "military");
});

test("unknown airline prefix is reported honestly, not guessed", () => {
  const c = classifyFlight({ callsign: "ZZZ123", type: "B738" });
  assert.equal(c.category, "other");
  assert.match(c.reason, /ZZZ not in our list/);
  assert.equal(c.label, "ZZZ123");
});
