// HTML pages. Plain, server-rendered, no JavaScript, no external assets.
import { airportLabel } from "../airports.js";
import { classifyFlight } from "../classify.js";
import { EVENT_TYPES, CATEGORIES, MAX_RECIPIENTS } from "../store.js";
import { mask } from "../notify/index.js";
import { formatDateTime, dayKey } from "../notify/format.js";
import { describeAircraft } from "../aircraft.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const CSS = `
  body{font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:860px;margin:0 auto;padding:16px;color:#111;background:#fff}
  h1{font-size:1.5rem;margin:.2em 0}h2{font-size:1.15rem;margin:1.6em 0 .4em}
  table{border-collapse:collapse;width:100%;font-size:.95rem}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}
  th{font-weight:600;background:#f4f4f4}.muted{color:#555}.ok{color:#0a6b2a}.bad{color:#a30000}.warn{color:#8a5a00}
  fieldset{border:1px solid #ccc;padding:10px 14px;margin:0 0 14px}legend{font-weight:600}
  label{display:inline-block;margin:4px 14px 4px 0}input[type=text],input[type=email],input[type=tel],input[type=password]{font:inherit;padding:5px 7px;border:1px solid #999;width:100%;max-width:340px}
  button{font:inherit;padding:6px 14px;border:1px solid #333;background:#f4f4f4;cursor:pointer}.row{display:flex;flex-wrap:wrap;gap:12px}.row>div{flex:1 1 240px}
  .notice{padding:10px 12px;border:1px solid #bbb;background:#fafafa;margin:12px 0}footer{margin-top:40px;font-size:.9rem}a{color:#0645ad}
  @media (prefers-color-scheme:dark){body{background:#111;color:#eee}th{background:#222}td,th{border-color:#333}.notice{background:#1a1a1a;border-color:#444}button{background:#222;color:#eee;border-color:#777}input{background:#1a1a1a;color:#eee}.muted{color:#aaa}.ok{color:#5fd38a}.bad{color:#ff7b7b}.warn{color:#e8b85a}a{color:#8ab4f8}}
`;

export function layout(title, body, { refresh = 0 } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${refresh ? `<meta http-equiv="refresh" content="${refresh}">` : ""}<meta name="robots" content="noindex"><style>${CSS}</style></head>
<body>${body}
<footer class="muted">FlightNMI watches aircraft arriving at Navi Mumbai International Airport (NMI / VANM) using community ADS-B data from adsb.lol and airplanes.live.
It is not an official airport or airline source: coverage has gaps and a flight can be missed or reported late. For gate and schedule information use the airline or airport.</footer>
</body></html>`;
}

const ago = (ms, now) => {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${(s / 3600).toFixed(1)} h ago`;
};

export function statusPage({ health, flightData, tracker, store, config, now = Date.now() }) {
  const inbound = tracker.inbound();
  const healthy = health.lastPollOkAt && now - health.lastPollOkAt < (config.pollSeconds * 3 + 60) * 1000;
  const svc = healthy
    ? `<span class="ok">Working.</span> Last update ${ago(health.lastPollOkAt, now)} from ${esc(flightData.status.source)}.`
    : `<span class="bad">Problem:</span> no flight data since ${ago(health.lastPollOkAt, now)}. ${esc(flightData.status.lastError || health.pollError || "")}`;
  const channels = [config.email ? "email" : null, config.whatsapp ? `WhatsApp (${config.whatsapp.provider})` : null].filter(Boolean);
  const recipients = store.recipients;
  const today = dayKey(now, config.timeZone);
  const emailsToday = store.counter("email", today);
  const gmail = config.email && /gmail\.com$|googlemail\.com$/i.test(config.email.host);
  const emailNote = config.email
    ? ` Emails sent today (IST): ${emailsToday}.` + (gmail ? ` <span class="${emailsToday >= 400 ? "warn" : "muted"}">Gmail allows about 500 a day${emailsToday >= 400 ? ": close to the limit. Untick \"Approaching\" for some recipients to halve the volume" : ""}.</span>` : "")
    : "";

  const inboundRows = inbound.length
    ? inbound.map((f) => {
        const cls = classifyFlight({ callsign: f.callsign, type: f.type });
        const size = describeAircraft({ type: f.type, isCargo: cls.category === "cargo" });
        return `<tr><td>${esc(cls.label)}<br><span class="muted">${esc(cls.operator || cls.reason)}</span></td>
<td>${esc(f.route?.origin ? airportLabel(f.route.origin, f.route.originInfo) : "–")}</td>
<td>${size.known ? `${esc(size.name)} (${esc(f.type)})<br><span class="muted">${esc(size.size)}${size.capacity ? `, ${esc(size.capacity)}` : ""}</span>` : esc(f.type || "–")}</td>
<td>${esc(cls.category)}</td><td>${f.phase === "final" ? `On final${f.runway ? `, runway ${esc(f.runway)}` : ""}` : "Approaching"}</td>
<td>${f.etaMin != null ? `~${f.etaMin} min` : "–"}</td><td>${Math.round(f.distanceKm)} km, ${f.altFt == null ? "–" : Math.round(f.altFt).toLocaleString("en-IN")} ft</td></tr>`;
      }).join("")
    : `<tr><td colspan="7" class="muted">Nothing heading for NMI right now.</td></tr>`;

  const logRows = store.log.slice(0, 50).map((e) => {
    const deliveries = (e.deliveries || []).map((d) => `<span class="${d.ok ? "ok" : "bad"}">${esc(d.recipient)} (${esc(d.channel)}) ${d.ok ? "✓" : "✗ " + esc(d.error || "")}</span>`).join("<br>") || `<span class="muted">${esc(e.note || "–")}</span>`;
    return `<tr><td>${esc(formatDateTime(e.at, config.timeZone))}</td><td>${esc(e.subject)}</td><td>${deliveries}</td></tr>`;
  }).join("") || `<tr><td colspan="3" class="muted">No alerts sent yet.</td></tr>`;

  const body = `<h1>FlightNMI</h1><p class="muted">Arrival alerts for Navi Mumbai International Airport. <a href="/admin">Manage recipients</a></p>
<h2>Service</h2><p>${svc}</p>
<p>Running for ${ago(health.startedAt, now).replace(" ago", "")}. ${health.pollCount} data checks, every ${config.pollSeconds} s.
Alerts go out by ${channels.length ? esc(channels.join(" and ")) : '<span class="bad">nothing (no email or WhatsApp configured)</span>'} to ${recipients.length} of ${MAX_RECIPIENTS} possible recipients:
${recipients.length ? recipients.map((r) => `${esc(r.name)}${r.enabled ? "" : " (paused)"}`).join(", ") : '<span class="warn">none yet</span>'}.${emailNote}</p>
<h2>Heading for NMI now</h2>
<table><tr><th>Flight</th><th>From</th><th>Aircraft</th><th>Kind</th><th>Status</th><th>ETA</th><th>Position</th></tr>${inboundRows}</table>
<h2>Recent alerts</h2>
<table><tr><th>When</th><th>Alert</th><th>Delivered</th></tr>${logRows}</table>`;
  return layout("FlightNMI – Navi Mumbai arrivals", body, { refresh: 30 });
}

export function loginPage(error = "") {
  return layout("FlightNMI – sign in", `<h1>FlightNMI admin</h1>
${error ? `<p class="notice bad">${esc(error)}</p>` : ""}
<form method="post" action="/admin/login"><label>Admin token<br><input type="password" name="token" autocomplete="current-password" required></label><br><button type="submit">Sign in</button></form>
<p><a href="/">Back to status</a></p>`);
}

const EVENT_LABELS = { approaching: "Approaching (about to land)", landed: "Landed", go_around: "Go-around / missed approach" };
const CATEGORY_LABELS = { commercial: "Commercial passenger", cargo: "Cargo", other: "Other (private, military, helicopters, unknown)" };

export function adminPage({ store, config, csrf, notice = "", error = "" }) {
  const recipients = store.recipients;
  const blocks = [];
  for (let i = 0; i < MAX_RECIPIENTS; i++) {
    const r = recipients[i] || { name: "", email: "", whatsapp: "", enabled: true, events: {}, categories: {}, serviceAlerts: true, id: "" };
    const checked = (v) => (v === false ? "" : "checked");
    blocks.push(`<fieldset><legend>Recipient ${i + 1}${r.name ? `: ${esc(r.name)}` : ""}</legend>
<input type="hidden" name="r${i}.id" value="${esc(r.id)}">
<div class="row"><div><label>Name<br><input type="text" name="r${i}.name" value="${esc(r.name)}" maxlength="60"></label></div>
<div><label>Email<br><input type="email" name="r${i}.email" value="${esc(r.email)}"></label></div>
<div><label>WhatsApp number (with country code)<br><input type="tel" name="r${i}.whatsapp" value="${esc(r.whatsapp)}" placeholder="+919876543210"></label></div></div>
<div><label><input type="checkbox" name="r${i}.enabled" ${checked(r.enabled)}> Active</label>
<label><input type="checkbox" name="r${i}.serviceAlerts" ${checked(r.serviceAlerts)}> Tell me when flight data goes down or comes back</label></div>
<div><span class="muted">Alerts:</span> ${EVENT_TYPES.map((e) => `<label><input type="checkbox" name="r${i}.events.${e}" ${checked(r.events?.[e])}> ${EVENT_LABELS[e]}</label>`).join("")}</div>
<div><span class="muted">Flight kinds:</span> ${CATEGORIES.map((c) => `<label><input type="checkbox" name="r${i}.categories.${c}" ${checked(r.categories?.[c])}> ${CATEGORY_LABELS[c]}</label>`).join("")}</div>
${r.id ? `<button type="submit" form="test-${i}">Send a test message to ${esc(r.name)}</button>` : ""}
</fieldset>`);
  }
  const testForms = recipients.map((r, i) => `<form id="test-${i}" method="post" action="/admin/test"><input type="hidden" name="csrf" value="${esc(csrf)}"><input type="hidden" name="id" value="${esc(r.id)}"></form>`).join("");
  const channelNote = [
    config.email ? `<span class="ok">Email is configured</span> (${esc(config.email.host)}).` : `<span class="warn">Email is not configured</span>, so email addresses here will not receive anything until SMTP settings are added.`,
    config.whatsapp ? `<span class="ok">WhatsApp is configured</span> via ${esc(config.whatsapp.provider)}.` : `<span class="warn">WhatsApp is not configured</span>, so numbers here will not receive anything until Twilio or Meta settings are added.`,
  ].join(" ");

  const body = `<h1>FlightNMI admin</h1><p class="muted"><a href="/">Status page</a></p>
<p class="notice">${channelNote}</p>
${notice ? `<p class="notice ok">${esc(notice)}</p>` : ""}${error ? `<p class="notice bad">${esc(error)}</p>` : ""}
<form method="post" action="/admin/recipients"><input type="hidden" name="csrf" value="${esc(csrf)}">
${blocks.join("")}
<p>Leave a block empty to remove that recipient. Each person needs an email address, a WhatsApp number, or both.</p>
<button type="submit">Save recipients</button></form>
${testForms}
<form method="post" action="/admin/logout" style="margin-top:30px"><input type="hidden" name="csrf" value="${esc(csrf)}"><button type="submit">Sign out</button></form>`;
  return layout("FlightNMI – admin", body);
}

export function maskedRecipients(store) {
  return store.recipients.map((r) => ({ name: r.name, email: r.email ? mask(r.email) : "", whatsapp: r.whatsapp ? mask(r.whatsapp) : "", enabled: r.enabled }));
}
