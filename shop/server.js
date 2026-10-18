// Boutique de démo « African Costume Shop » : un vrai site site marchand qui encaisse via YombalPay.
// Toute l'intégration tient dans les blocs marqués ▶ YOMBALPAY.
import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YombalPay from '../sdk/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.SHOP_PORT) || 4000;
let SHOP_URL = (process.env.SHOP_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
// SHOP_URL_AUTO=true : l'adresse de retour suit l'IP du réseau local (même logique que la passerelle)
if (process.env.SHOP_URL_AUTO === 'true') {
  const { watchLanIp } = await import('../server/src/lib/lan.js');
  watchLanIp((ip) => (SHOP_URL = `http://${ip}:${PORT}`));
}

// ▶ YOMBALPAY, étape 1. Initialiser le SDK avec la clé secrète (côté serveur uniquement)
const yombalpay = new YombalPay({
  // Préfixe « sk_ » ajouté si besoin (clé générée par l'hébergeur), comme dans server/src/config.js
  apiKey: process.env.YOMBALPAY_SECRET_KEY ? process.env.YOMBALPAY_SECRET_KEY.replace(/^(?!sk_)/, 'sk_') : 'sk_test_acs_demo_2026',
  baseUrl: process.env.YOMBALPAY_URL || 'http://localhost:3000',
});
const WEBHOOK_SECRET = process.env.YOMBALPAY_WEBHOOK_SECRET || 'whsec_acs_demo_2026';

const PRODUCTS = [
  { id: 'grand-boubou', name: 'Grand boubou brodé bleu ciel', cat: 'homme', price: 65000, img: 'grand-boubou-bleu', tag: 'Best-seller', desc: 'Trois pièces en bazin, broderie ton sur ton faite main.' },
  { id: 'robe-bazin', name: 'Robe bazin brodée émeraude', cat: 'femme', price: 38000, img: 'robe-bazin-emeraude', tag: 'Nouveau', desc: 'Bazin riche teint à Dakar, broderie dorée au col.' },
  { id: 'boubou-bazin', name: 'Boubou bazin riche bleu nuit', cat: 'homme', price: 45000, img: 'boubou-bazin-bleu-nuit', tag: '', desc: 'La tenue des jours de fête : Tabaski, Korité, mariages.' },
  { id: 'boubou-teint', name: 'Boubou teint à la main', cat: 'femme', price: 32000, img: 'boubou-teint-main', tag: 'Pièce unique', desc: 'Teinture artisanale : aucun boubou n’est identique.' },
  { id: 'kaftan-blanc', name: 'Ensemble kaftan blanc de cérémonie', cat: 'homme', price: 35000, img: 'kaftan-blanc-ceremonie', tag: '', desc: 'Kaftan, pantalon et bonnet assorti. Idéal pour un mariage.' },
  { id: 'kaftan-imprime', name: 'Kaftan imprimé femme', cat: 'femme', price: 22000, img: 'kaftan-imprime', tag: '', desc: 'Coupe ample et légère, encolure brodée.' },
  { id: 'dashiki', name: 'Chemise dashiki', cat: 'homme', price: 12500, img: 'dashiki', tag: 'Petit prix', desc: 'Le classique coloré, en coton respirant. Unisexe.' },
  { id: 'kente', name: 'Étole kente tissée main', cat: 'accessoires', price: 9500, img: 'etole-kente', tag: 'Artisanal', desc: 'Tissée sur métier traditionnel. Parfaite pour une remise de diplôme.' },
];
const SIZES = ['S', 'M', 'L', 'XL', 'Sur mesure'];
const CATS = [['tous', 'Tout voir'], ['homme', 'Homme'], ['femme', 'Femme'], ['accessoires', 'Accessoires']];
const EUR_XOF = 655.957;

const ordersFile = path.join(here, 'orders.json');
const orders = (() => {
  try { return JSON.parse(fs.readFileSync(ordersFile, 'utf8')); } catch { return {}; }
})();
const saveOrders = () => fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
const credits = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(here, 'public/img/credits.json'), 'utf8')); } catch { return []; }
})();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use('/static', express.static(path.join(here, 'public'), { maxAge: '1h' }));

