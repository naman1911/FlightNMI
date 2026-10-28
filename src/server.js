// Entry point: wires config, store, data source, tracker, notifier and web.
import { loadDotenv, buildConfig } from "./config.js";
import { Store } from "./store.js";
import { FlightData } from "./sources.js";
import { Tracker } from "./tracker.js";
import { classifyFlight } from "./classify.js";
import { Notifier } from "./notify/index.js";
import { createEmailChannel } from "./notify/email.js";
import { createWhatsAppChannel } from "./notify/whatsapp.js";
import { createWebServer } from "./web/http.js";
import { log } from "./log.js";
import { pathToFileURL } from "node:url";

const OUTAGE_AFTER_MS = 10 * 60 * 1000;

export async function main() {
  loadDotenv();
  let config;
  try {
    config = buildConfig(process.env);
  } catch (e) {
    process.stderr.write(e.message + "\nSee .env.example for every setting.\n");
    process.exit(2);
  }
  for (const w of config.warnings) log.warn(w);

  const store = new Store(config.dataDir).load();
  const seeded = store.seedIfEmpty(config.seedRecipients);
  if (!seeded.ok) log.warn("RECIPIENTS_JSON ignored", { error: seeded.error });
  else if (seeded.seeded) log.info("recipients seeded from RECIPIENTS_JSON", { count: store.recipients.length });

  const email = config.email ? createEmailChannel(config.email) : null;
  const whatsapp = createWhatsAppChannel(config.whatsapp);
  const notifier = new Notifier({ store, email, whatsapp, opts: { timeZone: config.timeZone, publicUrl: config.publicUrl } });
  if (email) email.verify().then(() => log.info("smtp ok", { server: email.describe() }), (e) => log.warn("smtp check failed; sending will be retried when needed", { error: e.message }));
  if (whatsapp) log.info("whatsapp ready", { via: whatsapp.describe() });

  const flightData = new FlightData();
  const tracker = new Tracker({ noticeMinutes: config.noticeMinutes });
  const health = { startedAt: Date.now(), lastPollOkAt: 0, pollCount: 0, pollError: "", outageAlertedAt: 0, outageSince: 0 };

  async function poll() {
    const now = Date.now();
    health.pollCount++;
    try {
      const { aircraft } = await flightData.fetchPositions(now);
      await flightData.fetchRoutes(aircraft, now);
      const events = tracker.update(aircraft, flightData.routeMap(), now);
      for (const ev of events) handleEvent(ev);
      health.lastPollOkAt = now;
      health.pollError = "";
      if (health.outageSince) {
        const minutes = Math.round((now - health.outageSince) / 60000);
        log.info("flight data recovered", { afterMin: minutes });
        if (health.outageAlertedAt) notifier.sendServiceAlert("recovery", { minutes, source: flightData.status.source });
        health.outageSince = 0; health.outageAlertedAt = 0;
      }
    } catch (e) {
      health.pollError = e.message;
      if (!health.outageSince) health.outageSince = health.lastPollOkAt || now;
      const downFor = now - health.outageSince;
      if (downFor >= OUTAGE_AFTER_MS && !health.outageAlertedAt) {
        health.outageAlertedAt = now;
        const details = Object.entries(flightData.status.sources).map(([n, s]) => `${n}: ${s.ok ? "ok" : s.error}`).join("; ");
        log.error("flight data unavailable", { forMin: Math.round(downFor / 60000), details });
        notifier.sendServiceAlert("outage", { minutes: Math.round(downFor / 60000), details });
      }
    }
    store.pruneSeen(now);
  }

  function handleEvent(ev) {
    const cls = classifyFlight({ callsign: ev.callsign, type: ev.aircraftType, category: ev.emitterCategory, military: ev.military, reg: ev.reg });
    const key = `${ev.hex}:${ev.callsign || ev.reg || "-"}:${ev.type}`;
    if (!store.markSeen(key, ev.at)) { log.debug("duplicate event skipped", { key }); return; }
    log.info("event", { type: ev.type, flight: cls.label, category: cls.category, from: ev.route?.origin || "", eta: ev.etaMin ?? null, confidence: ev.confidence || "" });
    notifier.sendEvent(ev, cls).catch((e) => log.error("notify failed", { error: e.message }));
  }

  let timer = null;
  let stopping = false;
  const loop = async () => {
    await poll();
    if (!stopping) { timer = setTimeout(loop, config.pollSeconds * 1000); }
  };

  const server = createWebServer({ config, store, tracker, flightData, notifier, health });
  server.listen(config.port, () => log.info("web listening", { port: config.port, url: config.publicUrl || `http://localhost:${config.port}` }));
  loop();

  const shutdown = (sig) => {
    if (stopping) return;
    stopping = true;
    log.info("shutting down", { signal: sig });
    if (timer) clearTimeout(timer);
    server.close();
    try { store.flush(); } catch (e) { log.error("could not save state", { error: e.message }); }
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: e?.message || String(e) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
