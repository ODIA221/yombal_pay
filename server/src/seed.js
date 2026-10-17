// Marchand de démonstration « African Costume Shop » (boutique de démo + tableau de bord pré-rempli).
import crypto from 'node:crypto';
import { config } from './config.js';
import { one, tx } from './db/pool.js';
import { createApiKey, createMerchant } from './lib/merchants.js';
import { hashPassword, randomToken, verifyPassword } from './lib/security.js';
import { creditPayment } from './lib/ledger.js';
import { newId } from './lib/ids.js';
import { getXofPerBtc, xofToSats } from './lib/rates.js';

const HISTORY = [
  [6, 65000, 'Grand boubou brodé bleu ciel'], [6, 12500, 'Chemise dashiki'], [5, 38000, 'Robe bazin brodée émeraude'], [4, 9500, 'Étole kente tissée main'],
  [4, 22000, 'Kaftan imprimé femme'], [3, 45000, 'Boubou bazin riche bleu nuit'], [2, 12500, 'Chemise dashiki'], [2, 32000, 'Boubou teint à la main'],
  [1, 35000, 'Ensemble kaftan blanc de cérémonie'], [1, 9500, 'Étole kente tissée main'], [0, 22000, 'Kaftan imprimé femme'],
];

export async function seedDemo() {
  const d = { ...config.demoMerchant };
  let generated = false;
  if (!d.password) {
    d.password = randomToken(9);
    generated = true;
  }
  let m = await one('SELECT * FROM merchants WHERE username = $1', [d.username]);
  // Ancien compte démo « Wax & Co Dakar » : renommé plutôt que dupliqué (l'e-mail est unique)
  if (!m)
    m = await one(
      `UPDATE merchants SET name = $1, username = $2, publishable_key = $3, webhook_secret = $4 WHERE is_demo AND username = 'waxco' RETURNING *`,
      [d.name, d.username, d.publishableKey, d.webhookSecret],
    );
  // Compte démo existant : on aligne e-mail et mot de passe sur le .env
  if (m && (m.email !== d.email.toLowerCase() || (!generated && !(await verifyPassword(d.password, m.password_hash))))) {
    m = await one('UPDATE merchants SET email = $2, password_hash = $3 WHERE id = $1 RETURNING *', [m.id, d.email.toLowerCase(), await hashPassword(d.password)]);
    await one('DELETE FROM sessions WHERE merchant_id = $1 RETURNING 1', [m.id]);
  } else if (m && generated) {
    d.password = null; // mot de passe inchangé, on ne l'affiche pas
  }
  if (!m) {
    m = await tx(async (client) => {
      const created = await createMerchant({ name: d.name, email: d.email, password: d.password, username: d.username, phone: '+221 77 000 00 00' }, client);
      return one(
        `UPDATE merchants SET publishable_key = $2, webhook_secret = $3, webhook_url = $4, is_demo = true,
           payout_network = 'wave', payout_phone = '770000000', payout_name = 'Aïssatou Ndiaye' WHERE id = $1 RETURNING *`,
        [created.id, d.publishableKey, d.webhookSecret, d.webhookUrl],
        client,
      );
    });
  }
  await createApiKey(m.id, 'Boutique de démo', { rawKey: d.apiKey });

  // Historique de ventes (mode démo uniquement : jamais de fausses données en réel)
  if (config.demoMode && !(await one('SELECT 1 FROM checkouts WHERE merchant_id = $1 LIMIT 1', [m.id]))) {
    const rate = await getXofPerBtc();
    await tx(async (client) => {
      for (const [daysAgo, xof, label] of HISTORY) {
        const id = newId('chk');
        const sats = xofToSats(xof, rate.xofPerBtc);
        const at = new Date(Date.now() - daysAgo * 86_400_000 - Math.floor(Math.random() * 6) * 3_600_000);
        const c = await one(
          `INSERT INTO checkouts (id, merchant_id, reference, bitnob_reference, description, amount_xof, amount_sats, fee_sats, xof_per_btc, rate_source,
             status, invoice_id, invoice_request, payment_hash, expires_at, source, demo, created_at, paid_at, confirmed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'paid',$11,$12,$13,$14,$15,true,$16,$16,'webhook_demo') RETURNING *`,
          [
            id, m.id, `ACS-${id.slice(4, 10).toUpperCase()}`, `yp_${id}`, label, xof, sats, Math.floor(sats / 100), Math.round(rate.xofPerBtc), rate.source,
            newId('inv_demo'), `lnbc${sats}0n1pdemo`, crypto.randomBytes(32).toString('hex'), at,
            ['api', 'pos', 'payment_link', 'lightning_address'][Math.floor(Math.random() * 4)], at,
          ],
          client,
        );
        await creditPayment(client, c);
      }
    });
  }
  return { email: d.email, password: generated ? d.password : null, apiKey: d.apiKey };
}
