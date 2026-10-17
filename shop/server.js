// Boutique de démo « Wax & Co Dakar » — un vrai site marchand qui encaisse via YombalPay.
// Toute l'intégration tient dans les blocs marqués ▶ YOMBALPAY.
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YombalPay from '../sdk/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SHOP_PORT) || 4000;
const SHOP_URL = (process.env.SHOP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');

// ▶ YOMBALPAY — 1. Initialiser le SDK avec la clé secrète (côté serveur uniquement)
const yombalpay = new YombalPay({
  apiKey: process.env.YOMBALPAY_SECRET_KEY || 'sk_test_waxco_demo_2026',
  baseUrl: process.env.YOMBALPAY_URL || 'http://localhost:3000',
});
const WEBHOOK_SECRET = process.env.YOMBALPAY_WEBHOOK_SECRET || 'whsec_waxco_demo_2026';

const PRODUCTS = [
  { id: 'tote', name: 'Sac cabas en wax', price: 5000, color: '#E4572E', pattern: 'circles', tag: 'Best-seller' },
  { id: 'scarf', name: 'Foulard bazin brodé', price: 12500, color: '#2E86AB', pattern: 'diamonds', tag: 'Nouveau' },
  { id: 'shirt', name: 'Chemise wax homme', price: 18000, color: '#F2A541', pattern: 'stripes', tag: '' },
  { id: 'basket', name: 'Panier tressé de Thiès', price: 7500, color: '#3F7D20', pattern: 'weave', tag: 'Artisanal' },
];

const ordersFile = path.join(here, 'orders.json');
const orders = (() => {
  try { return JSON.parse(fs.readFileSync(ordersFile, 'utf8')); } catch { return {}; }
})();
const saveOrders = () => fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));

const app = express();
app.use('/static', express.static(path.join(here, 'public')));

const fmt = (n) => Number(n).toLocaleString('fr-FR').replace(/ /g, ' ');

function swatch(p) {
  const c = p.color;
  const patterns = {
    circles: `<pattern id="p-${p.id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${c}"/><circle cx="20" cy="20" r="12" fill="none" stroke="#fff4" stroke-width="5"/><circle cx="20" cy="20" r="4" fill="#1b1b1f55"/></pattern>`,
    diamonds: `<pattern id="p-${p.id}" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="${c}"/><path d="M18 2 34 18 18 34 2 18Z" fill="none" stroke="#fff5" stroke-width="4"/><path d="M18 12 24 18 18 24 12 18Z" fill="#F7931A"/></pattern>`,
    stripes: `<pattern id="p-${p.id}" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="30" height="30" fill="${c}"/><rect width="10" height="30" fill="#1b1b1f40"/><rect x="18" width="4" height="30" fill="#fff6"/></pattern>`,
    weave: `<pattern id="p-${p.id}" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="${c}"/><rect width="14" height="14" fill="#fff3"/><rect x="14" y="14" width="14" height="14" fill="#fff3"/></pattern>`,
  };
  return `<svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${patterns[p.pattern]}</defs><rect width="200" height="150" fill="url(#p-${p.id})"/></svg>`;
}

const layout = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/static/shop.css"></head><body>
<header class="top"><a class="brand" href="/">Wax <span>&amp;</span> Co</a><span class="where">Dakar · Livraison dans le monde entier</span></header>
<main>${body}</main>
<footer>Boutique de démonstration — paiements Bitcoin Lightning par <strong>YombalPay</strong></footer></body></html>`;

app.get('/', (_req, res) => {
  const cards = PRODUCTS.map(
    (p) => `<article class="card">
      <div class="img">${swatch(p)}${p.tag ? `<span class="tag">${p.tag}</span>` : ''}</div>
      <div class="body"><h3>${p.name}</h3><p class="price">${fmt(p.price)} <small>FCFA</small></p>
      <form method="post" action="/buy/${p.id}"><button class="pay">⚡ Payer en Bitcoin</button></form></div></article>`,
  ).join('');
  res.send(
    layout(
      'Wax & Co Dakar',
      `<section class="hero"><h1>Le wax de Dakar,<br>livré à Paris, Montréal, New York.</h1>
       <p>Payez en Bitcoin Lightning depuis n'importe quel pays. Sans carte bancaire, sans compte local.</p></section>
       <section class="grid">${cards}</section>
       <details class="code"><summary>Voir tout le code d'intégration YombalPay de cette boutique</summary>
       <pre>const yombalpay = new YombalPay({ apiKey: process.env.YOMBALPAY_SECRET_KEY });

