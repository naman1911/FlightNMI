// Persistent state: recipients, the notification log and the set of events
// already sent (so a restart never re-sends an alert). Everything lives in
// one small JSON file written atomically (write temp file, then rename).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MAX_RECIPIENTS = 3;
export const EVENT_TYPES = ["approaching", "landed", "go_around"];
export const CATEGORIES = ["commercial", "cargo", "other"];
const LOG_LIMIT = 300;
const SEEN_TTL_MS = 18 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Normalise a phone number to E.164. Accepts "whatsapp:+91...", spaces, dashes. */
export function normalizePhone(input) {
  let s = String(input || "").trim().replace(/^whatsapp:/i, "").replace(/[\s\-().]/g, "");
  if (!s) return "";
  if (s.startsWith("00")) s = "+" + s.slice(2);
  // A bare 10-digit Indian mobile number is the common case for NMI watchers.
  if (/^[6-9]\d{9}$/.test(s)) s = "+91" + s;
  if (/^91[6-9]\d{9}$/.test(s)) s = "+" + s;
  return s;
}

/**
 * Validate and normalise one recipient. Returns {ok, value} or {ok:false, error}.
 * Unknown fields are dropped; missing preference fields default to "everything".
 */
export function validateRecipient(input, existingId) {
  const name = String(input?.name || "").trim().slice(0, 60);
  const email = String(input?.email || "").trim().toLowerCase();
  const whatsapp = normalizePhone(input?.whatsapp);
  if (!name) return { ok: false, error: "Each recipient needs a name." };
  if (!email && !whatsapp) return { ok: false, error: `${name}: give an email address or a WhatsApp number (or both).` };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: `${name}: "${email}" is not a valid email address.` };
  if (whatsapp && !E164_RE.test(whatsapp)) {
    return { ok: false, error: `${name}: WhatsApp number must include the country code, e.g. +919876543210.` };
  }
  const pick = (obj, keys) => {
    const out = {};
    for (const k of keys) out[k] = obj && typeof obj === "object" && k in obj ? Boolean(obj[k]) : true;
    return out;
  };
  return {
    ok: true,
    value: {
      id: existingId || input?.id || crypto.randomUUID(),
      name,
      email,
      whatsapp,
      enabled: input?.enabled === undefined ? true : Boolean(input.enabled),
      events: pick(input?.events, EVENT_TYPES),
      categories: pick(input?.categories, CATEGORIES),
      serviceAlerts: input?.serviceAlerts === undefined ? true : Boolean(input.serviceAlerts),
    },
  };
}

export class Store {
  constructor(dataDir) {
    this.dir = dataDir;
    this.file = path.join(dataDir, "state.json");
    this.state = { version: 1, recipients: [], log: [], seen: {} };
    this._saveTimer = null;
  }

  load() {
    fs.mkdirSync(this.dir, { recursive: true });
    if (fs.existsSync(this.file)) {
      const raw = JSON.parse(fs.readFileSync(this.file, "utf8"));
      this.state = {
        version: 1,
        recipients: Array.isArray(raw.recipients) ? raw.recipients : [],
        log: Array.isArray(raw.log) ? raw.log : [],
        seen: raw.seen && typeof raw.seen === "object" ? raw.seen : {},
      };
      // Re-validate so an old or hand-edited file can never carry bad data forward.
      this.state.recipients = this.state.recipients
        .map((r) => validateRecipient(r, r.id))
        .filter((v) => v.ok)
        .map((v) => v.value)
        .slice(0, MAX_RECIPIENTS);
    }
    this.pruneSeen(Date.now());
    return this;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  /** Coalesce bursts of writes into one disk write. */
  saveSoon() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try { this.save(); } catch (e) { this.lastSaveError = e; }
    }, 250);
    if (typeof this._saveTimer.unref === "function") this._saveTimer.unref();
  }

  flush() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    this.save();
  }

  get recipients() { return this.state.recipients; }

  /** Replace the whole recipient list. Returns {ok} or {ok:false, error}. */
  setRecipients(list) {
    if (!Array.isArray(list)) return { ok: false, error: "Expected a list of recipients." };
    if (list.length > MAX_RECIPIENTS) return { ok: false, error: `At most ${MAX_RECIPIENTS} recipients are allowed.` };
    const out = [];
    for (const item of list) {
      const v = validateRecipient(item, item?.id);
      if (!v.ok) return v;
      out.push(v.value);
    }
    const dup = out.find((r, i) => out.findIndex((o) => (r.email && o.email === r.email) || (r.whatsapp && o.whatsapp === r.whatsapp)) !== i);
    if (dup) return { ok: false, error: `${dup.name} shares an address with another recipient.` };
    this.state.recipients = out;
    this.save();
    return { ok: true };
  }

  /** Seed recipients from config only when the store is empty. */
  seedIfEmpty(list) {
    if (this.state.recipients.length || !list?.length) return { ok: true, seeded: false };
    const r = this.setRecipients(list.slice(0, MAX_RECIPIENTS));
    return { ...r, seeded: r.ok };
  }

  /** Mark an event key as sent. Returns false if it was already sent. */
  markSeen(key, now = Date.now()) {
    if (this.state.seen[key]) return false;
    this.state.seen[key] = now;
    this.saveSoon();
    return true;
  }

  hasSeen(key) { return Boolean(this.state.seen[key]); }

  pruneSeen(now) {
    for (const [k, t] of Object.entries(this.state.seen)) if (now - t > SEEN_TTL_MS) delete this.state.seen[k];
  }

  addLog(entry) {
    this.state.log.unshift({ at: Date.now(), ...entry });
    if (this.state.log.length > LOG_LIMIT) this.state.log.length = LOG_LIMIT;
    this.saveSoon();
  }

  get log() { return this.state.log; }
}
