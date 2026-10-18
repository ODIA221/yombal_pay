import nodemailer from "nodemailer";
import { config } from "./config.js";

const configured = () => Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

let transport = null;
let testAccountPromise = null;

// Sans SMTP (développement) : boîte de test Ethereal, créée automatiquement. Les emails n'arrivent
// chez personne, mais chacun a une page d'aperçu (lien affiché dans le terminal).
async function getTransport() {
  if (transport) return transport;
  if (configured()) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  } else {
    testAccountPromise ??= nodemailer.createTestAccount();
    const acc = await testAccountPromise;
    transport = nodemailer.createTransport({ host: acc.smtp.host, port: acc.smtp.port, secure: acc.smtp.secure, auth: { user: acc.user, pass: acc.pass } });
  }
  return transport;
}

// Envoie un email. Un échec est journalisé mais ne bloque jamais l'inscription ou le paiement.
export async function sendMail({ to, subject, html, text, link }) {
  const real = configured();
  try {
    const info = await (await getTransport()).sendMail({ from: real ? config.smtp.from : "YombalPay <no-reply@yombalpay.sn>", to, subject, html, text });
    if (real) {
      console.log(`[email] « ${subject} » envoyé à ${to}`);
    } else {
      console.log(`\n[email de test, non livré : Gmail pas encore configuré]\n  À : ${to}\n  Sujet : ${subject}\n  Aperçu : ${nodemailer.getTestMessageUrl(info)}${link ? `\n  Lien : ${link}` : ""}\n`);
    }
    return { sent: real, preview: real ? null : nodemailer.getTestMessageUrl(info) };
  } catch (err) {
    console.error(`[email] échec de l'envoi à ${to} : ${err.message}\n  Sujet : ${subject}${link ? `\n  Lien : ${link}` : ""}`);
    return { sent: false, error: err.message };
  }
}

export const mailConfigured = configured;
