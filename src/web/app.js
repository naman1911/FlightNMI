// The web application, independent of the HTTP server it runs behind.
// handle(req) takes a small neutral request and returns {status, headers,
// body}. Node (src/web/http.js) and Cloudflare (src/web/fetch.js) adapt to it.
// Only Web APIs are used (Web Crypto, URL, Headers) so it runs anywhere.
import { statusPage, loginPage, adminPage, maskedRecipients } from "./pages.js";
import { EVENT_TYPES, CATEGORIES, MAX_RECIPIENTS } from "../store.js";
import { dayKey } from "../notify/format.js";
import { log } from "../log.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_BODY = 64 * 1024;
const COOKIE = "nmi_admin";
const enc = new TextEncoder();

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Constant-time string comparison. */
export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function createWebApp({ config, store, tracker, flightData, notifier, health }) {
  const subtle = globalThis.crypto.subtle;
  const keyPromise = subtle.digest("SHA-256", enc.encode("flightnmi-session:" + config.adminToken))
    .then((raw) => subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));
  const hmac = async (s) => b64url(await subtle.sign("HMAC", await keyPromise, enc.encode(s)));
  const loginFailures = new Map(); // ip -> [timestamps]

  async function makeSession() {
    const exp = Date.now() + SESSION_TTL_MS;
    return `${exp}.${await hmac("session." + exp)}`;
  }
  async function sessionValid(value) {
    if (!value) return false;
    const [exp, sig] = value.split(".");
    if (!/^\d+$/.test(exp || "") || !sig || Number(exp) < Date.now()) return false;
    return safeEqual(sig, await hmac("session." + exp));
  }
  const csrfFor = (session) => hmac("csrf." + session);

  function parseCookies(header) {
    const out = {};
    for (const part of String(header || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  const page = (status, body, type = "text/html; charset=utf-8", extra = {}) => ({
    status,
    headers: {
      "content-type": type,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
      ...extra,
    },
    body,
  });
  const redirect = (to, extra = {}) => ({ status: 303, headers: { location: to, "cache-control": "no-store", ...extra }, body: "" });
  const json = (status, obj) => page(status, JSON.stringify(obj), "application/json");
  const cookieHeader = (value, maxAgeSec, secure) =>
    `${COOKIE}=${encodeURIComponent(value)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}` + (secure || config.publicUrl.startsWith("https://") ? "; Secure" : "");

  function rateLimited(ip) {
    const now = Date.now();
    for (const [k, v] of loginFailures) if (!v.some((t) => now - t < 10 * 60 * 1000)) loginFailures.delete(k);
    const arr = (loginFailures.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    loginFailures.set(ip, arr);
    return arr.length >= 5;
  }

  /** Turn the admin form into a recipient list the store can validate. */
  function recipientsFromForm(form) {
    const list = [];
    for (let i = 0; i < MAX_RECIPIENTS; i++) {
      const g = (k) => form.get(`r${i}.${k}`);
      const name = (g("name") || "").trim(), email = (g("email") || "").trim(), whatsapp = (g("whatsapp") || "").trim();
      if (!name && !email && !whatsapp) continue;
      const events = {}, categories = {};
      for (const e of EVENT_TYPES) events[e] = g(`events.${e}`) != null;
      for (const c of CATEGORIES) categories[c] = g(`categories.${c}`) != null;
      list.push({ id: g("id") || undefined, name, email, whatsapp, enabled: g("enabled") != null, serviceAlerts: g("serviceAlerts") != null, events, categories });
    }
    return list;
  }

  function statusJson() {
    const now = Date.now();
    const day = dayKey(now, config.timeZone);
    return {
      ok: Boolean(health.lastPollOkAt && now - health.lastPollOkAt < (config.pollSeconds * 3 + 60) * 1000),
      now,
      startedAt: health.startedAt,
      lastPollOkAt: health.lastPollOkAt,
      pollCount: health.pollCount,
      source: flightData.status.source,
      sources: flightData.status.sources,
      lastError: flightData.status.lastError || health.pollError || "",
      channels: { email: Boolean(config.email), whatsapp: config.whatsapp ? config.whatsapp.provider : false },
      sentToday: { day, email: store.counter("email", day), whatsapp: store.counter("whatsapp", day) },
      recipients: maskedRecipients(store),
      inbound: tracker.inbound(),
      recentAlerts: store.log.slice(0, 20).map((e) => ({ at: e.at, kind: e.kind, subject: e.subject, deliveries: e.deliveries })),
    };
  }

  const readForm = async (req) => new URLSearchParams(await req.text());

  /**
   * @param {{method:string,url:string,headers:Headers,ip:string,secure:boolean,text:()=>Promise<string>}} req
   */
  return async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const ip = req.ip || "?";

    if (req.method === "GET" && path === "/") return page(200, statusPage({ health, flightData, tracker, store, config }));
    if (req.method === "GET" && path === "/health") {
      const s = statusJson();
      return json(s.ok ? 200 : 503, { ok: s.ok, lastPollOkAt: s.lastPollOkAt, source: s.source, lastError: s.lastError });
    }
    if (req.method === "GET" && path === "/api/status") return json(200, statusJson());

    if (path.startsWith("/admin")) {
      const session = parseCookies(req.headers.get("cookie"))[COOKIE];
      const authed = await sessionValid(session);

      if (req.method === "GET" && path === "/admin") {
        if (!authed) return page(200, loginPage());
        return page(200, adminPage({ store, config, csrf: await csrfFor(session), notice: url.searchParams.get("saved") ? "Recipients saved." : "" }));
      }
      if (req.method === "POST" && path === "/admin/login") {
        if (rateLimited(ip)) return page(429, loginPage("Too many attempts. Wait ten minutes and try again."));
        const form = await readForm(req);
        if (safeEqual(form.get("token") || "", config.adminToken)) {
          loginFailures.delete(ip);
          return redirect("/admin", { "set-cookie": cookieHeader(await makeSession(), SESSION_TTL_MS / 1000, req.secure) });
        }
        loginFailures.get(ip).push(Date.now());
        log.warn("admin login failed", { ip });
        return page(401, loginPage("That token is not right."));
      }
      if (req.method === "POST") {
        if (!authed) return page(401, loginPage("Please sign in first."));
        const form = await readForm(req);
        const csrf = await csrfFor(session);
        if (!safeEqual(form.get("csrf") || "", csrf)) return page(403, adminPage({ store, config, csrf, error: "The form was out of date. Please try again." }));
        if (path === "/admin/logout") return redirect("/admin", { "set-cookie": cookieHeader("", 0, req.secure) });
        if (path === "/admin/recipients") {
          const result = store.setRecipients(recipientsFromForm(form));
          if (!result.ok) return page(400, adminPage({ store, config, csrf, error: result.error }));
          await store.flush();
          log.info("recipients updated", { count: store.recipients.length });
          return redirect("/admin?saved=1");
        }
        if (path === "/admin/test") {
          const r = store.recipients.find((x) => x.id === form.get("id"));
          if (!r) return page(404, adminPage({ store, config, csrf, error: "Recipient not found." }));
          const results = await notifier.sendTest(r);
          await store.flush();
          const ok = results.filter((d) => d.ok).map((d) => d.channel), bad = results.filter((d) => !d.ok).map((d) => `${d.channel}: ${d.error}`);
          return page(200, adminPage({ store, config, csrf,
            notice: ok.length ? `Test sent to ${r.name} by ${ok.join(" and ")}.` : "", error: bad.length ? `Could not send to ${r.name}. ${bad.join("; ")}` : "" }));
        }
      }
    }
    return page(404, "Not found", "text/plain; charset=utf-8");
  };
}

/** Wrap handle() so any failure becomes a plain error response instead of a crash. */
export function guarded(handle) {
  return async (req) => {
    try {
      return await handle(req);
    } catch (e) {
      log.error("request failed", { path: req.url, error: e.message });
      const tooBig = e.message === "request body too large";
      return { status: tooBig ? 413 : 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, body: tooBig ? "Request too large." : "Something went wrong." };
    }
  };
}
