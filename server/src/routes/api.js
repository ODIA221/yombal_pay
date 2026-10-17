// API v1 : paiements (clé API ou session), espace marchand (session), pages publiques.
import express from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { one, many, query } from '../db/pool.js';
import { bitnob } from '../lib/bitnob.js';
import { authenticate, optionalAuth } from '../lib/auth.js';
import { subscribe } from '../lib/bus.js';
import { getXofPerBtc } from '../lib/rates.js';
import { newId } from '../lib/ids.js';
import { createApiKey, emailTaken, listApiKeys, merchantByUsername, merchantView, revokeApiKey, lightningAddress } from '../lib/merchants.js';
import { listDeliveries, retryDelivery } from '../lib/notifier.js';
import { balancesView, convertToUsdt, listConversions, listLedger, stats } from '../lib/ledger.js';
import { corridorStatus, createPayout, listPayouts, NETWORKS, normalizeSnPhone, publicPayout } from '../lib/payouts.js';
import {
  createCheckout,
  getCheckout,
  listCheckouts,
  privateCheckout,
  publicCheckout,
  refreshFromBitnob,
  validateAmountXof,
  MIN_XOF,
  MAX_XOF,
} from '../lib/payments.js';
import { assertSafeWebhookUrl, audit, hashPassword, randomToken, rateLimit, verifyPassword } from '../lib/security.js';
import { processBitnobEvent } from './webhooks.js';
import { depositAddress } from '../lib/stablecoins.js';

export const api = express.Router();
api.use(express.json({ limit: '100kb' }));

const fail = (res, status, code, message) => res.status(status).json({ error: { code, message } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const merchantOnly = authenticate(['session', 'secret_key']);
const sessionOnly = authenticate(['session']);

// Les détails d'une erreur Bitnob (IP non autorisée, compte inactif…) restent dans les journaux du serveur
// et dans l'espace du marchand. Le client final ne voit qu'un message simple.
const PAYMENT_DOWN = 'Le paiement est momentanément indisponible. Réessayez dans quelques instants.';
function bitnobFail(res, e, { showDetail = false } = {}) {
  console.error('Bitnob :', e.message);
  return fail(res, 502, 'bitnob_error', showDetail ? e.message : PAYMENT_DOWN);
}

// ── Santé & taux ────────────────────────────────────────────────────────────
api.get('/health', wrap(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, mode: config.demoMode ? 'demo' : 'live', database: 'ok', public_url: config.publicUrl, time: new Date().toISOString() });
}));

api.get('/rates', wrap(async (req, res) => {
  const r = await getXofPerBtc({ force: req.query.force === '1' });
  res.json({
    xof_per_btc: Math.round(r.xofPerBtc),
    xof_per_sat: r.xofPerBtc / 1e8,
    sats_per_1000_xof: Math.round((1000 / r.xofPerBtc) * 1e8),
    usd_xof: config.rates.usdToXof,
    source: r.source,
    fixed: r.fixed,
    fetched_at: new Date(r.fetchedAt).toISOString(),
  });
}));