const fmt = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const eur = (xof) => Math.round(xof / EUR_XOF).toLocaleString('fr-FR');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const img = (name) => `/static/img/${name}.jpg`;

const bolt = '<svg class="bolt" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';

const layout = (title, body) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/shop.css"></head><body>
<div class="announce">${bolt} Vous êtes à Paris, Montréal ou New York ? Payez en Bitcoin Lightning. Livraison offerte dès 50 000 FCFA.</div>
<header class="top"><div class="wrap">
  <a class="brand" href="/"><span class="mark">A</span><span>African Costume <em>Shop</em></span></a>
  <nav><a href="/#collection">Collection</a><a href="/#atelier">L’atelier</a><a href="/#paiement">Paiement</a></nav>
  <span class="pill">${bolt} Lightning accepté</span>
</div></header>
<main>${body}</main>
<div class="kente" aria-hidden="true"></div>
<footer><div class="wrap">
  <div><a class="brand" href="/"><span class="mark">A</span><span>African Costume <em>Shop</em></span></a>
  <p>Tenues africaines cousues main à Dakar. Boutique de démonstration : les paiements Bitcoin Lightning sont encaissés par <strong>YombalPay</strong>.</p></div>
  <div class="foot-links"><a href="/#collection">Collection</a><a href="/credits">Crédits photos</a></div>
