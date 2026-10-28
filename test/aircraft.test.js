import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAircraft, AIRCRAFT, SIZE_LABEL } from "../src/aircraft.js";

test("every table row is well formed", () => {
  for (const [code, row] of Object.entries(AIRCRAFT)) {
    assert.ok(/^[A-Z0-9]{2,6}$/.test(code), code);
    assert.ok(row[0] && typeof row[0] === "string", `${code} name`);
    assert.ok(SIZE_LABEL[row[1]], `${code} size class ${row[1]}`);
    assert.ok(row[2] == null || (Number.isInteger(row[2]) && row[2] > 0), `${code} seats`);
    assert.ok(row[3] == null || row[3] > 0, `${code} payload`);
  }
});

test("passenger airliners: class and seats", () => {
  assert.equal(describeAircraft({ type: "A20N" }).text, "narrow-body jet, Airbus A320neo, about 186 seats");
  assert.equal(describeAircraft({ type: "b789" }).text, "wide-body jet, Boeing 787-9 Dreamliner, about 290 seats");
  assert.equal(describeAircraft({ type: "A388" }).text, "very large wide-body jet, Airbus A380, about 520 seats");
  assert.equal(describeAircraft({ type: "AT76" }).text, "regional turboprop, ATR 72-600, about 72 seats");
});

test("cargo flights report payload instead of seats", () => {
  assert.equal(describeAircraft({ type: "B77L", isCargo: true }).text, "wide-body freighter, Boeing 777-200LR / 777F, about 102 tonnes of cargo");
  assert.equal(describeAircraft({ type: "B77L", isCargo: false }).text, "wide-body jet, Boeing 777-200LR / 777F, about 300 seats");
  assert.equal(describeAircraft({ type: "B748", isCargo: true }).text, "very large wide-body freighter, Boeing 747-8, about 134 tonnes of cargo");
  assert.equal(describeAircraft({ type: "B738", isCargo: true }).text, "narrow-body freighter, Boeing 737-800, about 23 tonnes of cargo");
  assert.equal(describeAircraft({ type: "A21N", isCargo: true }).text, "narrow-body freighter, Airbus A321neo", "no payload figure known, so none is invented");
  assert.equal(describeAircraft({ type: "A124" }).text, "very large wide-body jet, Antonov An-124, about 150 tonnes of cargo");
  assert.equal(describeAircraft({ type: "C17", isCargo: false }).text, "military transport, Boeing C-17 Globemaster, about 77 tonnes of cargo");
});

test("small aircraft say passengers, not seats", () => {
  assert.equal(describeAircraft({ type: "C56X" }).text, "business jet, Cessna Citation XLS, up to 9 passengers");
  assert.equal(describeAircraft({ type: "EC35" }).text, "helicopter, Airbus H135, up to 7 passengers");
  assert.equal(describeAircraft({ type: "C172" }).text, "light aircraft, Cessna 172, up to 4 passengers");
});

test("unknown types fall back to the ADS-B weight category", () => {
  const a = describeAircraft({ type: "XY12", category: "A5" });
  assert.equal(a.known, false);
  assert.equal(a.text, "heavy aircraft (over 136 tonnes), wide-body sized, type XY12 (not in our list)");
  assert.equal(describeAircraft({ type: "", category: "" }).text, "size unknown, type not broadcast");
  assert.equal(describeAircraft({ type: "XY12", category: "A7" }).size, "helicopter");
});