// ── Paiements ───────────────────────────────────────────────────────────────
// POST /v1/checkouts : clé secrète (serveur), clé publique pk_… (bouton navigateur) ou session (caisse)
api.post(
  '/checkouts',
  rateLimit({ name: 'checkout', limit: 120, windowMs: 60_000 }),
  authenticate(['session', 'staff', 'secret_key', 'publishable_key']),
  wrap(async (req, res) => {
    const body = req.body || {};
    const currency = String(body.currency || 'XOF').toUpperCase();
    if (!['XOF', 'FCFA', 'CFA'].includes(currency)) return fail(res, 422, 'invalid_currency', 'Seule la devise XOF (FCFA) est prise en charge.');
    const err = validateAmountXof(body.amount);
    if (err) return fail(res, 422, 'invalid_amount', err);

    const input = {
      amount: body.amount,
      reference: body.reference,
      description: body.description,
      return_url: body.return_url,
      customer_email: body.customer_email,
      metadata: body.metadata,
      source: req.authVia === 'staff' ? 'pos' : req.authVia === 'session' ? (body.source === 'pos' ? 'pos' : 'dashboard') : 'api',
      staff_id: req.staff?.id,
    };
    // Une clé publique ne peut pas rediriger les notifications
    if (req.authVia === 'secret_key' && body.webhook_url) input.webhook_url = await assertSafeWebhookUrl(body.webhook_url).catch((e) => {
      throw Object.assign(e, { status: 422 });
    });
    try {
      const { checkout, created } = await createCheckout(req.merchant, input);
      res.status(created ? 201 : 200).json(publicCheckout(checkout));
    } catch (e) {
      if (e.status) return fail(res, e.status, 'invalid_request', e.message);
      bitnobFail(res, e, { showDetail: req.authVia === 'session' || req.authVia === 'staff' });
    }
  }),
);

api.get('/checkouts', authenticate(['session', 'secret_key', 'staff']), wrap(async (req, res) => {
  const list = await listCheckouts(req.merchant.id, { status: req.query.status, limit: req.query.limit, q: req.query.q, staffId: req.staff?.id });
  res.json({ data: list.map(req.staff ? publicCheckout : privateCheckout), stats: req.staff ? null : await stats(req.merchant.id) });
}));

api.get('/checkouts/:id', optionalAuth, wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c || (req.merchant && c.merchant_id !== req.merchant.id)) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  res.json(req.merchant ? privateCheckout(c) : publicCheckout(c));
}));

// Flux temps réel du statut (page de paiement)
api.get('/checkouts/:id/stream', wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  subscribe(`checkout:${c.id}`, req, res);
  res.write(`event: status\ndata: ${JSON.stringify(publicCheckout(c))}\n\n`);
}));

// Vérification serveur à la demande (bouton « J'ai payé » / secours si le webhook n'arrive pas)
api.post('/checkouts/:id/refresh', rateLimit({ name: 'refresh', limit: 20, windowMs: 60_000 }), wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  try {
    await refreshFromBitnob(c);
  } catch (e) {
    return bitnobFail(res, e);
  }
  res.json(publicCheckout(await getCheckout(c.id)));
}));

// Paiement en USDT / USDC : adresse de dépôt Bitnob propre à ce paiement, sur le réseau choisi par le client
api.post('/checkouts/:id/usdt', rateLimit({ name: 'usdt-address', limit: 10, windowMs: 600_000 }), wrap(async (req, res) => {
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  try {
    await depositAddress(c, String(req.body?.chain || '').toLowerCase());
  } catch (e) {
    if (e.status) return fail(res, e.status, 'usdt_unavailable', e.message);
    return bitnobFail(res, e);
  }
  res.status(201).json(publicCheckout(await getCheckout(c.id)));
}));

// Mode démo : simule le webhook Bitnob (même chemin de code que le vrai webhook)
api.post('/checkouts/:id/simulate-payment', wrap(async (req, res) => {
  if (!config.demoMode) return fail(res, 403, 'live_mode', 'Simulation désactivée en mode réel.');
  const c = await getCheckout(req.params.id);
  if (!c) return fail(res, 404, 'not_found', 'Paiement introuvable.');
  // Une vraie facture Bitnob (créée en mode réel) ne se simule jamais, même si le serveur repasse en démo
  if (!c.demo) return fail(res, 403, 'live_checkout', 'Ce paiement est réel : il ne peut pas être simulé.');
  // Dépôt USDT simulé sur la dernière adresse demandée (montant exact attendu)
  const addr = req.body?.asset === 'USDT' ? c.usdt_addresses?.at(-1) : null;
  if (req.body?.asset === 'USDT') {
    if (!addr) return fail(res, 422, 'no_address', 'Choisissez d’abord un réseau USDT.');
    const id = newId('bn_dep');
    const result = await processBitnobEvent(
      { event: 'deposit.success', event_id: id, transaction_id: id, address: addr.address, chain: addr.chain, currency: 'USDT', amount: String(c.usdt_amount_micro), hash: crypto.randomBytes(32).toString('hex') },
      { verified: true },
    );
    return res.json({ simulated: true, result, checkout: publicCheckout(await getCheckout(c.id)) });
  }
  const event = {
    id: newId('bn_evt'),
    event: 'transfer.success',
    data: { id: c.invoice_id, reference: c.bitnob_reference, payment_hash: c.payment_hash, amount: String(c.amount_sats), status: 'paid', preimage: crypto.randomBytes(32).toString('hex') },
  };
  const result = await processBitnobEvent(event, { verified: true });
  res.json({ simulated: true, result, checkout: publicCheckout(await getCheckout(c.id)) });
}));

