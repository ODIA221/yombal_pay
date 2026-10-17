// Traductions des pages vues par le client payeur (souvent à l'étranger) : français / anglais.
import { useState } from 'react';

const DICT = {
  fr: {
    payTo: 'Paiement à',
    pay: 'Payer',
    demo: 'Mode démo',
    notFound: 'Paiement introuvable',
    merchantNotFound: 'Marchand introuvable',
    checkLink: 'Vérifiez le lien qui vous a été envoyé.',
    received: 'Paiement reçu',
    receivedText: (xof, sats) => `${xof} réglés en ${sats} sats via Lightning.`,
    merchantNotified: 'Le marchand a été notifié.',
    backTo: (name) => `Retour chez ${name}`,
    expired: 'Facture expirée',
    expiredText: "Le taux n'est plus garanti. Revenez sur le site du marchand pour relancer le paiement.",
    backToMerchant: 'Retour au marchand',
    waiting: 'En attente du paiement',
    rateValid: 'Durée de validité du taux',
    openWallet: 'Ouvrir mon portefeuille',
    copyInvoice: 'Copier la facture',
    howTo: 'Comment payer ?',
    how1: 'Ouvrez un portefeuille Lightning (Bitnob, Phoenix, Wallet of Satoshi, Blink, Strike…).',
    how2: 'Scannez le QR code ou collez la facture.',
    how3: 'Confirmez : la page se met à jour toute seule en quelques secondes.',
    iPaid: "J'ai payé — vérifier",
    checking: 'Vérification…',
    simulate: 'Simuler le paiement (démo)',
    simulating: 'Envoi du webhook…',
    securedBy: 'Paiement sécurisé par',
    amountHint: 'Montant converti en Bitcoin au taux du moment',
    yourName: 'Votre nom (facultatif)',
    reason: 'Motif : facture, cadeau, commande… (facultatif)',
    forRelative: 'Je paie pour un proche',
    relativeName: 'Pour qui ? (ex. Maman, Moussa)',
    preparing: 'Préparation…',
    sendDirect: "Vous avez un portefeuille Lightning ? Envoyez directement à l'adresse",
    amountLabel: 'Montant en FCFA',
  },
  en: {
    payTo: 'Payment to',
    pay: 'Pay',
    demo: 'Demo mode',
    notFound: 'Payment not found',
    merchantNotFound: 'Merchant not found',
    checkLink: 'Please check the link you received.',
    received: 'Payment received',
    receivedText: (xof, sats) => `${xof} paid with ${sats} sats over Lightning.`,
    merchantNotified: 'The merchant has been notified.',
    backTo: (name) => `Back to ${name}`,
    expired: 'Invoice expired',
    expiredText: 'The exchange rate is no longer guaranteed. Go back to the merchant to start a new payment.',
    backToMerchant: 'Back to merchant',
    waiting: 'Waiting for payment',
    rateValid: 'Rate guaranteed for',
    openWallet: 'Open my wallet',
    copyInvoice: 'Copy invoice',
    howTo: 'How to pay?',
    how1: 'Open any Lightning wallet (Bitnob, Phoenix, Wallet of Satoshi, Blink, Strike…).',
    how2: 'Scan the QR code or paste the invoice.',
    how3: 'Confirm: this page updates by itself within seconds.',
    iPaid: 'I paid — check',
    checking: 'Checking…',
    simulate: 'Simulate payment (demo)',
    simulating: 'Sending webhook…',
    securedBy: 'Secure payment by',
    amountHint: 'Converted to Bitcoin at the current rate',
    yourName: 'Your name (optional)',
    reason: 'Reason: invoice, gift, order… (optional)',
    forRelative: "I'm paying for a relative",
    relativeName: 'For whom? (e.g. Mum, Moussa)',
    preparing: 'Preparing…',
    sendDirect: 'Have a Lightning wallet? Send straight to the address',
    amountLabel: 'Amount in CFA francs',
  },
};

function initialLang() {
  try {
    const saved = localStorage.getItem('yp_lang');
    if (saved && DICT[saved]) return saved;
  } catch {}
  return (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function useLang() {
  const [lang, setLangState] = useState(initialLang);
  const setLang = (l) => {
    setLangState(l);
    try {
      localStorage.setItem('yp_lang', l);
    } catch {}
  };
  return { lang, setLang, t: DICT[lang] };
}

export function LangSwitch({ lang, setLang }) {
  return (
    <div className="lang-switch" role="group" aria-label="Langue / Language">
      {['fr', 'en'].map((l) => (
        <button key={l} type="button" className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
