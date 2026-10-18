// Modèles d'emails YombalPay : HTML simple, compatible avec les clients mail, et version texte.
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function layout({ title, body, button }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F3F7F4;font-family:Segoe UI,Arial,sans-serif;color:#0A0F0C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F7F4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;border:1px solid #E1E8E3">
<tr><td style="background:#0A0F0C;border-radius:20px 20px 0 0;padding:20px 28px;color:#FFFFFF;font-weight:800;font-size:18px;letter-spacing:.5px">YOMBAL<span style="color:#E2B341">PAY</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(title)}</h1>
${body}
${button ? `<p style="margin:26px 0"><a href="${esc(button.href)}" style="background:#8F6A00;color:#FFFFFF;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">${esc(button.label)}</a></p>
<p style="font-size:12.5px;color:#56635B;margin:0">Le bouton ne marche pas ? Copiez ce lien : <br><span style="word-break:break-all">${esc(button.href)}</span></p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E1E8E3;font-size:12.5px;color:#56635B">YombalPay · Paiements Bitcoin Lightning en FCFA · Dakar, Sénégal</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (t) => `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#2B342E">${t}</p>`;

export function confirmEmail({ businessName, link }) {
  return {
    subject: "Confirmez votre adresse email",
    link,
    html: layout({
      title: `Bienvenue, ${businessName}`,
      body: p("Merci d'avoir créé votre compte YombalPay.") + p("Confirmez votre adresse email pour pouvoir créer vos premiers paiements. Ce lien est valable 24 heures."),
      button: { href: link, label: "Confirmer mon adresse email" },
    }),
    text: `Bienvenue sur YombalPay, ${businessName}.\nConfirmez votre adresse email (lien valable 24 h) :\n${link}`,
  };
}

export function welcomeEmail({ businessName, dashboardUrl, activationUrl }) {
  return {
    subject: "Votre compte YombalPay est prêt",
    html: layout({
      title: "Votre adresse est confirmée",
      body:
        p(`${esc(businessName)}, vous pouvez maintenant encaisser en Bitcoin Lightning avec des prix en FCFA, en mode test.`) +
        p("<b>Prochaines étapes :</b>") +
        p("1. Créez un paiement depuis votre tableau de bord ou avec l'API.<br>2. Simulez-le en mode test pour voir le parcours complet.<br>" +
          `3. <a href="${esc(activationUrl)}" style="color:#8F6A00">Activez votre compte</a> (NINEA, forme juridique, numéro Wave ou Orange Money) pour recevoir de vrais paiements.`),
      button: { href: dashboardUrl, label: "Ouvrir mon tableau de bord" },
    }),
    text: `${businessName}, votre compte YombalPay est prêt.\nTableau de bord : ${dashboardUrl}\nActivez votre compte pour les paiements réels : ${activationUrl}`,
  };
}

export function verificationReceivedEmail({ businessName }) {
  return {
    subject: "Nous vérifions votre entreprise",
    html: layout({
      title: "Demande d'activation reçue",
      body: p(`Merci, ${esc(businessName)}. Nous vérifions les informations de votre entreprise (NINEA, forme juridique, numéro Wave ou Orange Money).`) +
        p("Vous recevrez un email dès que la vérification est terminée. En attendant, le mode test reste disponible."),
    }),
    text: `Merci, ${businessName}. Nous vérifions les informations de votre entreprise. Vous recevrez un email à la fin de la vérification.`,
  };
}

export function verificationResultEmail({ businessName, approved, note, dashboardUrl, activationUrl }) {
  return approved
    ? {
        subject: "Votre compte YombalPay est activé",
        html: layout({
          title: "Compte activé",
          body: p(`Bonne nouvelle, ${esc(businessName)} : votre entreprise est vérifiée.`) + p("Générez votre clé de production dans l'onglet Développeurs de votre tableau de bord, puis passez en mode « Production » pour encaisser de vrais paiements."),
          button: { href: dashboardUrl, label: "Ouvrir mon tableau de bord" },
        }),
        text: `Bonne nouvelle, ${businessName} : votre entreprise est vérifiée. ${dashboardUrl}`,
      }
    : {
        subject: "Votre demande d'activation doit être complétée",
        html: layout({
          title: "Informations à corriger",
          body: p(`${esc(businessName)}, nous n'avons pas pu vérifier votre entreprise.`) + (note ? p(`<b>Motif :</b> ${esc(note)}`) : "") + p("Corrigez vos informations et renvoyez votre demande."),
          button: { href: activationUrl, label: "Corriger ma demande" },
        }),
        text: `${businessName}, nous n'avons pas pu vérifier votre entreprise.${note ? " Motif : " + note : ""} Corrigez votre demande : ${activationUrl}`,
      };
}
