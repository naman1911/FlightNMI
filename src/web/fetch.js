// Fetch-API adapter: runs the web app on Cloudflare Workers (or anything
// that speaks Request/Response).
import { guarded, MAX_BODY } from "./app.js";

export function createFetchHandler(handle) {
  const run = guarded(handle);
  return async (request) => {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > MAX_BODY) return new Response("Request too large.", { status: 413 });
    const out = await run({
      method: request.method,
      url: request.url,
      headers: request.headers,
      ip: request.headers.get("cf-connecting-ip") || "",
      secure: new URL(request.url).protocol === "https:",
      text: async () => {
        const body = await request.text();
        if (body.length > MAX_BODY) throw new Error("request body too large");
        return body;
      },
    });
    return new Response(out.body, { status: out.status, headers: out.headers });
  };
}