// ── Pages publiques du marchand : /@username ─────────────────────────────────
api.get('/public/merchants/:username', wrap(async (req, res) => {
  const m = await merchantByUsername(req.params.username);
  if (!m) return fail(res, 404, 'not_found', 'Marchand introuvable.');
  res.json({ name: m.name, username: m.username, lightning_address: lightningAddress(m), min: MIN_XOF, max: MAX_XOF, demo: config.demoMode,
    savings: { benchmark_bps: config.savingsBenchmarkBps, fee_bps: m.fee_bps ?? config.feeBps },
  });
}));

api.post(
  '/public/merchants/:username/checkouts',
  rateLimit({ name: 'public-checkout', limit: 20, windowMs: 600_000 }),
  wrap(async (req, res) => {
    const m = await merchantByUsername(req.params.username);
    if (!m) return fail(res, 404, 'not_found', 'Marchand introuvable.');
    const err = validateAmountXof(req.body?.amount);
    if (err) return fail(res, 422, 'invalid_amount', err);
    const note = String(req.body?.note || '').trim().slice(0, 140);
    const payer = String(req.body?.payer_name || '').trim().slice(0, 60);
    const forName = String(req.body?.for_name || '').trim().slice(0, 60);
    try {
      const { checkout } = await createCheckout(m, {
        amount: req.body.amount,
        description: forName ? `Pour ${forName}${note ? `, ${note}` : ''}` : note || `Paiement à ${m.name}`,
        payer_note: [payer && `De ${payer}`, forName && `pour ${forName}`, note].filter(Boolean).join(', ') || null,
        source: 'public_page',
      });
      res.status(201).json(publicCheckout(checkout));
    } catch (e) {
      bitnobFail(res, e);
    }
  }),
);

// ── Liens de paiement (partage WhatsApp) ────────────────────────────────────
api.get('/payment-links', merchantOnly, wrap(async (req, res) => {
  const rows = await many('SELECT * FROM payment_links WHERE merchant_id = $1 ORDER BY created_at DESC LIMIT 100', [req.merchant.id]);
  res.json({ data: rows.map((l) => ({ ...l, amount: l.amount_xof, url: `${config.publicUrl}/l/${l.slug}` })) });
}));

