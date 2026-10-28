// WhatsApp delivery. Two providers, same interface; both use fetch only.
import { normalizePhone } from "../store.js";

async function readJson(res) {
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { raw: txt.slice(0, 300) }; }
}

export function createTwilioWhatsApp(cfg, { fetchImpl = globalThis.fetch } = {}) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`;
  const auth = "Basic " + btoa(`${cfg.accountSid}:${cfg.authToken}`);
  return {
    name: "whatsapp",
    describe: () => `Twilio from ${cfg.from}`,
    async send({ to, text }) {
      const body = new URLSearchParams({ From: cfg.from, To: `whatsapp:${normalizePhone(to)}`, Body: text });
      const res = await fetchImpl(url, { method: "POST", headers: { authorization: auth, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(20000) });
      const json = await readJson(res);
      if (!res.ok) throw new Error(`Twilio ${res.status}: ${json.message || json.raw || "request failed"}`);
      return { id: json.sid || "" };
    },
  };
}

export function createMetaWhatsApp(cfg, { fetchImpl = globalThis.fetch, apiVersion = "v21.0" } = {}) {
  const url = `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(cfg.phoneNumberId)}/messages`;
  return {
    name: "whatsapp",
    describe: () => `Meta Cloud API phone ${cfg.phoneNumberId}${cfg.templateName ? ` (template ${cfg.templateName})` : " (plain text)"}`,
    async send({ to, text }) {
      const recipient = normalizePhone(to).replace(/^\+/, "");
      const payload = cfg.templateName
        ? { messaging_product: "whatsapp", to: recipient, type: "template",
            template: { name: cfg.templateName, language: { code: cfg.templateLang || "en" },
              components: [{ type: "body", parameters: [{ type: "text", text: text.replace(/\s*\n\s*/g, " ").slice(0, 1024) }] }] } }
        : { messaging_product: "whatsapp", to: recipient, type: "text", text: { preview_url: false, body: text } };
      const res = await fetchImpl(url, { method: "POST", headers: { authorization: `Bearer ${cfg.accessToken}`, "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      const json = await readJson(res);
      if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${json.error?.message || json.raw || "request failed"}`);
      return { id: json.messages?.[0]?.id || "" };
    },
  };
}

export function createWhatsAppChannel(cfg, deps) {
  if (!cfg) return null;
  return cfg.provider === "twilio" ? createTwilioWhatsApp(cfg, deps) : createMetaWhatsApp(cfg, deps);
}
