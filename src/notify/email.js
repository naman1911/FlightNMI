// Email over SMTP using nodemailer. Plain text only.
import nodemailer from "nodemailer";

export function createEmailChannel(cfg, { transportFactory = nodemailer.createTransport } = {}) {
  const transport = transportFactory({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
  });
  return {
    name: "email",
    describe: () => `${cfg.host}:${cfg.port}${cfg.secure ? " (TLS)" : ""} as ${cfg.from}`,
    async verify() { return transport.verify(); },
    async send({ to, subject, text }) {
      const info = await transport.sendMail({ from: cfg.from, to, subject, text });
      return { id: info.messageId || "" };
    },
  };
}
