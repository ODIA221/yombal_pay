// Envoi d'e-mails (SMTP, par exemple Gmail avec un mot de passe d'application).
// Sans SMTP configuré, l'e-mail n'est pas envoyé : son sujet et son lien sont affichés dans le terminal.
import nodemailer from 'nodemailer';
import { config } from '../config.js';

export const mailConfigured = () => Boolean(config.smtp.host && config.smtp.user && config.smtp.pass);

let transport;

// Un échec est journalisé mais ne bloque jamais l'inscription, la vérification ou un paiement
export async function sendMail({ to, subject, html, text, link }) {
  if (!mailConfigured()) {
    console.log(`✉️  E-mail non envoyé (SMTP non configuré) · à ${to} · « ${subject} »${link ? `\n   Lien : ${link}` : ''}`);
    return { sent: false };
  }
  try {
    transport ??= nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
    await transport.sendMail({ from: config.smtp.from, to, subject, html, text });
    console.log(`✉️  « ${subject} » envoyé à ${to}`);
    return { sent: true };
  } catch (err) {
    console.error(`✉️  Échec de l'envoi à ${to} (${err.message})${link ? `\n   Lien : ${link}` : ''}`);
    return { sent: false, error: err.message };
  }
}
