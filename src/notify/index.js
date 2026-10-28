// Decides who gets which message and delivers it, with retries and a log.
import { describeEvent, describeOutage, describeRecovery, describeTest, dayKey } from "./format.js";
import { log } from "../log.js";

const RETRY_DELAYS_MS = [1000, 5000, 20000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Notifier {
  /**
   * @param {object} o
   * @param {object} o.store Store instance (for the delivery log)
   * @param {object|null} o.email channel with send()
   * @param {object|null} o.whatsapp channel with send()
   * @param {object} o.opts { timeZone, publicUrl }
   */
  constructor({ store, email = null, whatsapp = null, opts = {}, retryDelays = RETRY_DELAYS_MS }) {
    this.store = store;
    this.channels = { email, whatsapp };
    this.opts = opts;
    this.retryDelays = retryDelays;
    this.queue = Promise.resolve();
  }

  get configured() { return Boolean(this.channels.email || this.channels.whatsapp); }

  /** Resolves once every queued flight alert has been delivered or given up on. */
  idle() { return this.queue; }

  /** Recipients who want this event type and flight category. */
  recipientsFor(event, cls) {
    return this.store.recipients.filter((r) => r.enabled && r.events?.[event.type] !== false && r.categories?.[cls.category] !== false);
  }

  /** Queue delivery of a flight event. Resolves to the per-destination results. */
  sendEvent(event, cls) {
    const recipients = this.recipientsFor(event, cls);
    const { subject, text } = describeEvent(event, cls, this.opts);
    const summary = { kind: event.type, flight: cls.label, subject };
    if (!recipients.length) {
      this.store.addLog({ ...summary, deliveries: [], note: "no recipient subscribed to this" });
      return Promise.resolve([]);
    }
    return this._enqueue(() => this._fanOut(recipients, subject, text, summary));
  }

  sendServiceAlert(kind, payload) {
    const recipients = this.store.recipients.filter((r) => r.enabled && r.serviceAlerts !== false);
    const msg = kind === "outage" ? describeOutage(payload.minutes, payload.details, this.opts) : describeRecovery(payload.minutes, payload.source, this.opts);
    const summary = { kind: `service_${kind}`, flight: "", subject: msg.subject };
    if (!recipients.length) return Promise.resolve([]);
    return this._enqueue(() => this._fanOut(recipients, msg.subject, msg.text, summary));
  }

  /** Send a test to one recipient right away (not queued behind flight alerts). */
  async sendTest(recipient) {
    const { subject, text } = describeTest(recipient, this.opts);
    return this._fanOut([recipient], subject, text, { kind: "test", flight: "", subject });
  }

  _enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  async _fanOut(recipients, subject, text, summary) {
    const deliveries = [];
    for (const r of recipients) {
      const targets = [];
      if (r.email) targets.push(["email", r.email]);
      if (r.whatsapp) targets.push(["whatsapp", r.whatsapp]);
      for (const [channelName, to] of targets) {
        const channel = this.channels[channelName];
        const entry = { recipient: r.name, channel: channelName, to: mask(to) };
        if (!channel) {
          deliveries.push({ ...entry, ok: false, error: `${channelName} is not configured` });
          continue;
        }
        const result = await this._deliver(channel, { to, subject, text });
        if (result.ok) this.store.bumpCounter(channelName, dayKey(Date.now(), this.opts.timeZone));
        deliveries.push({ ...entry, ...result });
      }
    }
    this.store.addLog({ ...summary, deliveries });
    const failed = deliveries.filter((d) => !d.ok);
    if (failed.length) log.warn("some deliveries failed", { subject, failed });
    else log.info("sent", { subject, count: deliveries.length });
    return deliveries;
  }

  async _deliver(channel, msg) {
    let lastErr = "";
    for (let attempt = 0; attempt <= this.retryDelays.length; attempt++) {
      try {
        const res = await channel.send(msg);
        return { ok: true, id: res?.id || "", attempts: attempt + 1 };
      } catch (e) {
        lastErr = e.message || String(e);
        if (attempt < this.retryDelays.length) await sleep(this.retryDelays[attempt]);
      }
    }
    return { ok: false, error: lastErr, attempts: this.retryDelays.length + 1 };
  }
}

/** Hide most of an address in logs and on the status page. */
export function mask(addr) {
  const s = String(addr || "");
  if (s.includes("@")) {
    const [u, d] = s.split("@");
    return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
  }
  return s.length > 4 ? `${s.slice(0, 3)}${"*".repeat(s.length - 6)}${s.slice(-3)}` : s;
}
