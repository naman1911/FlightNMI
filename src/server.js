// Node entry point: config, file store, channels, the service and the web
// server, with a timer driving the polls.
import { pathToFileURL } from "node:url";
import path from "node:path";
import { buildConfig } from "./config.js";
import { loadDotenv } from "./dotenv.js";
import { Store } from "./store-file.js";
import { ArrivalService } from "./service.js";
import { createEmailChannel } from "./notify/email.js";
import { createBrevoChannel } from "./notify/brevo.js";
import { createWhatsAppChannel } from "./notify/whatsapp.js";
import { createWebServer } from "./web/http.js";
import { log } from "./log.js";

export async function main() {
  loadDotenv();
  let config;
  try {
    config = buildConfig(process.env);
  } catch (e) {
    process.stderr.write(e.message + "\nSee .env.example for every setting.\n");
    process.exit(2);
  }
  for (const w of config.warnings) log.warn(w);

  const store = new Store(path.resolve(config.dataDir)).load();
  const seeded = store.seedIfEmpty(config.seedRecipients);
  if (!seeded.ok) log.warn("RECIPIENTS_JSON ignored", { error: seeded.error });
  else if (seeded.seeded) log.info("recipients seeded from RECIPIENTS_JSON", { count: store.recipients.length });

  const email = !config.email ? null : config.email.provider === "brevo" ? createBrevoChannel(config.email) : createEmailChannel(config.email);
  const whatsapp = createWhatsAppChannel(config.whatsapp);
  if (email) email.verify().then(() => log.info("email ok", { via: email.describe() }), (e) => log.warn("email check failed; sending will be retried when needed", { error: e.message }));
  if (whatsapp) log.info("whatsapp ready", { via: whatsapp.describe() });

  const service = new ArrivalService({ config, store, email, whatsapp });

  let timer = null;
  let stopping = false;
  const loop = async () => {
    await service.poll();
    if (!stopping) timer = setTimeout(loop, config.pollSeconds * 1000);
  };

  const server = createWebServer(service.webDeps);
  server.listen(config.port, () => log.info("web listening", { port: config.port, url: config.publicUrl || `http://localhost:${config.port}` }));
  loop();

  const shutdown = async (sig) => {
    if (stopping) return;
    stopping = true;
    log.info("shutting down", { signal: sig });
    if (timer) clearTimeout(timer);
    server.close();
    try { await store.flush(); } catch (e) { log.error("could not save state", { error: e.message }); }
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (e) => log.error("unhandled rejection", { error: e?.message || String(e) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
