// Retraits vers mobile money (Wave, Orange Money, Free Money, Expresso) via les payouts Bitnob : quote → initialize → finalize.
// Le solde est débité dans la même transaction que la création du retrait (verrou par marchand),
// et recrédité automatiquement si Bitnob signale un échec.
import { config, realMoney } from '../config.js';
import { one, many, tx } from '../db/pool.js';
import { bitnob } from './bitnob.js';
import { newId } from './ids.js';
import { publish } from './bus.js';
import { balances, lockMerchant } from './ledger.js';
import { getXofPerBtc, xofToSats, xofToUsdtMicro } from './rates.js';

export const NETWORKS = {
  // bitnob : valeur attendue par le champ « network » du corridor SN (GET /api/payouts/supported-countries/SN)
  wave: { label: 'Wave', bitnob: 'wave' },
  orange_money: { label: 'Orange Money', bitnob: 'orange' },
  free_money: { label: 'Free Money (Mixx by Yas)', bitnob: 'free' },
  expresso: { label: 'Expresso', bitnob: 'expresso' },
};

const err = (message, status = 422) => Object.assign(new Error(message), { status });

// Numéro sénégalais : 9 chiffres commençant par 7 (77, 78, 76, 70, 75), avec ou sans +221
export function normalizeSnPhone(input) {
  const digits = String(input || '').replace(/\D/g, '').replace(/^00/, '');
  const local = digits.startsWith('221') ? digits.slice(3) : digits;
  return /^7[05678]\d{7}$/.test(local) ? local : null;
}

const accountNumber = (local) => (process.env.PAYOUT_PHONE_FORMAT === 'local' ? local : `221${local}`);

export function publicPayout(p) {
  return {
    id: p.id,
    reference: p.reference,
    amount: p.amount_xof,
    currency: 'XOF',
    source_asset: p.source_asset,
    source_amount: p.source_asset === 'BTC' ? p.source_amount : (p.source_amount / 1e6).toFixed(2),
    network: p.network,
    network_label: NETWORKS[p.network]?.label ?? p.network,
    phone: `+221 ${p.phone.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4')}`,
    account_name: p.account_name,
    provider: p.provider,
    trigger: p.trigger,
    status: p.status,
    error: p.error,
    created_at: p.created_at,
    completed_at: p.completed_at,
  };
}

