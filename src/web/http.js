// Plain node:http server: status page, health check, JSON status and a
// token-protected admin page for the three recipients. No frameworks.
import http from "node:http";
import crypto from "node:crypto";
import { statusPage, loginPage, adminPage, maskedRecipients } from "./pages.js";
import { EVENT_TYPES, CATEGORIES, MAX_RECIPIENTS } from "../store.js";
import { log } from "../log.js";
import { dayKey } from "../notify/format.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;
const COOKIE = "nmi_admin";

export function createWebApp({ config, store, tracker, flightData, notifier, health }) {
  const key = crypto.createHash("sha256").update("flightnmi-session:" + config.adminToken).digest();
  const hmac = (s) => crypto.createHmac("sha256", key).update(s).digest("base64url");
  const safeEqual = (a, b) => {
    const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  };
  const loginFailures = new Map(); // ip -> [timestamps]

  function makeSession() {
    const exp = Date.now() + SESSION_TTL_MS;
    return `${exp}.${hmac("session." + exp)}`;
  }
  function sessionValid(value) {
    if (!value) return false;
    const [exp, sig] = value.split(".");
    if (!/^\d+$/.test(exp || "") || !sig) return false;
    if (Number(exp) < Date.now()) return false;
    return safeEqual(sig, hmac("session." + exp));
  }
  const csrfFor = (session) => hmac("csrf." + session);

  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new Error("request body too large")); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
      req.on("error", reject);
    });
  }

  function send(res, status, body, type = "text/html; charset=utf-8", extraHeaders = {}) {
    res.writeHead(status, {
      "content-type": type,
      "content-length": Buffer.byteLength(body),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
      ...extraHeaders,
    });
    res.end(body);
  }
  const redirect = (res, to, extra = {}) => { res.writeHead(303, { location: to, "cache-control": "no-store", ...extra }); res.end(); };
  const cookieHeader = (value, maxAgeSec) => `${COOKIE}=${encodeURIComponent(value)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}` + (config.publicUrl.startsWith("https://") ? "; Secure" : "");

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
      sentToday: { day: dayKey(now, config.timeZone), email: store.counter("email", dayKey(now, config.timeZone)), whatsapp: store.counter("whatsapp", dayKey(now, config.timeZone)) },
      recipients: maskedRecipients(store),
      inbound: tracker.inbound(),
      recentAlerts: store.log.slice(0, 20).map((e) => ({ at: e.at, kind: e.kind, subject: e.subject, deliveries: e.deliveries })),
    };
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const ip = req.socket.remoteAddress || "?";

    if (req.method === "GET" && path === "/") return send(res, 200, statusPage({ health, flightData, tracker, store, config }));
    if (req.method === "GET" && path === "/health") {
      const s = statusJson();
      return send(res, s.ok ? 200 : 503, JSON.stringify({ ok: s.ok, lastPollOkAt: s.lastPollOkAt, source: s.source, lastError: s.lastError }), "application/json");
    }
    if (req.method === "GET" && path === "/api/status") return send(res, 200, JSON.stringify(statusJson()), "application/json");

    if (path.startsWith("/admin")) {
      const session = parseCookies(req)[COOKIE];
      const authed = sessionValid(session);

      if (req.method === "GET" && path === "/admin") {
        if (!authed) return send(res, 200, loginPage());
        return send(res, 200, adminPage({ store, config, csrf: csrfFor(session), notice: url.searchParams.get("saved") ? "Recipients saved." : "" }));
      }
      if (req.method === "POST" && path === "/admin/login") {
        if (rateLimited(ip)) return send(res, 429, loginPage("Too many attempts. Wait ten minutes and try again."));
        const form = await readBody(req);
        if (safeEqual(form.get("token") || "", config.adminToken)) {
          loginFailures.delete(ip);
          return redirect(res, "/admin", { "set-cookie": cookieHeader(makeSession(), SESSION_TTL_MS / 1000) });
        }
        loginFailures.get(ip)?.push(Date.now()) ?? loginFailures.set(ip, [Date.now()]);
        log.warn("admin login failed", { ip });
        return send(res, 401, loginPage("That token is not right."));
      }
      if (req.method === "POST") {
        if (!authed) return send(res, 401, loginPage("Please sign in first."));
        const form = await readBody(req);
        if (!safeEqual(form.get("csrf") || "", csrfFor(session))) return send(res, 403, adminPage({ store, config, csrf: csrfFor(session), error: "The form was out of date. Please try again." }));
        if (path === "/admin/logout") return redirect(res, "/admin", { "set-cookie": cookieHeader("", 0) });
        if (path === "/admin/recipients") {
          const result = store.setRecipients(recipientsFromForm(form));
          if (!result.ok) return send(res, 400, adminPage({ store, config, csrf: csrfFor(session), error: result.error }));
          log.info("recipients updated", { count: store.recipients.length });
          return redirect(res, "/admin?saved=1");
        }
        if (path === "/admin/test") {
          const r = store.recipients.find((x) => x.id === form.get("id"));
          if (!r) return send(res, 404, adminPage({ store, config, csrf: csrfFor(session), error: "Recipient not found." }));
          const results = await notifier.sendTest(r);
          const ok = results.filter((d) => d.ok).map((d) => d.channel), bad = results.filter((d) => !d.ok).map((d) => `${d.channel}: ${d.error}`);
          return send(res, 200, adminPage({ store, config, csrf: csrfFor(session),
            notice: ok.length ? `Test sent to ${r.name} by ${ok.join(" and ")}.` : "", error: bad.length ? `Could not send to ${r.name}. ${bad.join("; ")}` : "" }));
        }
      }
    }
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }

  return (req, res) => {
    handle(req, res).catch((e) => {
      log.error("request failed", { path: req.url, error: e.message });
      if (!res.headersSent) send(res, e.message === "request body too large" ? 413 : 500, "Something went wrong.", "text/plain; charset=utf-8");
      else res.end();
    });
  };
}

export function createWebServer(deps) {
  const server = http.createServer(createWebApp(deps));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}