app.post('/buy/:id', async (req, res) => {
  const checkout = await yombalpay.createCheckout({
    amount: product.price, currency: 'XOF', reference: orderRef,
    returnUrl: \`\${SHOP_URL}/orders/\${orderRef}\`,
  });
  res.redirect(checkout.pay_url);
});

app.post('/webhooks/yombalpay', express.raw({ type: '*/*' }), (req, res) => {
  const event = YombalPay.verifyWebhook(req.body, req.get('X-YombalPay-Signature'), SECRET);
  if (event.type === 'checkout.paid') markOrderPaid(event.data.reference);
  res.sendStatus(200);
});</pre></details>`,
    ),
  );
});

// ▶ YOMBALPAY — 2. Créer le paiement et rediriger le client vers la page hébergée
app.post('/buy/:id', async (req, res) => {
  const product = PRODUCTS.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).send('Produit introuvable');
  const ref = `WAX-${Date.now().toString(36).toUpperCase()}`;
  try {
    const checkout = await yombalpay.createCheckout({
      amount: product.price,
      currency: 'XOF',
      reference: ref,
      description: `Wax & Co — ${product.name}`,
      returnUrl: `${SHOP_URL}/orders/${ref}`,
      metadata: { product: product.id },
    });
    orders[ref] = { ref, product: product.name, amount: product.price, status: 'En attente', checkoutId: checkout.id, createdAt: new Date().toISOString() };
    saveOrders();
    res.redirect(303, checkout.pay_url);
  } catch (e) {
    res.status(502).send(layout('Erreur', `<section class="order"><h1>Paiement indisponible</h1><p>${e.message}</p><a href="/">Retour</a></section>`));
  }
});

// ▶ YOMBALPAY — 3. Recevoir la confirmation (webhook signé)
app.post('/webhooks/yombalpay', express.raw({ type: '*/*' }), (req, res) => {
  let event;
  try {
    event = YombalPay.verifyWebhook(req.body, req.get('X-YombalPay-Signature'), WEBHOOK_SECRET);
  } catch (e) {
    console.warn('Webhook refusé :', e.message);
    return res.status(400).send(e.message);
  }
  if (event.type === 'checkout.paid') {
    const order = orders[event.data.reference];
    if (order && order.status !== 'Payée') {
      order.status = 'Payée';
      order.paidAt = event.data.paid_at;
      order.sats = event.data.amount_sats;
      saveOrders();
      console.log(`🛍️  Commande ${order.ref} payée (${order.amount} FCFA)`);
    }
  }
  res.sendStatus(200);
});

// Statut de commande (avec vérification serveur de secours si le webhook n'est pas encore arrivé)
app.get('/api/orders/:ref', async (req, res) => {
  const order = orders[req.params.ref];
  if (!order) return res.status(404).json({ error: 'not_found' });
  if (order.status !== 'Payée' && order.checkoutId) {
    try {
      const c = await yombalpay.getCheckout(order.checkoutId);
      if (c.status === 'paid') { order.status = 'Payée'; order.paidAt = c.paid_at; order.sats = c.amount_sats; saveOrders(); }
      if (c.status === 'expired') order.status = 'Expirée';
    } catch {}
  }
  res.json(order);
});

app.get('/orders/:ref', (req, res) => {
  const o = orders[req.params.ref];
  if (!o) return res.status(404).send(layout('Commande', '<section class="order"><h1>Commande introuvable</h1></section>'));
  res.send(
    layout(
      `Commande ${o.ref}`,
      `<section class="order"><p class="muted">Commande ${o.ref}</p><h1>${o.product}</h1>
       <p class="price">${fmt(o.amount)} <small>FCFA</small></p>
       <p id="status" class="status ${o.status === 'Payée' ? 'ok' : ''}">${o.status}</p>
       <p id="hint" class="muted">${o.status === 'Payée' ? 'Merci ! Votre commande part en préparation à Dakar.' : 'En attente de la confirmation du paiement…'}</p>
       <a class="back" href="/">← Continuer mes achats</a></section>
       <script>
       const ref=${JSON.stringify(o.ref)};
       async function tick(){const r=await fetch('/api/orders/'+ref);const o=await r.json();
         const s=document.getElementById('status');s.textContent=o.status;
         if(o.status==='Payée'){s.classList.add('ok');document.getElementById('hint').textContent='Merci ! Payé en '+(o.sats||'')+' sats — votre commande part en préparation à Dakar.';return;}
         setTimeout(tick,2000);}
       tick();</script>`,
    ),
  );
});

app.listen(PORT, () => console.log(`🛍️  Boutique de démo Wax & Co sur ${SHOP_URL}`));
