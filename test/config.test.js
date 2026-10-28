import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDotenv, buildConfig } from "../src/config.js";

const base = { ADMIN_TOKEN: "a-long-enough-secret-token" };

test("parseDotenv handles quotes, comments and blanks", () => {
  const env = parseDotenv(`# comment\nA=1\nB="two words" \nC='x' # trailing\nD=plain # comment\n\nbad line\n`);
  assert.deepEqual(env, { A: "1", B: "two words", C: "x", D: "plain" });
});

test("buildConfig rejects a missing or weak admin token", () => {
  assert.throws(() => buildConfig({}), /ADMIN_TOKEN is required/);
  assert.throws(() => buildConfig({ ADMIN_TOKEN: "short" }), /at least 12/);
  assert.throws(() => buildConfig({ ADMIN_TOKEN: "change-me-to-a-long-random-secret" }), /not the example/);
});

test("buildConfig defaults and warns when no channel is set", () => {
  const c = buildConfig(base);
  assert.equal(c.port, 8080);
  assert.equal(c.pollSeconds, 20);
  assert.equal(c.noticeMinutes, 20);
  assert.equal(c.email, null);
  assert.equal(c.whatsapp, null);
  assert.ok(c.warnings.some((w) => /nobody will be notified/.test(w)));
});

test("buildConfig validates ranges and channel completeness", () => {
  assert.throws(() => buildConfig({ ...base, POLL_SECONDS: "5" }), /POLL_SECONDS/);
  assert.throws(() => buildConfig({ ...base, TWILIO_ACCOUNT_SID: "AC1" }), /TWILIO_AUTH_TOKEN/);
  assert.throws(() => buildConfig({ ...base, TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_WHATSAPP_FROM: "+1415" }), /TWILIO_WHATSAPP_FROM/);
  const c = buildConfig({ ...base, SMTP_HOST: "smtp.x", SMTP_USER: "u@x", SMTP_PASS: "p", WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" });
  assert.equal(c.email.from, "u@x");
  assert.equal(c.whatsapp.provider, "meta");
  assert.ok(c.warnings.some((w) => /WHATSAPP_TEMPLATE_NAME/.test(w)));
});

test("buildConfig parses RECIPIENTS_JSON", () => {
  assert.throws(() => buildConfig({ ...base, RECIPIENTS_JSON: "{" }), /RECIPIENTS_JSON/);
  assert.equal(buildConfig({ ...base, RECIPIENTS_JSON: '[{"name":"A","email":"a@b.co"}]' }).seedRecipients.length, 1);
});
