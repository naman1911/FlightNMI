// Cloudflare Worker entry. One Durable Object ("nmi") does the watching:
// its alarm fires every POLL_SECONDS, and it serves the web pages. The
// once-a-minute cron only makes sure the alarm is still armed.
import { DurableObject } from "cloudflare:workers";
import { WatcherCore, INTERNAL_HOST } from "./core.js";

export class Watcher extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new WatcherCore({ storage: ctx.storage, env });
    this.ready = ctx.blockConcurrencyWhile(() => this.core.init());
  }
  async alarm() {
    await this.ready;
    await this.core.tick();
  }
  async fetch(request) {
    await this.ready;
    return this.core.handleFetch(request);
  }
}

const watcher = (env) => env.WATCHER.get(env.WATCHER.idFromName("nmi"));

export default {
  fetch(request, env) {
    return watcher(env).fetch(request);
  },
  scheduled(event, env, ctx) {
    ctx.waitUntil(watcher(env).fetch(new Request(`https://${INTERNAL_HOST}/__cron`, { method: "POST" })));
  },
};
