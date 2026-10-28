#!/usr/bin/env node
// Validates .env / environment and, where possible, checks the channels can
// be reached. Run:  npm run check-config
import { loadDotenv, buildConfig } from "../src/config.js";
import { createEmailChannel } from "../src/notify/email.js";
import { createWhatsAppChannel } from "../src/notify/whatsapp.js";

loadDotenv();
let cfg;
try {
  cfg = buildConfig(process.env);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
console.log(`Port ${cfg.port}; polling every ${cfg.pollSeconds} s; "approaching" alerts at ${cfg.noticeMinutes} min; data in ${cfg.dataDir}`);
for (const w of cfg.warnings) console.log("WARNING:", w);
if (cfg.email) {
  const ch = createEmailChannel(cfg.email);
  try { await ch.verify(); console.log("Email: OK,", ch.describe()); }
  catch (e) { console.log("Email: FAILED to connect/login:", e.message); process.exitCode = 1; }
} else console.log("Email: not configured");
const wa = createWhatsAppChannel(cfg.whatsapp);
console.log(wa ? `WhatsApp: configured, ${wa.describe()} (send a test from /admin to confirm delivery)` : "WhatsApp: not configured");
if (cfg.seedRecipients.length) console.log(`Seed recipients: ${cfg.seedRecipients.map((r) => r.name).join(", ")}`);
