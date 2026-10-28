import { test } from "node:test";
import assert from "node:assert/strict";
import { createTwilioWhatsApp, createMetaWhatsApp } from "../src/notify/whatsapp.js";

const capture = (status, body) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: status < 400, status, text: async () => JSON.stringify(body) }; };
  return { calls, fetchImpl };
};

test("Twilio request is form-encoded with whatsapp: prefixes and basic auth", async () => {
  const { calls, fetchImpl } = capture(201, { sid: "SM1" });
  const ch = createTwilioWhatsApp({ accountSid: "AC1", authToken: "tok", from: "whatsapp:+14155238886" }, { fetchImpl });
  const r = await ch.send({ to: "+919876543210", subject: "s", text: "hello" });
  assert.equal(r.id, "SM1");
  assert.equal(calls[0].url, "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
  assert.equal(calls[0].init.headers.authorization, "Basic " + Buffer.from("AC1:tok").toString("base64"));
  const body = calls[0].init.body;
  assert.equal(body.get("To"), "whatsapp:+919876543210");
  assert.equal(body.get("From"), "whatsapp:+14155238886");
  assert.equal(body.get("Body"), "hello");
});

test("Twilio errors carry the provider message", async () => {
  const { fetchImpl } = capture(400, { message: "Invalid To number" });
  const ch = createTwilioWhatsApp({ accountSid: "AC1", authToken: "tok", from: "whatsapp:+1" }, { fetchImpl });
  await assert.rejects(ch.send({ to: "+91", text: "x" }), /Twilio 400: Invalid To number/);
});

test("Meta plain-text and template payloads", async () => {
  const { calls, fetchImpl } = capture(200, { messages: [{ id: "wamid.1" }] });
  const plain = createMetaWhatsApp({ phoneNumberId: "555", accessToken: "tok" }, { fetchImpl });
  const r = await plain.send({ to: "+919876543210", text: "line1\nline2" });
  assert.equal(r.id, "wamid.1");
  assert.equal(calls[0].url, "https://graph.facebook.com/v21.0/555/messages");
  assert.equal(calls[0].init.headers.authorization, "Bearer tok");
  const p = JSON.parse(calls[0].init.body);
  assert.equal(p.to, "919876543210");
  assert.equal(p.type, "text");
  assert.equal(p.text.body, "line1\nline2");

  const tpl = createMetaWhatsApp({ phoneNumberId: "555", accessToken: "tok", templateName: "nmi_alert", templateLang: "en" }, { fetchImpl });
  await tpl.send({ to: "+919876543210", text: "line1\nline2" });
  const q = JSON.parse(calls[1].init.body);
  assert.equal(q.type, "template");
  assert.equal(q.template.name, "nmi_alert");
  assert.equal(q.template.components[0].parameters[0].text, "line1 line2", "template parameters cannot contain newlines");
});
