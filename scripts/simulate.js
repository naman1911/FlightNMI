#!/usr/bin/env node
// Replays a synthetic arrival through the real tracker and message
// formatter so you can see exactly what recipients would receive, with no
// network and no credentials. Run:  npm run simulate
import { Tracker } from "../src/tracker.js";
import { classifyFlight } from "../src/classify.js";
import { describeEvent } from "../src/notify/format.js";
import { straightIn, snapshot } from "../test/helpers.js";

const T0 = Date.now();
const tracker = new Tracker({ noticeMinutes: 20 });
const routes = new Map([["IGO6123", { origin: "VIDP", dest: "VANM", originInfo: null, plausible: true }]]);
const track = straightIn({ fromBearing: 80, heading: 260, startKm: 150, callsign: "IGO6123", type: "A21N", reg: "VT-IUX" });

const show = (ev) => {
  const cls = classifyFlight({ callsign: ev.callsign, type: ev.aircraftType, reg: ev.reg });
  const { text } = describeEvent(ev, cls, { publicUrl: "https://flightnmi.example" });
  console.log(`\n--- event: ${ev.type} (detected ${Math.round((ev.at - T0) / 60000)} min into the replay) ---\n${text}`);
};

let lastT = 0;
for (const { t, ac } of track) {
  for (const ev of tracker.update([ac], routes, T0 + t * 1000)) show(ev);
  lastT = t;
}
for (const ev of tracker.update([snapshot({ callsign: "IGO6123", type: "A21N", reg: "VT-IUX", ground: true, alt: 0, gs: 25 })], routes, T0 + (lastT + 20) * 1000)) show(ev);
console.log("\nReplay finished. A real run polls live data every POLL_SECONDS and sends these texts by email / WhatsApp.");
