// The arrival-watching service, independent of where it runs. Node calls
// poll() from a timer; the Cloudflare Durable Object calls it from an alarm.
import { FlightData } from "./sources.js";
import { Tracker } from "./tracker.js";
import { classifyFlight } from "./classify.js";
import { Notifier } from "./notify/index.js";
import { log } from "./log.js";

const OUTAGE_AFTER_MS = 10 * 60 * 1000;

export class ArrivalService {
  /**
   * @param {object} o
   * @param {object} o.config from buildConfig()
   * @param {object} o.store a BaseStore subclass, already loaded
   * @param {object|null} o.email email channel ({send}) or null
   * @param {object|null} o.whatsapp WhatsApp channel or null
   * @param {Function} [o.fetchImpl] fetch to use for flight data
   * @param {number[]} [o.retryDelays] delivery retry schedule in ms
   */
  constructor({ config, store, email = null, whatsapp = null, fetchImpl, retryDelays }) {
    this.config = config;
    this.store = store;
    this.flightData = new FlightData(fetchImpl ? { fetchImpl } : {});
    this.tracker = new Tracker({ noticeMinutes: config.noticeMinutes });
    this.notifier = new Notifier({ store, email, whatsapp, opts: { timeZone: config.timeZone, publicUrl: config.publicUrl }, ...(retryDelays ? { retryDelays } : {}) });
    this.health = { startedAt: Date.now(), lastPollOkAt: 0, pollCount: 0, pollError: "", outageSince: 0, outageAlertedAt: 0 };
  }

  /** What the web pages need. */
  get webDeps() {
    return { config: this.config, store: this.store, tracker: this.tracker, flightData: this.flightData, notifier: this.notifier, health: this.health };
  }

  /** One round: fetch positions and routes, update the tracker, queue alerts. Never throws. */
  async poll(now = Date.now()) {
    const h = this.health;
    h.pollCount++;
    let events = [];
    try {
      const { aircraft } = await this.flightData.fetchPositions(now);
      await this.flightData.fetchRoutes(aircraft, now);
      events = this.tracker.update(aircraft, this.flightData.routeMap(), now);
      for (const ev of events) this.handleEvent(ev);
      h.lastPollOkAt = now;
      h.pollError = "";
      if (h.outageSince) {
        const minutes = Math.round((now - h.outageSince) / 60000);
        log.info("flight data recovered", { afterMin: minutes });
        if (h.outageAlertedAt) this.notifier.sendServiceAlert("recovery", { minutes, source: this.flightData.status.source });
        h.outageSince = 0;
        h.outageAlertedAt = 0;
      }
    } catch (e) {
      h.pollError = e.message;
      if (!h.outageSince) h.outageSince = h.lastPollOkAt || now;
      const downFor = now - h.outageSince;
      if (downFor >= OUTAGE_AFTER_MS && !h.outageAlertedAt) {
        h.outageAlertedAt = now;
        const details = Object.entries(this.flightData.status.sources).map(([n, s]) => `${n}: ${s.ok ? "ok" : s.error}`).join("; ");
        log.error("flight data unavailable", { forMin: Math.round(downFor / 60000), details });
        this.notifier.sendServiceAlert("outage", { minutes: Math.round(downFor / 60000), details });
      }
    }
    this.store.pruneSeen(now);
    return events;
  }

  handleEvent(ev) {
    const cls = classifyFlight({ callsign: ev.callsign, type: ev.aircraftType, category: ev.emitterCategory, military: ev.military, reg: ev.reg });
    const key = `${ev.hex}:${ev.callsign || ev.reg || "-"}:${ev.type}`;
    if (!this.store.markSeen(key, ev.at)) { log.debug("duplicate event skipped", { key }); return; }
    log.info("event", { type: ev.type, flight: cls.label, category: cls.category, from: ev.route?.origin || "", eta: ev.etaMin ?? null, confidence: ev.confidence || "" });
    this.notifier.sendEvent(ev, cls).catch((e) => log.error("notify failed", { error: e.message }));
  }

  /** Live state to keep between runs where the process may be stopped (Cloudflare). */
  snapshot() {
    return { health: this.health, tracker: this.tracker.toJSON(), flightData: this.flightData.toJSON() };
  }

  restore(snap) {
    if (!snap) return this;
    if (snap.health && typeof snap.health === "object") this.health = { ...this.health, ...snap.health, startedAt: snap.health.startedAt || this.health.startedAt };
    this.tracker.restore(snap.tracker);
    this.flightData.restore(snap.flightData);
    return this;
  }
}
