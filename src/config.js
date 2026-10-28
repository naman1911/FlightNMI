// Loads configuration from the environment (and from a .env file in the
// working directory, if present) and validates it once at startup.

/** Minimal .env parser: KEY=value, optional quotes, # comments. */
export function parseDotenv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const quote = val[0] === '"' || val[0] === "'" ? val[0] : "";
    const close = quote ? val.indexOf(quote, 1) : -1;
    if (quote && close !== -1) {
      val = val.slice(1, close);
    } else {
      const hash = val.indexOf(" #");
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    if (/^[A-Z_][A-Z0-9_]*$/i.test(key)) out[key] = val;
  }
  return out;
}

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());
const bool = (v, dflt) => (str(v) === "" ? dflt : /^(1|true|yes|on)$/i.test(str(v)));
function int(v, dflt, min, max, name) {
  if (str(v) === "") return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number between ${min} and ${max}`);
  return n;
}

/**
 * Build the validated config object. Throws with a plain-English message on
 * anything that would make the service misbehave.
 */
export function buildConfig(env = process.env) {
  const problems = [];
  const warnings = [];

  const adminToken = str(env.ADMIN_TOKEN);
  if (!adminToken) problems.push("ADMIN_TOKEN is required (it is the password for the /admin page).");
  else if (adminToken.length < 12 || adminToken === "change-me-to-a-long-random-secret") {
    problems.push("ADMIN_TOKEN must be at least 12 characters and not the example value.");
  }

  const cfg = {
    port: int(env.PORT, 8080, 1, 65535, "PORT"),
    adminToken,
    publicUrl: str(env.PUBLIC_URL).replace(/\/+$/, ""),
    pollSeconds: int(env.POLL_SECONDS, 20, 10, 60, "POLL_SECONDS"),
    noticeMinutes: int(env.NOTICE_MINUTES, 20, 3, 60, "NOTICE_MINUTES"),
    dataDir: str(env.DATA_DIR) || "./data",
    timeZone: "Asia/Kolkata",
    email: null,
    whatsapp: null,
    seedRecipients: [],
    warnings,
  };

  if (str(env.SMTP_HOST)) {
    cfg.email = {
      provider: "smtp",
      host: str(env.SMTP_HOST),
      port: int(env.SMTP_PORT, 587, 1, 65535, "SMTP_PORT"),
      secure: bool(env.SMTP_SECURE, false),
      user: str(env.SMTP_USER),
      pass: str(env.SMTP_PASS),
      from: str(env.EMAIL_FROM) || str(env.SMTP_USER),
    };
    if (!cfg.email.from) problems.push("EMAIL_FROM (or SMTP_USER) is required when SMTP_HOST is set.");
  } else if (str(env.BREVO_API_KEY)) {
    cfg.email = { provider: "brevo", apiKey: str(env.BREVO_API_KEY), from: str(env.EMAIL_FROM) };
    if (!/^[^<]*<[^\s@]+@[^\s@]+\.[^\s@]+>$|^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.email.from)) {
      problems.push('EMAIL_FROM is required with BREVO_API_KEY and must be an address verified in Brevo, e.g. "FlightNMI <you@gmail.com>".');
    }
  }

  if (str(env.TWILIO_ACCOUNT_SID)) {
    cfg.whatsapp = {
      provider: "twilio",
      accountSid: str(env.TWILIO_ACCOUNT_SID),
      authToken: str(env.TWILIO_AUTH_TOKEN),
      from: str(env.TWILIO_WHATSAPP_FROM),
    };
    if (!cfg.whatsapp.authToken) problems.push("TWILIO_AUTH_TOKEN is required when TWILIO_ACCOUNT_SID is set.");
    if (!/^whatsapp:\+\d{6,15}$/.test(cfg.whatsapp.from)) problems.push("TWILIO_WHATSAPP_FROM must look like whatsapp:+14155238886.");
  } else if (str(env.WHATSAPP_PHONE_NUMBER_ID)) {
    cfg.whatsapp = {
      provider: "meta",
      phoneNumberId: str(env.WHATSAPP_PHONE_NUMBER_ID),
      accessToken: str(env.WHATSAPP_ACCESS_TOKEN),
      templateName: str(env.WHATSAPP_TEMPLATE_NAME),
      templateLang: str(env.WHATSAPP_TEMPLATE_LANG) || "en",
    };
    if (!cfg.whatsapp.accessToken) problems.push("WHATSAPP_ACCESS_TOKEN is required when WHATSAPP_PHONE_NUMBER_ID is set.");
    if (!cfg.whatsapp.templateName) {
      warnings.push("WHATSAPP_TEMPLATE_NAME is not set: Meta only delivers plain-text messages inside a 24-hour window after the recipient last wrote to your number.");
    }
  }

  if (!cfg.email && !cfg.whatsapp) {
    warnings.push("No email or WhatsApp settings found. Flights will be tracked and shown on the status page, but nobody will be notified.");
  }

  if (str(env.RECIPIENTS_JSON)) {
    try {
      const arr = JSON.parse(env.RECIPIENTS_JSON);
      if (!Array.isArray(arr)) throw new Error("not an array");
      cfg.seedRecipients = arr;
    } catch (e) {
      problems.push(`RECIPIENTS_JSON is not valid JSON (${e.message}).`);
    }
  }

  if (problems.length) {
    const err = new Error("Configuration problems:\n  - " + problems.join("\n  - "));
    err.problems = problems;
    throw err;
  }
  return cfg;
}
