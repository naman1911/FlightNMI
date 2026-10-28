// Node adapter: runs the web app behind node:http.
import http from "node:http";
import { createWebApp, guarded, MAX_BODY } from "./app.js";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("request body too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createWebServer(deps) {
  const handle = guarded(createWebApp(deps));
  const server = http.createServer(async (req, res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const out = await handle({
      method: req.method,
      url: `http://${req.headers.host || "localhost"}${req.url}`,
      headers,
      ip: req.socket.remoteAddress || "",
      secure: false,
      text: () => readBody(req),
    });
    res.writeHead(out.status, { ...out.headers, "content-length": Buffer.byteLength(out.body) });
    res.end(out.body);
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return server;
}

export { createWebApp };
