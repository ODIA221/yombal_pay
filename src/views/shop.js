const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ");

const HEAD = (title) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Figtree:wght@400;500;600;700&display=swap">
<style>
:root {
  --paper: #FBF7F0; --ink: #1E1A16; --muted: #6E6459; --line: #E8DFD2;
  --indigo: #23306B; --ochre: #D99A2B; --clay: #B4532A; --green: #00853F;
  --display: "Fraunces", Georgia, serif; --body: "Figtree", "Segoe UI", system-ui, sans-serif;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--paper); color: var(--ink); font: 16px/1.55 var(--body); }
.wrap { max-width: 1040px; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left)); padding-right: max(16px, env(safe-area-inset-right)); }
header { border-bottom: 1px solid var(--line); }
header .wrap { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-block: 18px; }
.brand { font: 800 22px var(--display); text-decoration: none; color: inherit; }
.brand span { color: var(--clay); }
.demo { font-size: 13px; color: var(--muted); }
h1, h2 { font-family: var(--display); margin: 0; line-height: 1.1; text-wrap: balance; }
:focus-visible { outline: 2px solid var(--indigo); outline-offset: 3px; }
</style>
</head>
<body>`;

const HEADER = (merchantName) => `<header><div class="wrap">
  <a class="brand" href="/boutique">${esc(merchantName)}<span>.</span></a>
  <span class="demo">Boutique de démonstration · paiements YombalPay</span>
</div></header>`;

export function renderShop({ products, merchantName, error }) {
  return `${HEAD(merchantName)}
<style>
.hero { padding-block: 44px 28px; display: grid; gap: 10px; }
.hero h1 { font-size: clamp(30px, 5vw, 48px); }
.hero p { color: var(--muted); max-width: 52ch; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; padding-bottom: 56px; }
.prod { background: #fff; border: 1px solid var(--line); border-radius: 22px; overflow: hidden; display: grid; }
.pic { aspect-ratio: 4 / 3; max-width: 100%; }
.pic.wax { background: radial-gradient(circle at 25% 25%, var(--ochre) 0 14%, transparent 15%) 0 0/64px 64px, radial-gradient(circle at 75% 75%, var(--clay) 0 10%, transparent 11%) 0 0/64px 64px, repeating-linear-gradient(45deg, var(--indigo) 0 10px, #2E3E86 10px 20px); }
.pic.bissap { background: radial-gradient(circle at 50% 60%, #8E1B3A 0 30%, #5A0F24 31% 34%, transparent 35%), linear-gradient(160deg, #F2D7DD, #E7B7C2); }
.pic.cuir { background: radial-gradient(ellipse at 50% 70%, #7A4A26 0 34%, transparent 35%), repeating-linear-gradient(0deg, #C98B52 0 3px, #BF7F47 3px 6px); }
.info { padding: 18px 20px 20px; display: grid; gap: 8px; }
.info h2 { font-size: 20px; }
.info p { color: var(--muted); font-size: 14.5px; margin: 0; }
.price { font-weight: 700; font-size: 18px; }
.pay { margin-top: 6px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 999px; padding: 13px 16px; background: #0A0F0C; color: #fff; font: 600 15px var(--body); cursor: pointer; }
.pay:hover { background: var(--green); }
.pay i { font-style: normal; width: 22px; height: 22px; border-radius: 6px; background: var(--green); display: grid; place-items: center; font-weight: 800; font-size: 13px; }
.err { background: #FDECEA; color: #8A1C12; border-radius: 14px; padding: 12px 16px; margin-bottom: 20px; }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
</style>
${HEADER(merchantName)}
<main class="wrap">
  <section class="hero">
    <h1>Artisanat du Sénégal, livré partout</h1>
    <p>Payez depuis Paris, Milan ou New York en Bitcoin Lightning. Les prix sont en FCFA, le montant en sats est calculé au moment du paiement.</p>
  </section>
  ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
  <div class="grid">
    ${products
      .map(
        (p) => `<article class="prod">
      <div class="pic ${esc(p.pic)}" role="img" aria-label="${esc(p.name)}"></div>
      <div class="info">
        <h2>${esc(p.name)}</h2>
        <p>${esc(p.text)}</p>
        <span class="price">${fmt(p.amount)} FCFA</span>
        <form method="post" action="/boutique/commander">
          <input type="hidden" name="produit" value="${esc(p.id)}">
          <button class="pay" type="submit"><i>₿</i>Payer en Bitcoin</button>
        </form>
      </div>
    </article>`,
      )
      .join("")}
  </div>
</main>
</body>
</html>`;
}

export function renderOrder({ order, merchantName }) {
  const paid = order.status === "paid";
  return `${HEAD(`Commande ${order.id}`)}
<style>
main { padding-block: 48px; display: grid; place-items: center; }
.box { width: 100%; max-width: 480px; background: #fff; border: 1px solid var(--line); border-radius: 24px; padding: 32px 28px; display: grid; gap: 14px; text-align: center; justify-items: center; }
.icon { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: var(--line); color: var(--muted); }
.icon.ok { background: var(--green); color: #fff; }
.spin { width: 30px; height: 30px; border: 3px solid var(--muted); border-right-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
h1 { font-size: 26px; }
p { margin: 0; color: var(--muted); }
dl { width: 100%; display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; text-align: left; margin: 6px 0 0; padding-top: 14px; border-top: 1px solid var(--line); font-size: 14.5px; }
dt { color: var(--muted); } dd { margin: 0; text-align: right; font-weight: 600; overflow-wrap: anywhere; }
a.back { color: var(--indigo); font-weight: 600; }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>
${HEADER(merchantName)}
<main class="wrap">
  <div class="box">
    <div class="icon${paid ? " ok" : ""}" id="icon">${paid ? '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '<span class="spin"></span>'}</div>
    <h1 id="title">${paid ? "Merci, commande payée" : "Confirmation du paiement…"}</h1>
    <p id="text">${paid ? "YombalPay nous a confirmé votre paiement Bitcoin. Votre commande est en préparation." : "Nous attendons la confirmation de YombalPay. Cette page se met à jour toute seule."}</p>
    <dl>
      <dt>Commande</dt><dd>${esc(order.id)}</dd>
      <dt>Article</dt><dd>${esc(order.name)}</dd>
      <dt>Montant</dt><dd>${fmt(order.amount)} FCFA</dd>
      <dt>Statut</dt><dd id="status">${paid ? "Payée" : "En attente"}</dd>
    </dl>
    <a class="back" href="/boutique">Retour à la boutique</a>
  </div>
</main>
<script>
(function () {
  if (${JSON.stringify(paid)}) return;
  function poll() {
    fetch("/boutique/commande/${esc(order.id)}/statut", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.status === "paid") location.reload(); else setTimeout(poll, 2000); })
      .catch(function () { setTimeout(poll, 4000); });
  }
  setTimeout(poll, 1500);
})();
</script>
</body>
</html>`;
}
