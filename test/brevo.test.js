import { test } from "node:test";
import assert from "node:assert/strict";
import { createBrevoChannel, parseFrom } from "../src/notify/brevo.js";

test("parseFrom splits a display name from the address", () => {
  assert.deepEqual(parseFrom("FlightNMI <alerts@example.com>"), { name: "FlightNMI", email: "alerts@example.com" });
  assert.deepEqual(parseFrom('"NMI Alerts" <a@b.co>'), { name: "NMI Alerts", email: "a@b.co" });
  assert.deepEqual(parseFrom("a@b.co"), { name: "FlightNMI", email: "a@b.co" });
});

test("Brevo request carries the API key, sender, recipient and plain text", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 201, text: async () => JSON.stringify({ messageId: "<m1>" }) }; };
  const ch = createBrevoChannel({ apiKey: "xkeysib-1", from: "FlightNMI <me@gmail.com>" }, { fetchImpl });
  const r = await ch.send({ to: "asha@x.co", subject: "NMI landed", text: "line1\nline2" });
  assert.equal(r.id, "<m1>");
  assert.equal(calls[0].url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(calls[0].init.headers["api-key"], "xkeysib-1");
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.sender, { name: "FlightNMI", email: "me@gmail.com" });
  assert.deepEqual(body.to, [{ email: "asha@x.co" }]);
  assert.equal(body.subject, "NMI landed");
  assert.equal(body.textContent, "line1\nline2");
  assert.equal(body.htmlContent, undefined, "plain text only");
});

test("Brevo errors carry the provider message", async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ message: "Key not found" }) });
  const ch = createBrevoChannel({ apiKey: "bad", from: "a@b.co" }, { fetchImpl });
  await assert.rejects(ch.send({ to: "x@y.co", subject: "s", text: "t" }), /Brevo 401: Key not found/);
  await assert.rejects(ch.verify(), /Brevo 401/);
});