api.post('/payment-links', merchantOnly, wrap(async (req, res) => {
  const err = validateAmountXof(req.body?.amount);
  if (err) return fail(res, 422, 'invalid_amount', err);
  const l = await one(
    `INSERT INTO payment_links (id, slug, merchant_id, amount_xof, description) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [newId('lnk'), randomToken(6), req.merchant.id, Math.round(Number(req.body.amount)), String(req.body.description || 'Paiement').trim().slice(0, 120) || 'Paiement'],
  );
  res.status(201).json({ ...l, amount: l.amount_xof, url: `${config.publicUrl}/l/${l.slug}` });
}));

api.patch('/payment-links/:id', merchantOnly, wrap(async (req, res) => {
  const l = await one('UPDATE payment_links SET active = $3 WHERE id = $1 AND merchant_id = $2 RETURNING *', [req.params.id, req.merchant.id, Boolean(req.body?.active)]);
  if (!l) return fail(res, 404, 'not_found', 'Lien introuvable.');
  res.json({ ...l, amount: l.amount_xof, url: `${config.publicUrl}/l/${l.slug}` });
}));

// ── Marchand ────────────────────────────────────────────────────────────────
api.get('/merchant', merchantOnly, (req, res) => res.json(merchantView(req.merchant)));

api.patch('/merchant', sessionOnly, rateLimit({ name: 'merchant-update', limit: 30, windowMs: 600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  const b = req.body || {};
  const sets = [];
  const vals = [req.merchant.id];
  const set = (col, v) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  if (typeof b.name === 'string') {
    if (b.name.trim().length < 2) return fail(res, 422, 'invalid_name', 'Nom trop court.');
    set('name', b.name.trim().slice(0, 60));
  }
  if (b.webhook_url !== undefined) {
    if (!b.webhook_url) set('webhook_url', null);
    else {
      try {
        set('webhook_url', await assertSafeWebhookUrl(b.webhook_url));
      } catch (e) {
        return fail(res, 422, 'invalid_webhook', e.message);
      }
    }
  }
  if (b.auto_convert_pct !== undefined) {
    const p = Math.round(Number(b.auto_convert_pct));
    if (!(p >= 0 && p <= 100)) return fail(res, 422, 'invalid_pct', 'Pourcentage entre 0 et 100.');
    set('auto_convert_pct', p);
  }
  if (b.payout !== undefined) {
    if (b.payout === null) {
      set('payout_network', null);
      set('payout_phone', null);
      set('payout_name', null);
    } else {
      const phone = normalizeSnPhone(b.payout.phone);
      if (!NETWORKS[b.payout.network] || !phone) return fail(res, 422, 'invalid_payout', 'Réseau ou numéro invalide.');
      // Le retrait automatique part vers ce compte : le changer exige le mot de passe, comme un retrait
      if (!(await verifyPassword(String(b.password || ''), req.merchant.password_hash))) {
        await audit(req.merchant.id, 'payout_account_password_failed', req);
        return fail(res, 401, 'invalid_password', 'Mot de passe incorrect.');
      }
      set('payout_network', b.payout.network);
      set('payout_phone', phone);
      set('payout_name', String(b.payout.name || '').trim().slice(0, 80) || req.merchant.name);
    }
  }
  if (b.phone !== undefined) set('phone', String(b.phone || '').slice(0, 30) || null);
  if (b.auto_payout !== undefined) {
    const enabled = Boolean(b.auto_payout?.enabled);
    const min = Math.round(Number(b.auto_payout?.min_xof ?? req.merchant.auto_payout_min_xof));
    if (!(min >= config.payouts.minXof && min <= config.payouts.dailyMaxXof))
      return fail(res, 422, 'invalid_threshold', `Seuil entre ${config.payouts.minXof} et ${config.payouts.dailyMaxXof.toLocaleString('fr-FR')} FCFA.`);
    if (enabled) {
      if (!(await verifyPassword(String(b.password || ''), req.merchant.password_hash)))
        return fail(res, 401, 'invalid_password', 'Mot de passe incorrect.');
      if (!req.merchant.payout_network && !b.payout) return fail(res, 422, 'no_payout_account', "Enregistrez d'abord un compte de retrait par défaut.");
    }
    set('auto_payout_enabled', enabled);
    set('auto_payout_min_xof', min);
  }
  if (!sets.length) return res.json(merchantView(req.merchant));
  const m = await one(`UPDATE merchants SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
  const action = b.auto_payout !== undefined ? (m.auto_payout_enabled ? 'auto_payout_enabled' : 'auto_payout_disabled') : b.payout ? 'payout_account_changed' : 'settings_updated';
  await audit(m.id, action, req, {
    fields: Object.keys(b).filter((k) => k !== 'password'),
  });
  res.json(merchantView(m));
}));

// Flux temps réel du marchand (cookie de session, même origine)
api.get('/merchant/stream', sessionOnly, (req, res) => subscribe(`merchant:${req.merchant.id}`, req, res));

// Vue d'ensemble du tableau de bord
api.get('/overview', merchantOnly, wrap(async (req, res) => {
  const [balance, s, recent] = await Promise.all([balancesView(req.merchant.id), stats(req.merchant.id), listCheckouts(req.merchant.id, { limit: 8 })]);
  res.json({ merchant: merchantView(req.merchant), balance, stats: s, recent: recent.map(privateCheckout) });
}));

api.get('/ledger', merchantOnly, wrap(async (req, res) => res.json({ data: await listLedger(req.merchant.id, 100) })));

// ── Notifications webhook ───────────────────────────────────────────────────
api.get('/deliveries', merchantOnly, wrap(async (req, res) => res.json({ data: await listDeliveries(req.merchant.id) })));

api.post('/deliveries/:id/retry', merchantOnly, wrap(async (req, res) => {
  if (!(await retryDelivery(req.merchant.id, req.params.id))) return fail(res, 404, 'not_found', 'Notification introuvable.');
  res.json({ ok: true });
}));

// ── Protection contre la volatilité : BTC → USDT ────────────────────────────
api.get('/conversions', merchantOnly, wrap(async (req, res) => {
  const rows = await listConversions(req.merchant.id);
  res.json({ data: rows.map((c) => ({ ...c, usdt: (c.usdt_micro / 1e6).toFixed(2) })) });
}));

api.post('/conversions', sessionOnly, rateLimit({ name: 'convert', limit: 20, windowMs: 600_000 }), wrap(async (req, res) => {
  try {
    const r = await convertToUsdt(req.merchant.id, req.body?.sats);
    await audit(req.merchant.id, 'conversion', req, { sats: r.sats, usdt: r.usdt });
    res.status(201).json({ ...r, balance: await balancesView(req.merchant.id) });
  } catch (e) {
    fail(res, e.status || 502, e.status ? 'invalid_request' : 'bitnob_error', e.message);
  }
}));

// ── Retraits mobile money ───────────────────────────────────────────────────
api.get('/payouts', merchantOnly, wrap(async (req, res) => {
  res.json({ data: (await listPayouts(req.merchant.id)).map(publicPayout), networks: Object.entries(NETWORKS).map(([id, n]) => ({ id, label: n.label })) });
}));

api.get('/payouts/corridor', merchantOnly, wrap(async (_req, res) => res.json(await corridorStatus())));

// Retrait : session + confirmation par mot de passe (jamais par simple clé API)
api.post('/payouts', sessionOnly, rateLimit({ name: 'payout', limit: 10, windowMs: 600_000, key: (req) => req.merchant.id }), wrap(async (req, res) => {
  const b = req.body || {};
  if (!(await verifyPassword(String(b.password || ''), req.merchant.password_hash))) {
    await audit(req.merchant.id, 'payout_password_failed', req);
    return fail(res, 401, 'invalid_password', 'Mot de passe incorrect.');
  }
  try {
    const p = await createPayout(req.merchant, {
      amount: b.amount,
      network: b.network,
      phone: b.phone,
      accountName: b.account_name,
      sourceAsset: b.source_asset || 'BTC',
    });
    await audit(req.merchant.id, 'payout_created', req, { payout: p.id, amount: p.amount_xof, network: p.network });
    res.status(201).json(publicPayout(p));
  } catch (e) {
    fail(res, e.status || 502, e.status ? 'invalid_request' : 'payout_error', e.message);
  }
}));

// ── Équipe : comptes caissiers (accès caisse + leurs ventes uniquement) ─────
const staffView = (s) => ({ id: s.id, name: s.name, email: s.email, role: s.role, created_at: s.created_at, active: !s.disabled_at });

api.get('/staff', sessionOnly, wrap(async (req, res) => {
  const rows = await many('SELECT * FROM staff WHERE merchant_id = $1 ORDER BY created_at DESC', [req.merchant.id]);
  res.json({ data: rows.map(staffView) });
}));

api.post('/staff', sessionOnly, rateLimit({ name: 'staff', limit: 20, windowMs: 3_600_000 }), wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (name.length < 2) return fail(res, 422, 'invalid_name', 'Indiquez le nom du caissier.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(res, 422, 'invalid_email', 'Adresse e-mail invalide.');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
    return fail(res, 422, 'weak_password', 'Mot de passe : 8 caractères minimum, avec une lettre et un chiffre.');
  if (await emailTaken(email)) return fail(res, 409, 'email_taken', 'Cet e-mail est déjà utilisé.');
  const row = await one(
    'INSERT INTO staff (id, merchant_id, name, email, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [newId('stf'), req.merchant.id, name, email, await hashPassword(password)],
  );
  await audit(req.merchant.id, 'staff_created', req, { staff: row.id, name });
  res.status(201).json(staffView(row));
}));

