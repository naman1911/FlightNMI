// Plain-text message templates. No HTML, no images: the same text goes to
// email and WhatsApp so every recipient sees exactly the same facts.
import { airportLabel } from "../airports.js";
import { CATEGORY_LABEL } from "../classify.js";
import { describeAircraft } from "../aircraft.js";

export function formatTime(ms, timeZone = "Asia/Kolkata") {
  const t = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(ms));
  return `${t} IST`;
}

export function formatDateTime(ms, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(ms)) + " IST";
}

const fmtInt = (n) => (n == null ? "–" : Math.round(n).toLocaleString("en-IN"));

function originText(route) {
  if (!route?.origin) return "";
  return ` from ${airportLabel(route.origin, route.originInfo)}`;
}

/** "IndiGo. Commercial flight." */
function operatorLine(event, cls) {
  const bits = [];
  if (cls.operator) bits.push(cls.operator);
  const cat = `${CATEGORY_LABEL[cls.category]} flight` + (cls.category === "other" || cls.reason.startsWith("freighter") || cls.reason.startsWith("operator") ? ` (${cls.reason})` : "");
  bits.push(cat);
  return bits.join(". ") + ".";
}

/** "Size: narrow-body jet, Airbus A321neo, about 232 seats (A21N, VT-IUX)." */
export function sizeLine(event, cls) {
  const a = describeAircraft({ type: event.aircraftType, category: event.emitterCategory, isCargo: cls.category === "cargo" });
  const ids = [event.aircraftType, event.reg].filter(Boolean).join(", ");
  const text = a.known ? a.text : a.text.charAt(0).toUpperCase() + a.text.slice(1);
  return `Size: ${text}${ids && a.known ? ` (${ids})` : event.reg && !a.known ? ` (${event.reg})` : ""}.`;
}

function aircraftLines(event, cls) {
  return [operatorLine(event, cls), sizeLine(event, cls)];
}

/**
 * @param {object} event tracker event
 * @param {object} cls classifyFlight() result
 * @param {object} opts { timeZone, publicUrl }
 * @returns {{subject:string, text:string}}
 */
export function describeEvent(event, cls, opts = {}) {
  const tz = opts.timeZone || "Asia/Kolkata";
  const who = `${cls.label}${originText(event.route)}`;
  const lines = [];
  let subject;

  if (event.type === "approaching") {
    const eta = event.etaMin;
    subject = eta != null && eta > 2 ? `NMI arrival: ${who} is about ${eta} min out` : `NMI arrival: ${who} is about to land`;
    lines.push(subject);
    lines.push(...aircraftLines(event, cls));
    if (eta != null) {
      lines.push(`Expected to land around ${formatTime(event.at + eta * 60000, tz)}${event.runway ? ` on runway ${event.runway}` : ""}.`);
    }
    lines.push(`Now ${fmtInt(event.distanceKm)} km from the airport at ${fmtInt(event.altFt)} ft.`);
    lines.push(event.basis === "route" ? "Identified from its filed route to Navi Mumbai." : "Identified from its descent toward NMI's runway.");
  } else if (event.type === "landed") {
    subject = `NMI landed: ${who} at ${formatTime(event.at, tz)}`;
    lines.push(subject);
    lines.push(...aircraftLines(event, cls));
    lines.push(
      (event.runway ? `Runway ${event.runway}. ` : "") +
        (event.confidence === "confirmed"
          ? "Seen on the ground at the airport."
          : "Its signal was lost on short final, as usually happens near the ground, so the landing time is estimated."),
    );
  } else if (event.type === "go_around") {
    subject = `NMI go-around: ${who} climbed away${event.runway ? ` from runway ${event.runway}` : ""} at ${formatTime(event.at, tz)}`;
    lines.push(subject);
    lines.push(...aircraftLines(event, cls));
    lines.push("It may make another approach or divert. You will get a separate alert if it lands.");
  } else {
    subject = `NMI: ${event.type} ${who}`;
    lines.push(subject);
  }

  lines.push("");
  lines.push(footer(opts));
  return { subject, text: lines.join("\n") };
}

export function footer(opts = {}) {
  const base = "FlightNMI. Positions come from community ADS-B receivers (adsb.lol, airplanes.live). Not an official airport source.";
  return opts.publicUrl ? `${base} ${opts.publicUrl}` : base;
}

export function describeOutage(minutes, details, opts = {}) {
  const subject = `FlightNMI: flight data has been unavailable for ${minutes} min`;
  const text = [subject, `Sources: ${details || "no source reachable"}.`, "Arrivals cannot be reported until a source recovers; you will be told when it does.", "", footer(opts)].join("\n");
  return { subject, text };
}

export function describeRecovery(minutes, source, opts = {}) {
  const subject = `FlightNMI: flight data is back (via ${source}) after ${minutes} min`;
  return { subject, text: [subject, "Arrival alerts have resumed.", "", footer(opts)].join("\n") };
}

export function describeTest(recipient, opts = {}) {
  const subject = `FlightNMI test message for ${recipient.name}`;
  return { subject, text: [subject, "If you can read this, arrival alerts to this address are working.", "", footer(opts)].join("\n") };
}