</div></footer></body></html>`;

function card(p) {
  return `<article class="card" data-cat="${p.cat}">
  <div class="photo"><img src="${img(p.img)}" alt="${esc(p.name)}" loading="lazy">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ''}</div>
  <div class="body">
    <h3>${esc(p.name)}</h3>
    <p class="desc">${esc(p.desc)}</p>
    <p class="price">${fmt(p.price)} <small>FCFA</small><span class="eur">≈ ${eur(p.price)} €</span></p>
    <form method="post" action="/buy/${p.id}">
      ${p.cat === 'accessoires' ? '' : `<div class="sizes" role="radiogroup" aria-label="Taille">${SIZES.map((s, i) => `<label><input type="radio" name="size" value="${s}"${i === 2 ? ' checked' : ''}><span>${s}</span></label>`).join('')}</div>`}
      <button class="pay">${bolt} Acheter en Bitcoin</button>
    </form>
  </div></article>`;
}

app.get('/', (_req, res) => {
  res.send(
    layout(
      'African Costume Shop, tenues africaines cousues main à Dakar',
      `<section class="hero"><div class="wrap">
        <div class="hero-text">
          <p class="eyebrow">Atelier de la Médina, Dakar</p>
          <h1>L’élégance africaine, <em>cousue main</em> à Dakar.</h1>
          <p class="lead">Grands boubous, bazin, kaftans et kente pour les mariages, la Tabaski ou le quotidien. Livrés à Paris, Montréal et New York, et payés en Bitcoin Lightning, sans carte bancaire.</p>
          <div class="cta"><a class="btn" href="#collection">Découvrir la collection</a><a class="btn ghost" href="#paiement">Comment payer ?</a></div>
          <ul class="trust"><li><strong>72 h</strong><span>vers l’Europe</span></li><li><strong>100 %</strong><span>fait main</span></li><li><strong>3 s</strong><span>pour payer</span></li></ul>
        </div>
        <div class="collage">
          <img class="c1" src="${img('boubou-pagne-tisse')}" alt="Homme en boubou de pagne tissé sérère">
          <img class="c2" src="${img('grand-boubou-organza')}" alt="Grand boubou en organza brodé">
          <img class="c3" src="${img('kente-sourire')}" alt="Femme souriante en kente et perles">
          <div class="badge">${bolt}<div><strong>Payé en 3 secondes</strong><span>45 000 FCFA, depuis Paris</span></div></div>
        </div>
      </div></section>

      <section id="collection" class="collection"><div class="wrap">
        <div class="section-head"><div><p class="eyebrow">La collection</p><h2>Nos tenues du moment</h2></div>
          <div class="chips" role="tablist">${CATS.map(([k, l], i) => `<button class="chip${i === 0 ? ' on' : ''}" data-filter="${k}">${l}</button>`).join('')}</div></div>
        <div class="grid">${PRODUCTS.map(card).join('')}</div>
      </div></section>

      <section id="atelier" class="atelier"><div class="wrap">
        <img src="${img('atelier-couture')}" alt="Couturière au travail dans son atelier" loading="lazy">
        <div><p class="eyebrow">L’atelier</p><h2>Chaque pièce passe entre les mains de nos tailleurs.</h2>
          <p>Nos couturières et brodeurs travaillent le bazin, le wax et le kente à la main, comme on le fait depuis des générations à Dakar. Choisissez « Sur mesure » : nous vous recontactons pour vos mesures avant la coupe.</p>
          <blockquote>« J’ai commandé le boubou de mon mariage depuis Lyon. Payé en Bitcoin en quelques secondes, reçu en 4 jours. »<cite>Mamadou, client à Lyon</cite></blockquote>
        </div>
      </div></section>

      <section id="paiement" class="how"><div class="wrap">
        <p class="eyebrow">Paiement</p><h2>Payer depuis l’étranger, en trois étapes</h2>
        <ol>
          <li><span>1</span><h3>Choisissez votre tenue</h3><p>Les prix sont en FCFA, avec l’équivalent en euros.</p></li>
          <li><span>2</span><h3>Scannez le QR Lightning</h3><p>Avec Wallet of Satoshi, Phoenix, Strike ou tout portefeuille Lightning.</p></li>
          <li><span>3</span><h3>C’est payé</h3><p>La confirmation arrive en quelques secondes. L’atelier reçoit sa commande en FCFA.</p></li>
        </ol>
        <details class="code"><summary>Voir tout le code d’intégration YombalPay de cette boutique</summary>
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
});</pre></details>
      </div></section>
      <script>
      document.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b));
        document.querySelectorAll('.card').forEach((c) => { c.hidden = b.dataset.filter !== 'tous' && c.dataset.cat !== b.dataset.filter; });
      }));
      </script>`,
    ),
  );
});

// ▶ YOMBALPAY, étape 2. Créer le paiement et rediriger le client vers la page hébergée
app.post('/buy/:id', async (req, res) => {
  const product = PRODUCTS.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).send('Produit introuvable');
  const size = SIZES.includes(req.body?.size) ? req.body.size : null;
  // Référence imprévisible : personne ne peut deviner le numéro de la prochaine commande
  const ref = `ACS-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
  try {
    const checkout = await yombalpay.createCheckout({
      amount: product.price,
      currency: 'XOF',
      reference: ref,
      description: `${product.name}${size ? `, taille ${size}` : ''}`,
      returnUrl: `${SHOP_URL}/orders/${ref}`,
      metadata: { product: product.id, ...(size ? { size } : {}) },
    });
    orders[ref] = { ref, product: product.name, productId: product.id, size, amount: product.price, status: 'En attente', checkoutId: checkout.id, createdAt: new Date().toISOString() };
    saveOrders();
    res.redirect(303, checkout.pay_url);
  } catch (e) {
    res.status(502).send(layout('Paiement indisponible', `<section class="order"><div class="order-card"><h1>Paiement indisponible</h1><p class="muted">${esc(e.message)}</p><a class="btn" href="/">Retour à la boutique</a></div></section>`));
  }
});