api.delete('/staff/:id', sessionOnly, wrap(async (req, res) => {
  const row = await one('UPDATE staff SET disabled_at = now() WHERE id = $1 AND merchant_id = $2 AND disabled_at IS NULL RETURNING *', [req.params.id, req.merchant.id]);
  if (!row) return fail(res, 404, 'not_found', 'Caissier introuvable.');
  await query('DELETE FROM sessions WHERE staff_id = $1', [row.id]); // déconnexion immédiate
  await audit(req.merchant.id, 'staff_disabled', req, { staff: row.id, name: row.name });
  res.json({ ok: true });
}));

// ── Clés API & secret webhook ───────────────────────────────────────────────
api.get('/api-keys', sessionOnly, wrap(async (req, res) => res.json({ data: await listApiKeys(req.merchant.id) })));

api.post('/api-keys', sessionOnly, rateLimit({ name: 'apikey', limit: 10, windowMs: 3_600_000 }), wrap(async (req, res) => {
  const k = await createApiKey(req.merchant.id, String(req.body?.label || 'Clé secrète'));
  await audit(req.merchant.id, 'api_key_created', req, { key: k.id });
  res.status(201).json(k);
}));

api.delete('/api-keys/:id', sessionOnly, wrap(async (req, res) => {
  if (!(await revokeApiKey(req.merchant.id, req.params.id))) return fail(res, 404, 'not_found', 'Clé introuvable.');
  await audit(req.merchant.id, 'api_key_revoked', req, { key: req.params.id });
  res.json({ ok: true });
}));

api.get('/webhook-secret', sessionOnly, (req, res) => res.json({ webhook_secret: req.merchant.webhook_secret }));

api.post('/webhook-secret/rotate', sessionOnly, wrap(async (req, res) => {
  const m = await one('UPDATE merchants SET webhook_secret = $2 WHERE id = $1 RETURNING webhook_secret', [req.merchant.id, `whsec_${randomToken(24)}`]);
  await audit(req.merchant.id, 'webhook_secret_rotated', req);
  res.json(m);
}));

api.get('/audit', sessionOnly, wrap(async (req, res) => {
  res.json({ data: await many('SELECT action, ip, meta, created_at FROM audit_log WHERE merchant_id = $1 ORDER BY id DESC LIMIT 50', [req.merchant.id]) });
}));

// Diagnostic de la connexion Bitnob (utile le jour J)
api.get('/bitnob/whoami', sessionOnly, wrap(async (_req, res) => {
  if (config.demoMode) return res.json({ mode: 'demo', message: 'Aucune clé Bitnob configurée.' });
  try {
    res.json({ mode: 'live', whoami: await bitnob.whoami() });
  } catch (e) {
    fail(res, 502, 'bitnob_error', e.message);
  }
}));
