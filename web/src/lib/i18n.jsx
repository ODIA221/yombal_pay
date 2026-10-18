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
    noWallet: 'Aucun portefeuille Lightning sur cet appareil. La facture est copiée : scannez le QR code avec votre téléphone, ou collez-la dans votre portefeuille.',
    testnetInvoice: 'Facture de test (sandbox Bitnob) : elle se paie avec un portefeuille Lightning testnet, pas avec un portefeuille réel.',
    howTo: 'Comment payer ?',
    how1: 'Ouvrez un portefeuille Lightning (Bitnob, Phoenix, Wallet of Satoshi, Blink, Strike…).',
    how2: 'Scannez le QR code ou collez la facture.',
    how3: 'Confirmez : la page se met à jour toute seule en quelques secondes.',
    iPaid: "J'ai déjà payé",
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
    savings: (xof, pct) => `Vous évitez ≈ ${xof} de frais par rapport à un transfert d'argent classique (${pct} % en moyenne).`,
    saved: (xof) => `${xof} de frais évités par rapport à un transfert classique.`,
    receivedUsdt: (xof, usdt) => `${xof} réglés en ${usdt} USDT.`,
    network: 'Réseau',
    sendExactly: 'Envoyez exactement',
    usdtOr: 'USDT ou USDC',
    usdtWarn: (net) => `Uniquement sur le réseau ${net}. Un envoi sur un autre réseau serait perdu.`,
    usdtFrom: "Depuis Binance, Bitnob, Trust Wallet, OKX… Le paiement est confirmé dès que la blockchain l'a validé, en général en quelques minutes.",
    getAddress: "Afficher l'adresse de paiement",
    copyAddress: "Copier l'adresse",
    copyAmount: 'Copier le montant',
    usdtReceived: (got, total) => `Reçu : ${got} sur ${total} USDT. Envoyez le reste à la même adresse.`,
    receipt: 'Reçu de paiement',
    getReceipt: 'Télécharger le reçu',
    receiptNotPaid: "Ce paiement n'est pas encore réglé : le reçu sera disponible après paiement.",
    paidOn: 'Payé le',
    reference: 'Référence',
    method: 'Moyen de paiement',
    rate: 'Taux appliqué',
    feesAvoided: 'Frais évités',
    proof: 'Preuve de paiement',
    lnProof: 'Empreinte de la facture Lightning',
    chainProof: (net) => `Transaction ${net}`,
    verify: 'Scannez pour vérifier ce paiement auprès de YombalPay',
    printPdf: 'Imprimer / PDF',
    share: 'Partager',
    shareText: (m, xof) => `Reçu de paiement : ${xof} à ${m}`,
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
    noWallet: 'No Lightning wallet on this device. The invoice has been copied: scan the QR code with your phone, or paste it into your wallet.',
    testnetInvoice: 'Test invoice (Bitnob sandbox): pay it with a testnet Lightning wallet, not a real one.',
    howTo: 'How to pay?',
    how1: 'Open any Lightning wallet (Bitnob, Phoenix, Wallet of Satoshi, Blink, Strike…).',
    how2: 'Scan the QR code or paste the invoice.',
    how3: 'Confirm: this page updates by itself within seconds.',
    iPaid: "I've already paid",
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
    savings: (xof, pct) => `You avoid ≈ ${xof} in fees compared to a typical money transfer (${pct}% on average).`,
    saved: (xof) => `${xof} in fees avoided compared to a typical money transfer.`,
    receivedUsdt: (xof, usdt) => `${xof} paid with ${usdt} USDT.`,
    network: 'Network',
    sendExactly: 'Send exactly',
    usdtOr: 'USDT or USDC',
    usdtWarn: (net) => `${net} network only. Funds sent on another network would be lost.`,
    usdtFrom: 'From Binance, Bitnob, Trust Wallet, OKX… The payment is confirmed once the blockchain validates it, usually within minutes.',
    getAddress: 'Show payment address',
    copyAddress: 'Copy address',
    copyAmount: 'Copy amount',
    usdtReceived: (got, total) => `Received ${got} of ${total} USDT. Send the rest to the same address.`,
    receipt: 'Payment receipt',
    getReceipt: 'Download receipt',
    receiptNotPaid: 'This payment has not been completed yet: the receipt will be available once it is paid.',
    paidOn: 'Paid on',
    reference: 'Reference',
    method: 'Payment method',
    rate: 'Exchange rate',
    feesAvoided: 'Fees avoided',
    proof: 'Proof of payment',
    lnProof: 'Lightning invoice hash',
    chainProof: (net) => `${net} transaction`,
    verify: 'Scan to verify this payment with YombalPay',
    printPdf: 'Print / PDF',
    share: 'Share',
    shareText: (m, xof) => `Payment receipt: ${xof} to ${m}`,
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
