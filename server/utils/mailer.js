// utils/mailer.js
// Thin wrapper around nodemailer for outbound notification e-mail.
//
// Configured entirely through environment variables (put them in server/.env):
//   SMTP_HOST      e.g. smtp.gmail.com
//   SMTP_PORT      e.g. 587
//   SMTP_SECURE    "true" for port 465 (implicit TLS), otherwise leave unset
//   SMTP_USER      SMTP username
//   SMTP_PASS      SMTP password / app password
//   SMTP_FROM      From header, e.g. "PLASU SMIS <no-reply@plasu.edu.ng>"
//   MAIL_ENABLED   "false" to hard-disable even if the above are set
//
// If SMTP is not configured the module becomes a no-op that just logs — the
// rest of the app keeps working, and in-app (bell) notifications are unaffected.
let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (_) {
  /* nodemailer not installed — mailer stays disabled */
}

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  MAIL_ENABLED,
} = process.env;

const enabled =
  MAIL_ENABLED !== "false" && !!nodemailer && !!SMTP_HOST && !!SMTP_USER && !!SMTP_PASS;

let transporter = null;
if (enabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  console.log(`[mailer] SMTP enabled via ${SMTP_HOST}:${Number(SMTP_PORT) || 587}`);
} else {
  console.log("[mailer] SMTP not configured — e-mail notifications are disabled (in-app notifications still work).");
}

const FROM = SMTP_FROM || SMTP_USER || "PLASU SMIS <no-reply@plasu.edu.ng>";

// Fire-and-forget: never throws, never blocks the request flow.
function sendMail({ to, subject, text, html }) {
  if (!to) return Promise.resolve({ skipped: "no recipient" });
  if (!enabled) {
    console.log(`[mailer] (disabled) would send to ${to}: ${subject}`);
    return Promise.resolve({ skipped: "disabled" });
  }
  return transporter
    .sendMail({ from: FROM, to, subject, text, html: html || undefined })
    .then((info) => {
      console.log(`[mailer] sent to ${to}: ${subject} (${info.messageId})`);
      return info;
    })
    .catch((err) => {
      console.error(`[mailer] FAILED to send to ${to}: ${err.message}`);
      return { error: err.message };
    });
}

module.exports = { sendMail, mailerEnabled: enabled };
