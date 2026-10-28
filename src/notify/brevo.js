// Email through Brevo's HTTP API (https://developers.brevo.com). Used on
// Cloudflare, where SMTP is not available, and optionally on Node. The sender
// address must be verified in the Brevo account.
const URL = "https://api.brevo.com/v3/smtp/email";

/** Split "Name <addr>" into its parts; a bare address has no name. */
export function parseFrom(from) {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(from || "");
  return m ? { name: (m[1] || "").trim() || "FlightNMI", email: m[2].trim() } : { name: "FlightNMI", email: String(from || "").trim() };
}

export function createBrevoChannel(cfg, { fetchImpl = globalThis.fetch } = {}) {
  const sender = parseFrom(cfg.from);
  return {
    name: "email",
    describe: () => `Brevo API as ${sender.name} <${sender.email}>`,
    async verify() {
      const res = await fetchImpl("https://api.brevo.com/v3/account", { headers: { "api-key": cfg.apiKey, accept: "application/json" }, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Brevo ${res.status}: API key rejected`);
      return true;
    },
    async send({ to, subject, text }) {
      const res = await fetchImpl(URL, {
        method: "POST",
        headers: { "api-key": cfg.apiKey, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text }),
        signal: AbortSignal.timeout(20000),
      });
      const raw = await res.text();
      let json = {};
      try { json = JSON.parse(raw); } catch { json = { raw: raw.slice(0, 300) }; }
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${json.message || json.raw || "request failed"}`);
      return { id: json.messageId || "" };
    },
  };
}