export async function createPayout(merchant, { amount, network, phone, accountName, sourceAsset = 'BTC', trigger = 'manual' }) {
  // Argent réel : retraits (manuels et automatiques) réservés aux entreprises vérifiées
  if (realMoney() && merchant.verification_status !== 'verified')
    throw err("Les retraits réels sont réservés aux entreprises vérifiées. Faites vérifier votre entreprise dans l'espace marchand.", 403);
  const amountXof = Math.round(Number(amount));
  if (!Number.isFinite(amountXof) || amountXof < config.payouts.minXof) throw err(`Montant minimum de retrait : ${config.payouts.minXof} FCFA.`);
  if (amountXof > config.payouts.maxXof) throw err(`Montant maximum par retrait : ${config.payouts.maxXof.toLocaleString('fr-FR')} FCFA.`);
  if (!NETWORKS[network]) throw err('Choisissez Wave, Orange Money, Free Money ou Expresso.');
  const local = normalizeSnPhone(phone);
  if (!local) throw err('Numéro sénégalais invalide (ex. 77 123 45 67).');
  const name = String(accountName || '').trim().slice(0, 80);
  if (name.length < 2) throw err('Indiquez le nom du titulaire du compte.');
  if (!['BTC', 'USDT'].includes(sourceAsset)) throw err('Source invalide.');

  const rate = await getXofPerBtc();
  const payout = await tx(async (client) => {
    await lockMerchant(client, merchant.id);

    const today = await one(
      `SELECT COALESCE(SUM(amount_xof), 0)::bigint AS total FROM payouts
       WHERE merchant_id = $1 AND status <> 'failed' AND created_at >= date_trunc('day', now())`,
      [merchant.id],
      client,
    );
    if (today.total + amountXof > config.payouts.dailyMaxXof)
      throw err(`Plafond journalier de retrait atteint (${config.payouts.dailyMaxXof.toLocaleString('fr-FR')} FCFA).`);

    const sourceAmount = sourceAsset === 'BTC' ? xofToSats(amountXof, rate.xofPerBtc) : xofToUsdtMicro(amountXof);
    const b = await balances(merchant.id, client);
    const available = sourceAsset === 'BTC' ? b.btc_sats : b.usdt_micro;
    if (available < sourceAmount) throw err(`Solde ${sourceAsset} insuffisant pour retirer ${amountXof.toLocaleString('fr-FR')} FCFA.`);

    const id = newId('po');
    const p = await one(
      `INSERT INTO payouts (id, merchant_id, reference, amount_xof, source_asset, source_amount, network, phone, account_name, provider, trigger)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, merchant.id, `yp_${id}`, amountXof, sourceAsset, sourceAmount, network, local, name, config.payouts.mode, trigger],
      client,
    );
    await client.query(
      `INSERT INTO ledger_entries (merchant_id, asset, amount, type, payout_id, description, demo) VALUES ($1, $2, $3, 'payout', $4, $5, $6)`,
      [merchant.id, sourceAsset, -sourceAmount, id, `Retrait ${NETWORKS[network].label} ${amountXof} FCFA`, p.provider === 'simulated'],
    );
    return p;
  });

  publish(`merchant:${merchant.id}`, 'balance', { reason: 'payout' });
  execute(payout, merchant).catch((e) => failPayout(payout.id, e.message));
  return payout;
}

async function setStatus(id, status, extra = {}) {
  const p = await one(
    `UPDATE payouts SET status = $2, bitnob_quote_id = COALESCE($3, bitnob_quote_id), updated_at = now(),
       completed_at = CASE WHEN $2 = 'completed' THEN now() ELSE completed_at END
     WHERE id = $1 AND status NOT IN ('completed', 'failed') RETURNING *`,
    [id, status, extra.quoteId || null],
  );
  if (p) publish(`merchant:${p.merchant_id}`, 'payout', publicPayout(p));
  return p;
}

export async function completePayout(id) {
  return setStatus(id, 'completed');
}

// Échec : statut « failed » + écriture de remboursement (une seule fois grâce à l'index unique)
export async function failPayout(id, reason) {
  const p = await tx(async (client) => {
    const row = await one(
      `UPDATE payouts SET status = 'failed', error = $2, updated_at = now() WHERE id = $1 AND status NOT IN ('completed', 'failed') RETURNING *`,
      [id, String(reason || 'Échec').slice(0, 300)],
      client,
    );
    if (row)
      await client.query(
        `INSERT INTO ledger_entries (merchant_id, asset, amount, type, payout_id, description, demo) VALUES ($1, $2, $3, 'payout_reversal', $4, 'Retrait échoué, remboursé', $5)
         ON CONFLICT DO NOTHING`,
        [row.merchant_id, row.source_asset, row.source_amount, row.id, row.provider === 'simulated'],
        client,
      );
    return row;
  });
  if (p) {
    console.warn(`↩️  Retrait ${id} échoué et remboursé : ${reason}`);
    publish(`merchant:${p.merchant_id}`, 'payout', publicPayout(p));
    publish(`merchant:${p.merchant_id}`, 'balance', { reason: 'payout_reversal' });
  }
  return p;
}

async function execute(p, merchant) {
  if (p.provider === 'simulated') {
    await setStatus(p.id, 'processing');
    setTimeout(() => completePayout(p.id).catch(() => {}), 2500).unref?.();
    return;
  }
  const quote = await bitnob.payoutQuote({
    settlementAmount: p.amount_xof,
    country: config.payouts.country,
    fromAsset: p.source_asset,
    toCurrency: config.payouts.currency,
    reference: p.reference,
  });
  const quoteId = quote.quote_id || quote.id;
  await bitnob.payoutInitialize(quoteId, {
    reference: p.reference,
    reason: config.payouts.reason,
    callbackUrl: config.publicUrl.startsWith('https://') ? `${config.publicUrl}/webhooks/bitnob` : undefined,
    beneficiary: {
      destination_type: 'mobile_money',
      country: config.payouts.country,
      network: NETWORKS[p.network].bitnob,
      account_name: p.account_name,
      account_number: accountNumber(p.phone),
      // Expéditeur exigé par le corridor SN : le marchand qui retire ses fonds
      sender: { account_name: merchant.name, country: config.payouts.country },
    },
  });
  const fin = await bitnob.payoutFinalize(quoteId);
  const status = String(fin?.status || fin?.payout?.status || '').toUpperCase();
  if (status === 'COMPLETED') await completePayout(p.id);
  else if (status === 'FAILED') await failPayout(p.id, 'Refusé par Bitnob');
  else await setStatus(p.id, 'processing', { quoteId });
}

// Événements Bitnob : payouts.withdrawal.success / payout.transfer.success / …failed / …expired
export async function handlePayoutEvent(type, data) {
  const reference = data?.reference || data?.payout?.reference;
  if (!reference) return { status: 'ignored', reason: 'référence absente' };
  const p = await one('SELECT * FROM payouts WHERE reference = $1', [reference]);
  if (!p) return { status: 'ignored', reason: 'retrait inconnu' };
  if (/success|completed/i.test(type)) await completePayout(p.id);
  else if (/fail|expired|reversed/i.test(type)) await failPayout(p.id, type);
  return { status: 'payout', payout: p.id };
}

export const listPayouts = (merchantId) => many('SELECT * FROM payouts WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 50', [merchantId]);

// Diagnostic du corridor Sénégal (affiché dans le tableau de bord)
export async function corridorStatus() {
  if (config.payouts.mode === 'simulated') return { mode: 'simulated', available: true, message: 'Retraits simulés (mode démo).' };
  try {
    const countries = await bitnob.payoutCountries();
    const list = Array.isArray(countries) ? countries : countries?.countries ?? [];
    const sn = list.find((c) => (c.code || c.country || c.iso2) === config.payouts.country);
    return sn
      ? { mode: 'bitnob', available: true, message: `Corridor ${config.payouts.country} ouvert via Bitnob.` }
      : { mode: 'bitnob', available: false, message: `Corridor ${config.payouts.country} non listé sur ce compte Bitnob.` };
  } catch (e) {
    return { mode: 'bitnob', available: false, message: e.message };
  }
}

// Retrait automatique : dès que le solde BTC atteint le seuil choisi, tout est envoyé vers le compte par défaut.
// Activé une fois par le propriétaire (mot de passe exigé), il s'exécute ensuite sans intervention.
const AUTO_BUFFER = 0.98; // marge pour les arrondis de taux entre la cotation et le débit
export async function maybeAutoPayout(merchant) {
  if (!merchant.auto_payout_enabled || !merchant.payout_network || !merchant.payout_phone) return null;
  const rate = await getXofPerBtc();
  const { btc_sats: sats } = await balances(merchant.id);
  const availableXof = Math.floor((sats / 1e8) * rate.xofPerBtc);
  if (availableXof < Math.max(merchant.auto_payout_min_xof, config.payouts.minXof)) return null;
  const amount = Math.min(Math.floor((availableXof * AUTO_BUFFER) / 100) * 100, config.payouts.maxXof);
  try {
    const p = await createPayout(merchant, {
      amount,
      network: merchant.payout_network,
      phone: merchant.payout_phone,
      accountName: merchant.payout_name || merchant.name,
      sourceAsset: 'BTC',
      trigger: 'auto',
    });
    console.log(`🔁 Retrait automatique ${p.id} : ${amount} FCFA → ${NETWORKS[merchant.payout_network].label}`);
    return p;
  } catch (err) {
    console.warn(`Retrait automatique ${merchant.id} non effectué : ${err.message}`);
    return null;
  }
}
