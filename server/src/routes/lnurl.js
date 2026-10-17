// Adresse Lightning (LUD-16) : aissatou@domaine se paie depuis n'importe quel portefeuille Lightning.
// LUD-06 payRequest + LUD-12 commentaires + LUD-21 vérification du paiement.
// Chaque paiement crée une facture Bitnob via le même cœur que les checkouts (ledger, webhooks, notifications).
import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import { lightningAddress, merchantByUsername } from '../lib/merchants.js';
import { createCheckout, getCheckout, MIN_XOF, MAX_XOF } from '../lib/payments.js';
import { getXofPerBtc, xofToSats } from '../lib/rates.js';
import { rateLimit } from '../lib/security.js';

export const lnurlRouter = express.Router();
lnurlRouter.use(cors()); // les portefeuilles web appellent ces routes depuis d'autres origines

const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const lnError = (res, reason, status = 200) => res.status(status).json({ status: 'ERROR', reason });
const metadata = (m) => JSON.stringify([
  ['text/plain', `Paiement à ${m.name} via YombalPay`],
  ['text/identifier', lightningAddress(m)],
]);

lnurlRouter.get('/.well-known/lnurlp/:username', h(async (req, res) => {
  const m = await merchantByUsername(req.params.username);
  if (!m) return lnError(res, 'Adresse Lightning inconnue.', 404);
  const rate = await getXofPerBtc();
  res.json({
    tag: 'payRequest',
    callback: `${config.publicUrl}/lnurlp/${m.username}/callback`,
    minSendable: xofToSats(MIN_XOF, rate.xofPerBtc) * 1000,
    maxSendable: Math.min(xofToSats(MAX_XOF, rate.xofPerBtc), 20_000_000) * 1000,
    metadata: metadata(m),
    commentAllowed: 120,
  });
}));

lnurlRouter.get(
  '/lnurlp/:username/callback',
  rateLimit({ name: 'lnurl', limit: 30, windowMs: 600_000 }),
  h(async (req, res) => {
    const m = await merchantByUsername(req.params.username);
    if (!m) return lnError(res, 'Adresse Lightning inconnue.', 404);
    const msats = Number(req.query.amount);
    if (!Number.isInteger(msats) || msats < 1000) return lnError(res, 'Montant invalide.');
    const rate = await getXofPerBtc();
    const sats = Math.floor(msats / 1000);
    if (sats < xofToSats(MIN_XOF, rate.xofPerBtc)) return lnError(res, `Montant minimum : ${MIN_XOF} FCFA.`);
    if (sats > 20_000_000) return lnError(res, 'Montant trop élevé.');
    const comment = String(req.query.comment || '').trim().slice(0, 120);
    try {
      const { checkout } = await createCheckout(m, {
        amount_sats: sats,
        description: comment ? `${m.name} — ${comment}` : `Paiement à ${m.name}`,
        payer_note: comment || null,
        source: 'lightning_address',
      });
      res.json({
        pr: checkout.invoice_request,
        routes: [],
        verify: `${config.publicUrl}/lnurlp/verify/${checkout.id}`,
        successAction: { tag: 'message', message: `Merci ! ${m.name} a reçu votre paiement.` },
        disposable: false,
      });
    } catch (e) {
      lnError(res, `Facture indisponible : ${e.message}`);
    }
  }),
);

// LUD-21 : le portefeuille peut vérifier que la facture est réglée
lnurlRouter.get('/lnurlp/verify/:id', h(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c || c.source !== 'lightning_address') return lnError(res, 'Introuvable.', 404);
  res.json({ status: 'OK', settled: c.status === 'paid', preimage: c.status === 'paid' ? c.preimage : null, pr: c.invoice_request });
}));
