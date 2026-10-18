// Marchand de démonstration « African Costume Shop » (boutique de démo + tableau de bord pré-rempli).
import crypto from 'node:crypto';
import { config } from './config.js';
import { one, tx } from './db/pool.js';
import { createApiKey, createMerchant } from './lib/merchants.js';
import { hashPassword, randomToken, sha256, verifyPassword } from './lib/security.js';
import { creditPayment } from './lib/ledger.js';
import { newId } from './lib/ids.js';
import { getXofPerBtc, xofToSats } from './lib/rates.js';

const HISTORY = [
  [6, 65000, 'Grand boubou brodé bleu ciel'], [6, 12500, 'Chemise dashiki'], [5, 38000, 'Robe bazin brodée émeraude'], [4, 9500, 'Étole kente tissée main'],
  [4, 22000, 'Kaftan imprimé femme'], [3, 45000, 'Boubou bazin riche bleu nuit'], [2, 12500, 'Chemise dashiki'], [2, 32000, 'Boubou teint à la main'],
  [1, 35000, 'Ensemble kaftan blanc de cérémonie'], [1, 9500, 'Étole kente tissée main'], [0, 22000, 'Kaftan imprimé femme'],
];

// Ventes de démo créées du temps de « Wax & Co » : renommées avec les produits actuels (rien n'est supprimé,
// le registre reste cohérent). Ne touche que les paiements fictifs (demo = true) du compte de démo.
const WAX_TO_ACS = [
  ['Sac cabas en wax', 'Étole kente tissée main'],
  ['Foulard bazin brodé', 'Chemise dashiki'],
  ['Chemise wax homme', 'Kaftan imprimé femme'],
  ['Panier tressé de Thiès', 'Étole kente tissée main'],
  ['Robe wax sur mesure', 'Robe bazin brodée émeraude'],
];
async function renameWaxHistory(merchantId) {
  await tx(async (client) => {
    for (const [from, to] of WAX_TO_ACS)
      await client.query(`UPDATE checkouts SET description = $3 WHERE merchant_id = $1 AND demo AND description IN ($2, 'Wax & Co — ' || $2)`, [merchantId, from, to]);
    await client.query(`UPDATE checkouts SET reference = 'ACS-' || substr(reference, 5) WHERE merchant_id = $1 AND demo AND reference LIKE 'WAX-%'`, [merchantId]);
    // Ancien format de la boutique : « African Costume Shop — Produit (taille) »
    await client.query(`UPDATE checkouts SET description = substr(description, 24) WHERE merchant_id = $1 AND demo AND description LIKE 'African Costume Shop — %'`, [merchantId]);
    await client.query(`UPDATE ledger_entries SET description = 'Paiement ACS-' || substr(description, 14) WHERE merchant_id = $1 AND description LIKE 'Paiement WAX-%'`, [merchantId]);
  });
}

// Valeurs par défaut écrites dans le code (dépôt public) : connues de tous, donc interdites en production
const PUBLIC_DEFAULTS = { apiKey: 'sk_test_acs_demo_2026', webhookSecret: 'whsec_acs_demo_2026', payoutPin: '2026' };

export async function seedDemo() {
  const d = { ...config.demoMerchant };
  if (config.isProduction) {
    const known = Object.keys(PUBLIC_DEFAULTS).filter((k) => k !== 'payoutPin' && d[k] === PUBLIC_DEFAULTS[k]);
    if (known.length) {
      console.warn(
        `⚠️  Compte démo non créé : ${known.join(', ')} garde la valeur par défaut du code public. ` +
          'Renseignez DEMO_MERCHANT_KEY et DEMO_MERCHANT_WEBHOOK_SECRET, ou SEED_DEMO=false.',
      );
      return null;
    }
    if (d.payoutPin === PUBLIC_DEFAULTS.payoutPin) d.payoutPin = ''; // pas de code de retrait connu de tous
  }
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
  // Code de retrait du compte démo, aligné sur le .env (2026 par défaut)
  if (/^\d{4,6}$/.test(d.payoutPin) && !(m.payout_pin_hash && (await verifyPassword(d.payoutPin, m.payout_pin_hash))))
    m = await one('UPDATE merchants SET payout_pin_hash = $2 WHERE id = $1 RETURNING *', [m.id, await hashPassword(d.payoutPin)]);
  // Le compte démo est confirmé ; en mode démo il est aussi « entreprise vérifiée » (argent fictif). Hors démo,
  // il passe par la vérification comme les autres : il ne contourne jamais le contrôle avant l'argent réel.
  await one(
    `UPDATE merchants SET email_verified_at = COALESCE(email_verified_at, now()),
       verification_status = CASE WHEN $3 THEN 'verified' ELSE verification_status END,
       verification = CASE WHEN $3 THEN COALESCE(verification, $2) ELSE verification END WHERE id = $1 RETURNING 1`,
    [m.id, { legal_name: d.name, legal_form: 'ei', sector: 'artisanat', city: 'Dakar' }, config.demoMode],
  );
  await createApiKey(m.id, 'Boutique de démo', { rawKey: d.apiKey });
  // Seule la clé de démo actuelle reste active (l'ancienne clé « waxco » est révoquée)
  await one(
    `UPDATE api_keys SET revoked_at = now() WHERE merchant_id = $1 AND label = 'Boutique de démo' AND key_hash <> $2 AND revoked_at IS NULL RETURNING 1`,
    [m.id, sha256(d.apiKey)],
  );
  await renameWaxHistory(m.id);

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
