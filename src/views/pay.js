const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/ /g, " ");

export function renderPayPage({ checkout, qrSvg, merchantName, showSimulate = false }) {
  const testnet = checkout.paymentRequest.startsWith("lntb");
  const state = {
    id: checkout.id,
    status: checkout.status,
    expiresAt: checkout.expiresAt,
    returnUrl: checkout.returnUrl,
  };

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Payer ${esc(fmt(checkout.amount))} FCFA · ${esc(merchantName)}</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
:root {
  --white: #FFFFFF; --mist: #F3F7F4; --line: #E1E8E3;
  --ink: #0A0F0C; --grey: #56635B; --green: #8F6A00; --green-bright: #E2B341; --green-soft: #FBF3DC;
  --red: #B42318; --red-soft: #FDECEA;
  --display: "Unbounded", "Arial Black", system-ui, sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body {
  margin: 0; min-height: 100vh; background: var(--mist); color: var(--ink);
  font: 16px/1.5 var(--body);
  display: grid; place-items: start center;
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 32px max(16px, env(safe-area-inset-left));
}
.card { width: 100%; max-width: 420px; background: var(--white); border: 1px solid var(--line); border-radius: 28px; overflow: hidden; box-shadow: 0 24px 60px rgba(10,15,12,.08); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--line); }
.merchant { font-weight: 700; }
.test { font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; background: #FFF4D6; color: #7A5300; padding: 4px 9px; border-radius: 999px; }
.amount { padding: 22px 22px 6px; display: grid; gap: 2px; }
.amount h1 { margin: 0; font: 800 clamp(30px, 9vw, 38px)/1.1 var(--display); letter-spacing: -0.01em; }
.amount h1 span { color: var(--grey); font-size: .55em; }
.sats { font: 600 15px var(--mono); color: var(--green); font-variant-numeric: tabular-nums; }
.desc { color: var(--grey); font-size: 14px; }
.body { padding: 16px 22px 22px; display: grid; gap: 16px; }
.qr { position: relative; background: var(--white); border: 1px solid var(--line); border-radius: 20px; padding: 14px; }
.qr svg { display: block; width: 100%; height: auto; }
.qr .bolt { position: absolute; left: 50%; top: 50%; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 12px; background: var(--ink); color: var(--green-bright); display: grid; place-items: center; font: 800 22px var(--display); border: 4px solid var(--white); }
.status { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; }
.status b { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: var(--green-bright); animation: pulse 1.6s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(226,179,65,.55); } 70% { box-shadow: 0 0 0 8px rgba(226,179,65,0); } 100% { box-shadow: 0 0 0 0 rgba(226,179,65,0); } }
.timer { font: 500 13px var(--mono); color: var(--grey); font-variant-numeric: tabular-nums; }
.actions { display: grid; gap: 10px; }
.btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 18px; border-radius: 999px; font: 600 15px var(--body); text-decoration: none; cursor: pointer; border: 1px solid transparent; }
.btn-black { background: var(--ink); color: var(--white); }
.btn-line { background: var(--white); color: var(--ink); border-color: var(--line); }
.btn-line:hover { border-color: var(--ink); }
.btn-green { background: var(--green); color: var(--white); }
.btn-sim { background: #FFF4D6; color: #7A5300; border: 1px dashed #D9B44A; font-size: 14px; }
:focus-visible { outline: 2px solid var(--green-bright); outline-offset: 3px; }
.invoice { font: 500 11.5px var(--mono); color: var(--grey); word-break: break-all; background: var(--mist); border-radius: 12px; padding: 10px 12px; max-height: 64px; overflow: hidden; }
.done { padding: 34px 22px 26px; text-align: center; display: grid; gap: 12px; justify-items: center; }
.check { width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center; background: var(--green); color: var(--white); animation: pop .4s cubic-bezier(.3,1.6,.5,1); }
.done.expired .check { background: var(--red-soft); color: var(--red); animation: none; }
@keyframes pop { from { transform: scale(.4); opacity: 0; } }
.done h2 { margin: 0; font: 700 22px var(--display); }
.done p { margin: 0; color: var(--grey); }
.foot { padding: 14px 22px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; color: var(--grey); }
.foot b { color: var(--ink); }
.foot b i { font-style: normal; color: var(--green); }
@media (prefers-reduced-motion: reduce) { .dot, .check { animation: none; } }
</style>
</head>
<body>
<main class="card">
  <div class="top">
    <span class="merchant">${esc(merchantName)}</span>
    ${testnet ? '<span class="test" title="Facture Bitcoin testnet">Mode test</span>' : ""}
  </div>
  <div class="amount">
    <h1>${esc(fmt(checkout.amount))} <span>FCFA</span></h1>
    <span class="sats">${esc(fmt(checkout.amountSats))} sats</span>
    ${checkout.description ? `<span class="desc">${esc(checkout.description)}</span>` : ""}
  </div>

  <section class="body" id="pending"${checkout.status === "pending" ? "" : " hidden"}>
    <div class="qr" aria-label="QR code de la facture Lightning">${qrSvg}<span class="bolt" aria-hidden="true">₿</span></div>
    <div class="status" role="status" aria-live="polite">
      <b><i class="dot" aria-hidden="true"></i>En attente du paiement</b>
      <span class="timer" id="timer"></span>
    </div>
    <div class="actions">
      <a class="btn btn-black" href="lightning:${esc(checkout.paymentRequest)}">Ouvrir mon portefeuille Lightning</a>
      <button class="btn btn-line" type="button" id="copy">Copier la facture</button>
      ${showSimulate ? '<button class="btn btn-sim" type="button" id="simulate">Simuler le paiement (mode test)</button>' : ""}
    </div>
    <div class="invoice" id="invoice">${esc(checkout.paymentRequest)}</div>
  </section>

  <section class="done" id="paid"${checkout.status === "paid" ? "" : " hidden"} role="status">
    <div class="check" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
    <h2>Paiement reçu</h2>
    <p>${esc(fmt(checkout.amountSats))} sats reçus par ${esc(merchantName)}.</p>
    ${checkout.returnUrl ? `<a class="btn btn-green" id="back" href="${esc(checkout.returnUrl)}">Retour à la boutique</a><p id="redirect" style="font-size:13px"></p>` : ""}
  </section>

  <section class="done expired" id="expired"${checkout.status === "expired" ? "" : " hidden"} role="status">
    <div class="check" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div>
    <h2>Paiement expiré</h2>
    <p>Cette facture n'est plus valable. Aucun montant n'a été débité.</p>
    ${checkout.returnUrl ? `<a class="btn btn-line" href="${esc(checkout.returnUrl)}">Retour à la boutique</a>` : ""}
  </section>

  <div class="foot"><span>Paiement Bitcoin Lightning</span><b>YOMBAL<i>PAY</i></b></div>
</main>
<script>
(function () {
  var s = ${JSON.stringify(state).replace(/</g, "\\u003c")};
  var timer = document.getElementById("timer");

  function show(status) {
    s.status = status;
    ["pending", "paid", "expired"].forEach(function (k) { document.getElementById(k).hidden = k !== status; });
    if (status === "paid" && s.returnUrl) {
      var n = 5, r = document.getElementById("redirect");
      var url = new URL(s.returnUrl); url.searchParams.set("checkout", s.id);
      document.getElementById("back").href = url.toString();
      (function tick() {
        r.textContent = "Retour automatique dans " + n + " s";
        if (n-- <= 0) { location.href = url.toString(); return; }
        setTimeout(tick, 1000);
      })();
    }
  }

  function countdown() {
    if (s.status !== "pending") return;
    var left = Math.max(0, Math.floor((Date.parse(s.expiresAt) - Date.now()) / 1000));
    timer.textContent = "Expire dans " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
    setTimeout(countdown, 1000);
  }

  function poll() {
    if (s.status !== "pending") return;
    fetch("/pay/" + s.id + "/status", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.status && d.status !== s.status) show(d.status); })
      .catch(function () {})
      .finally(function () { if (s.status === "pending") setTimeout(poll, 3000); });
  }

  document.getElementById("copy").addEventListener("click", function () {
    var btn = this, text = document.getElementById("invoice").textContent;
    function done(m) { btn.textContent = m; setTimeout(function () { btn.textContent = "Copier la facture"; }, 1600); }
    function select() { var range = document.createRange(); range.selectNodeContents(document.getElementById("invoice")); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); done("Facture sélectionnée"); }
    try { navigator.clipboard.writeText(text).then(function () { done("Facture copiée"); }, select); } catch (e) { select(); }
  });

  var sim = document.getElementById("simulate");
  if (sim) sim.addEventListener("click", function () {
    sim.disabled = true; sim.textContent = "Confirmation…";
    fetch("/pay/" + s.id + "/simulate", { method: "POST" })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.status) show(d.status); })
      .catch(function () { sim.disabled = false; sim.textContent = "Simuler le paiement (mode test)"; });
  });

  if (s.status === "paid") show("paid");
  countdown();
  setTimeout(poll, 2000);
})();
</script>
</body>
</html>`;
}
