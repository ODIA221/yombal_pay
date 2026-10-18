// Modèles d'e-mails YombalPay : HTML simple, compatible avec les clients mail, et version texte.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function layout({ title, body, button }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F3F7F4;font-family:Segoe UI,Arial,sans-serif;color:#0A0F0C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F7F4;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;border:1px solid #E1E8E3">
<tr><td style="background:#0E0F13;border-radius:20px 20px 0 0;padding:20px 28px;color:#FFFFFF;font-weight:800;font-size:18px;letter-spacing:.5px">YOMBAL<span style="color:#F7931A">PAY</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${esc(title)}</h1>
${body}
${
  button
    ? `<p style="margin:26px 0"><a href="${esc(button.href)}" style="background:#F7931A;color:#1A1206;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;display:inline-block">${esc(button.label)}</a></p>
<p style="font-size:12.5px;color:#56635B;margin:0">Le bouton ne marche pas ? Copiez ce lien : <br><span style="word-break:break-all">${esc(button.href)}</span></p>`
    : ''
}
</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #E1E8E3;font-size:12.5px;color:#56635B">YombalPay · Encaissez le monde entier en FCFA · Dakar, Sénégal</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (t) => `<p style="margin:0 0 12px;font-size:15.5px;line-height:1.6;color:#2B342E">${t}</p>`;

export function confirmEmail({ name, link }) {
  return {
    subject: 'Confirmez votre adresse e-mail',
    link,
    html: layout({
      title: `Bienvenue, ${name}`,
      body: p("Merci d'avoir créé votre compte YombalPay.") + p('Confirmez votre adresse e-mail pour pouvoir encaisser vos premiers paiements. Ce lien est valable 24 heures.'),
      button: { href: link, label: 'Confirmer mon adresse e-mail' },
    }),
    text: `Bienvenue sur YombalPay, ${name}.\nConfirmez votre adresse e-mail (lien valable 24 h) :\n${link}`,
  };
}

export function welcomeEmail({ name, appUrl, activationUrl }) {
  return {
    subject: 'Votre compte YombalPay est prêt',
    html: layout({
      title: 'Votre adresse est confirmée',
      body:
        p(`${esc(name)}, vous pouvez maintenant encaisser des clients du monde entier, avec des prix en FCFA.`) +
        p('<b>Prochaines étapes :</b>') +
        p(
          '1. Encaissez depuis la caisse, un lien de paiement ou l’API.<br>2. Partagez votre page publique et votre adresse Lightning.<br>' +
            `3. <a href="${esc(activationUrl)}" style="color:#C2410C">Faites vérifier votre entreprise</a> (NINEA, forme juridique, numéro mobile money) pour recevoir de vrais paiements.`,
        ),
      button: { href: appUrl, label: 'Ouvrir mon espace marchand' },
    }),
    text: `${name}, votre compte YombalPay est prêt.\nEspace marchand : ${appUrl}\nFaites vérifier votre entreprise pour les paiements réels : ${activationUrl}`,
  };
}

export function verificationReceivedEmail({ name }) {
  return {
    subject: 'Nous vérifions votre entreprise',
    html: layout({
      title: "Demande d'activation reçue",
      body:
        p(`Merci, ${esc(name)}. Nous vérifions les informations de votre entreprise (NINEA, forme juridique, numéro mobile money).`) +
        p("Vous recevrez un e-mail dès que la vérification est terminée. En attendant, vous pouvez continuer à tester YombalPay."),
    }),
    text: `Merci, ${name}. Nous vérifions les informations de votre entreprise. Vous recevrez un e-mail à la fin de la vérification.`,
  };
}

export function verificationRequestEmail({ legalName, email, adminUrl }) {
  return {
    subject: `Nouvelle demande d'activation : ${legalName}`,
    link: adminUrl,
    html: layout({ title: "Demande d'activation", body: p(`${esc(legalName)} (${esc(email)}) demande la vérification de son entreprise.`), button: { href: adminUrl, label: 'Vérifier la demande' } }),
    text: `${legalName} (${email}) demande l'activation : ${adminUrl}`,
  };
}

export function verificationResultEmail({ name, approved, note, appUrl, activationUrl }) {
  return approved
    ? {
        subject: 'Votre compte YombalPay est activé',
        html: layout({
          title: 'Entreprise vérifiée',
          body: p(`Bonne nouvelle, ${esc(name)} : votre entreprise est vérifiée.`) + p('Vous pouvez recevoir de vrais paiements et retirer vers votre mobile money.'),
          button: { href: appUrl, label: 'Ouvrir mon espace marchand' },
        }),
        text: `Bonne nouvelle, ${name} : votre entreprise est vérifiée. ${appUrl}`,
      }
    : {
        subject: "Votre demande d'activation doit être complétée",
        html: layout({
          title: 'Informations à corriger',
          body: p(`${esc(name)}, nous n'avons pas pu vérifier votre entreprise.`) + (note ? p(`<b>Motif :</b> ${esc(note)}`) : '') + p('Corrigez vos informations et renvoyez votre demande.'),
          button: { href: activationUrl, label: 'Corriger ma demande' },
        }),
        text: `${name}, nous n'avons pas pu vérifier votre entreprise.${note ? ` Motif : ${note}` : ''} Corrigez votre demande : ${activationUrl}`,
      };
}
