// Everything the Cloudflare Durable Object does, written against a small
// storage interface so it can be tested in Node without Cloudflare.
import { buildConfig } from "../config.js";
import { BaseStore } from "../store.js";
import { ArrivalService } from "../service.js";
import { createBrevoChannel } from "../notify/brevo.js";
import { createWhatsAppChannel } from "../notify/whatsapp.js";
import { createWebApp } from "../web/app.js";
import { createFetchHandler } from "../web/fetch.js";
import { layout, esc } from "../web/pages.js";
import { log } from "../log.js";

export const STATE_KEY = "state";
export const RUNTIME_KEY = "runtime";
export const INTERNAL_HOST = "watcher.internal";
const WORKER_RETRY_DELAYS = [1000, 4000];

/** BaseStore persisted in Durable Object storage. */
export class DurableStore extends BaseStore {
  constructor(storage) {
    super();
    this.storage = storage;
    this.dirty = false;
  }
  async load() { this.adopt(await this.storage.get(STATE_KEY)); return this; }
  _changed() { this.dirty = true; }
  async flush() {
    if (!this.dirty) return;
    this.dirty = false;
    await this.storage.put(STATE_KEY, this.state);
  }
}

export class WatcherCore {
  /**
   * @param {object} o
   * @param {object} o.storage Durable Object storage: get, put, getAlarm, setAlarm
   * @param {object} o.env bindings and secrets (ADMIN_TOKEN, BREVO_API_KEY, ...)
   * @param {Function} [o.fetchImpl]
   * @param {Function} [o.now]
   */
  constructor({ storage, env, fetchImpl, now = Date.now }) {
    this.storage = storage;
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.configError = null;
    this.service = null;
    this.handleWeb = null;
  }

  async init() {
    let config;
    try {
      config = buildConfig(this.env);
    } catch (e) {
      this.configError = e;
      log.error("configuration problem", { error: e.message });
      return this;
    }
    for (const w of config.warnings) log.warn(w);
    if (config.email?.provider === "smtp") {
      log.warn("SMTP is not available on Cloudflare; set BREVO_API_KEY and EMAIL_FROM instead. Email is off.");
      config.email = null;
    }
    this.config = config;
    this.store = new DurableStore(this.storage);
    await this.store.load();
    const seeded = this.store.seedIfEmpty(config.seedRecipients);
    if (seeded.seeded) await this.store.flush();
    const email = config.email ? createBrevoChannel(config.email, this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}) : null;
    const whatsapp = createWhatsAppChannel(config.whatsapp, this.fetchImpl ? { fetchImpl: this.fetchImpl } : {});
    this.service = new ArrivalService({ config, store: this.store, email, whatsapp, fetchImpl: this.fetchImpl, retryDelays: WORKER_RETRY_DELAYS });
    this.service.restore(await this.storage.get(RUNTIME_KEY));
    this.handleWeb = createFetchHandler(createWebApp(this.service.webDeps));
    await this.ensureArmed();
    return this;
  }

  /** Make sure a poll is scheduled; alarms persist, but this is the safety net. */
  async ensureArmed() {
    if (this.configError) return false;
    const existing = await this.storage.getAlarm();
    if (existing == null) await this.storage.setAlarm(this.now() + 1000);
    return true;
  }

  /** One alarm: schedule the next poll first, then poll, deliver and persist. */
  async tick() {
    if (this.configError) return;
    const now = this.now();
    await this.storage.setAlarm(now + this.config.pollSeconds * 1000);
    await this.service.poll(now);
    await this.service.notifier.idle();
    await this.storage.put(RUNTIME_KEY, this.service.snapshot());
    await this.store.flush();
  }

  async handleFetch(request) {
    const url = new URL(request.url);
    if (url.hostname === INTERNAL_HOST) {
      if (url.pathname === "/__cron") {
        const armed = await this.ensureArmed();
        return new Response(armed ? "armed" : "not configured", { status: armed ? 200 : 503 });
      }
      return new Response("not found", { status: 404 });
    }
    if (this.configError) {
      const body = `<h1>FlightNMI is not configured yet</h1><p>Fix these in the Cloudflare dashboard under Settings &rarr; Variables and Secrets, then reload:</p><ul>${this.configError.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`;
      return new Response(layout("FlightNMI – setup needed", body), { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    }
    return this.handleWeb(request);
  }
}