// ▶ YOMBALPAY, étape 3. Recevoir la confirmation (webhook signé)
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
    // Toujours comparer le paiement à la commande : même paiement que celui créé pour elle, même montant
    const matches = order && event.data.id === order.checkoutId && event.data.amount === order.amount && event.data.currency === 'XOF';
    if (order && !matches) console.warn(`Webhook ignoré pour ${order.ref} : paiement ${event.data.id} de ${event.data.amount} FCFA, attendu ${order.amount} FCFA`);
    if (matches && order.status !== 'Payée') {
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
  if (!o) return res.status(404).send(layout('Commande', '<section class="order"><div class="order-card"><h1>Commande introuvable</h1><a class="btn" href="/">Retour à la boutique</a></div></section>'));
  const p = PRODUCTS.find((x) => x.id === o.productId);
  const paid = o.status === 'Payée';
  res.send(
    layout(
      `Commande ${o.ref}`,
      `<section class="order"><div class="order-card">
        ${p ? `<img src="${img(p.img)}" alt="">` : ''}
        <div class="order-body">
          <p class="muted">Commande ${esc(o.ref)}</p>
          <h1>${esc(o.product)}</h1>
          ${o.size ? `<p class="muted">Taille : ${esc(o.size)}</p>` : ''}
          <p class="price">${fmt(o.amount)} <small>FCFA</small><span class="eur">≈ ${eur(o.amount)} €</span></p>
          <ol class="steps" id="steps" data-paid="${paid}">
            <li class="done">Commande enregistrée</li>
            <li class="${paid ? 'done' : 'now'}" id="s-pay">${paid ? 'Paiement reçu' : 'Paiement en cours de confirmation…'}</li>
            <li class="${paid ? 'now' : ''}" id="s-atelier">Préparation à l’atelier</li>
            <li>Expédition</li>
          </ol>
          <p id="hint" class="muted">${paid ? 'Merci ! Votre tenue part en préparation à Dakar.' : 'Gardez cette page ouverte, elle se met à jour toute seule.'}</p>
          <a class="btn ghost" href="/">← Continuer mes achats</a>
        </div>
      </div></section>
      <script>
      const ref=${JSON.stringify(o.ref)};
      async function tick(){
        try{const o=await (await fetch('/api/orders/'+ref)).json();
          if(o.status==='Payée'){
            const s=document.getElementById('s-pay');s.className='done';s.textContent='Paiement reçu'+(o.sats?', '+Number(o.sats).toLocaleString('fr-FR')+' sats':'');
            document.getElementById('s-atelier').className='now';
            document.getElementById('hint').textContent='Merci ! Votre tenue part en préparation à Dakar.';return;}
          if(o.status==='Expirée'){document.getElementById('s-pay').textContent='Paiement expiré';document.getElementById('hint').textContent='Le délai de paiement est dépassé. Vous pouvez recommencer depuis la boutique.';return;}
        }catch{}
        setTimeout(tick,2000);}
      ${paid ? '' : 'tick();'}
      </script>`,
    ),
  );
});

app.get('/credits', (_req, res) => {
  res.send(
    layout(
      'Crédits photos',
      `<section class="credits"><div class="wrap"><h1>Crédits photos</h1>
      <p class="muted">Photos issues de Wikimedia Commons, utilisées selon leur licence. Elles ont été recadrées et compressées pour le web.</p>
      <ul>${credits.map((c) => `<li><img src="/static/img/${esc(c.file)}" alt=""><div><strong>${esc(c.title.replace(/\.\w+$/, ''))}</strong><span>${esc(c.author || 'Auteur inconnu')}, ${esc(c.license)}</span><a href="${esc(c.source)}" rel="noopener">Voir sur Wikimedia Commons</a></div></li>`).join('')}</ul>
      </div></section>`,
    ),
  );
});

app.listen(PORT, () => console.log(`🛍️  Boutique de démo African Costume Shop sur ${SHOP_URL}`));
