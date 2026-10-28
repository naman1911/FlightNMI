import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceKm, bearing, headingDiff, runwayFrame, destination } from "../src/geo.js";
import { NMI, BOM } from "../src/airports.js";

test("NMI and BOM are about 22 km apart", () => {
  const d = distanceKm(NMI, BOM);
  assert.ok(d > 20 && d < 25, `got ${d}`);
});

test("bearing from NMI to BOM is north-west", () => {
  const b = bearing(NMI, BOM);
  assert.ok(b > 290 && b < 330, `got ${b}`);
});

test("headingDiff wraps around 360", () => {
  assert.equal(headingDiff(350, 10), 20);
  assert.equal(headingDiff(80, 260), 180);
  assert.equal(headingDiff(0, 0), 0);
});

test("runwayFrame: east of the field is positive along, north is negative cross", () => {
  const east = destination(NMI, 80, 10);
  const f = runwayFrame(NMI, 80, east);
  assert.ok(Math.abs(f.along - 10) < 0.2, `along ${f.along}`);
  assert.ok(Math.abs(f.cross) < 0.2, `cross ${f.cross}`);
  const north = destination(NMI, 350, 10); // perpendicular to the runway
  const g = runwayFrame(NMI, 80, north);
  assert.ok(Math.abs(g.along) < 0.2 && Math.abs(Math.abs(g.cross) - 10) < 0.2, JSON.stringify(g));
});

test("destination and distanceKm agree", () => {
  const p = destination(NMI, 123, 50);
  assert.ok(Math.abs(distanceKm(NMI, p) - 50) < 0.3);
});
