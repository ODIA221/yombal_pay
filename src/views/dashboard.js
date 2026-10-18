const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

// Tableau de bord marchand : une page, quatre vues (Accueil, Paiements, Développeurs, Compte).
// Les données viennent de /dashboard/data.json et se rafraîchissent toutes les 3 s.
export function renderDashboard({ merchant, apiBase, isDemo, notice, error, emailOk = true, admin = false, mode = "test", liveAvailable = false }) {
  const loginMethod = merchant.googleSub && merchant.passwordHash ? "Google et mot de passe" : merchant.googleSub ? "Google" : "Email et mot de passe";
  const live = mode === "live";
  const verified = merchant.verificationStatus === "verified";
  const modeQS = live ? "?mode=live" : "";
  const firstName = merchant.businessName;
  const vStatus = merchant.verificationStatus; // undefined avant la migration 004
  const V_LABEL = { none: "Non vérifiée", pending: "En cours de vérification", verified: "Vérifiée", rejected: "Refusée, à corriger" };
  let banner = "";
  if (!emailOk) {
    banner = `<div class="banner warn"><div><strong>Confirmez votre adresse email</strong><span>Nous avons envoyé un lien à ${esc(merchant.email)}. Tant qu'elle n'est pas confirmée, vous ne pouvez pas créer de paiements.</span></div><form method="post" action="/dashboard/renvoyer-email"><button class="bbtn" type="submit">Renvoyer l'email</button></form></div>`;
  } else if (vStatus === "none" || vStatus === "rejected") {
    banner = `<div class="banner info"><div><strong>${vStatus === "rejected" ? "Votre demande d'activation est à corriger" : "Activez votre compte pour les paiements réels"}</strong><span>${vStatus === "rejected" ? esc(merchant.verificationNote || "") : "Vous êtes en mode test. Envoyez votre NINEA, votre RCCM et votre compte de versement pour encaisser de vrais paiements."}</span></div><a class="bbtn" href="/activation">${vStatus === "rejected" ? "Corriger" : "Activer mon compte"}</a></div>`;
  } else if (vStatus === "pending") {
    banner = `<div class="banner info"><div><strong>Vérification de votre entreprise en cours</strong><span>Vous recevrez un email à la fin de la vérification. Le mode test reste disponible.</span></div><a class="bbtn light" href="/activation">Voir ma demande</a></div>`;
  }
  let modeBanner = "";
  if (!live) {
    modeBanner = `<div class="modebar test"><b>Mode test</b> · Les paiements sont simulés sur Bitcoin testnet : aucun vrai sats n'est encaissé. Les données de test ne se mélangent jamais avec la production.</div>`;
  } else if (!verified) {
    modeBanner = `<div class="banner info"><div><strong>Le mode production s'ouvre après la vérification de votre entreprise</strong><span>Envoyez votre NINEA, votre forme juridique et votre numéro Wave ou Orange Money. Nous vérifions, puis vous recevez votre clé de production.</span></div><a class="bbtn" href="/activation">Activer mon compte</a></div>`;
  } else if (!liveAvailable) {
    modeBanner = `<div class="banner info"><div><strong>Votre entreprise est vérifiée</strong><span>Les paiements réels ouvrent très bientôt sur YombalPay. Votre clé de production est déjà disponible dans l'onglet Développeurs.</span></div></div>`;
  } else {
    modeBanner = `<div class="modebar live"><b>Production</b> · Paiements réels : de vrais sats, versés sur votre compte ${esc(merchant.payoutMethod === "orange_money" ? "Orange Money" : "Wave")}.</div>`;
  }
  const canCollect = !live || (verified && liveAvailable);
  const since = merchant.createdAt ? new Date(merchant.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Tableau de bord · YombalPay</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
/* Barre latérale noire, contenu sur fond brume, vert YombalPay comme seul accent. */
:root {
  --white: #FFFFFF; --mist: #F3F7F4; --mist-2: #EAF0EC; --line: #E1E8E3;
  --ink: #0A0F0C; --ink-2: #141B17; --ink-3: #1D2620; --line-dark: #27322B;
  --grey: #56635B; --grey-light: #97A69D;
  --green: #8F6A00; --green-bright: #E2B341; --green-soft: #FBF3DC;
  --amber: #7A5300; --amber-soft: #FFF4D6; --red: #B42318; --red-soft: #FDECEA;
  --display: "Unbounded", "Arial Black", system-ui, sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html, body { height: 100%; }
body { margin: 0; background: var(--mist); color: var(--ink); font: 15px/1.5 var(--body); }
a { color: inherit; }
button { font: inherit; }
:focus-visible { outline: 2px solid var(--green-bright); outline-offset: 2px; }
.app { min-height: 100%; display: grid; grid-template-columns: 248px 1fr; }

/* ---------- Barre latérale ---------- */
.side { position: sticky; top: 0; height: 100vh; background: var(--ink); color: var(--white); display: flex; flex-direction: column; gap: 22px; padding: 20px 14px max(18px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left)); }
.logo { display: flex; align-items: center; gap: 10px; padding: 4px 8px; font: 800 15px var(--display); letter-spacing: .03em; text-decoration: none; }
.logo i { width: 32px; height: 32px; border-radius: 10px; background: var(--green); display: grid; place-items: center; font-style: normal; transform: rotate(-8deg); }
.logo b { color: var(--green-bright); }
.nav { display: grid; gap: 2px; }
.nav a { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; text-decoration: none; color: var(--grey-light); font-weight: 600; }
.nav a:hover { color: var(--white); background: var(--ink-2); }
.nav a[aria-current="page"] { color: var(--white); background: var(--ink-3); box-shadow: inset 3px 0 0 var(--green-bright); }
.nav .count { margin-left: auto; font: 600 11.5px var(--mono); background: var(--ink-3); color: var(--grey-light); padding: 2px 8px; border-radius: 999px; }
.side-new { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 11px; border-radius: 12px; background: var(--green); color: var(--white); text-decoration: none; font-weight: 700; }
.side-new:hover { background: #A67C0A; }
.side-foot { margin-top: auto; display: grid; gap: 10px; padding: 14px; border-radius: 16px; background: var(--ink-2); border: 1px solid var(--line-dark); }
.side-foot strong { font-size: 14px; overflow-wrap: anywhere; }
.side-foot span { font-size: 12.5px; color: var(--grey-light); overflow-wrap: anywhere; }
.mode { justify-self: start; font: 600 10.5px var(--mono); letter-spacing: .08em; text-transform: uppercase; padding: 3px 8px; border-radius: 999px; background: var(--amber-soft); color: var(--amber); }
.mode.live { background: var(--green); color: var(--white); }
.logout { background: none; border: 1px solid var(--line-dark); color: var(--grey-light); border-radius: 10px; padding: 7px 10px; font-weight: 600; font-size: 13px; cursor: pointer; width: 100%; }
.logout:hover { color: var(--white); border-color: var(--green-bright); }
.side-foot form { margin: 0; }

/* ---------- Contenu ---------- */
.main { min-width: 0; padding: 26px clamp(16px, 3vw, 36px) 56px; display: grid; gap: 20px; align-content: start; }
.top { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.top h1 { margin: 0; font: 700 clamp(22px, 2.6vw, 28px)/1.2 var(--display); }
.top p { margin: 4px 0 0; color: var(--grey); }
.sync { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--grey); }
.sync i { width: 8px; height: 8px; border-radius: 50%; background: var(--green-bright); animation: pulse 2s infinite; }
@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(226,179,65,.5); } 70% { box-shadow: 0 0 0 7px rgba(226,179,65,0); } 100% { box-shadow: 0 0 0 0 rgba(226,179,65,0); } }
.banner { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; border-radius: 18px; padding: 14px 18px; }
.banner > div { display: grid; gap: 2px; min-width: 0; flex: 1 1 320px; }
.banner strong { font-size: 15px; }
.banner span { font-size: 14px; }
.banner.warn { background: var(--amber-soft); color: var(--amber); }
.banner.info { background: var(--ink); color: var(--white); }
.banner.info span { color: var(--grey-light); }
.banner form { margin: 0; }
.bbtn { display: inline-flex; border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; font-size: 14px; cursor: pointer; text-decoration: none; background: var(--green); color: var(--white); white-space: nowrap; }
.bbtn.light { background: var(--white); color: var(--ink); }
.banner.warn .bbtn { background: var(--amber); }
.flash { margin: 0; border-radius: 14px; padding: 12px 16px; font-weight: 600; }
.flash.ok { background: var(--green-soft); color: var(--green); }
.flash.ko { background: var(--red-soft); color: var(--red); }
.stack { display: grid; gap: 20px; }
.switch { justify-self: start; display: inline-flex; padding: 4px; border-radius: 999px; background: var(--white); border: 1px solid var(--line); }
.switch a { padding: 7px 16px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 13.5px; color: var(--grey); }
.switch a[aria-current] { background: var(--ink); color: var(--white); }
.switch a[data-mode="live"][aria-current] { background: var(--green); }
.modebar { border-radius: 14px; padding: 10px 16px; font-size: 14px; }
.modebar.test { background: var(--amber-soft); color: var(--amber); border: 1px dashed #D9B44A; }
.modebar.live { background: var(--green-soft); color: var(--green); }
.tag { font: 600 10.5px var(--mono); padding: 2px 6px; border-radius: 6px; margin-left: 6px; letter-spacing: 0; text-transform: none; }
.tag.t { background: var(--amber-soft); color: var(--amber); }
.tag.l { background: var(--green-soft); color: var(--green); }
.keylive { padding-top: 16px; border-top: 1px dashed var(--line); }
form[inert] { opacity: .45; }
.card { background: var(--white); border: 1px solid var(--line); border-radius: 22px; min-width: 0; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.card-head h2 { margin: 0; font: 700 16px var(--body); }
.card-head a { font-size: 13.5px; font-weight: 600; color: var(--green); text-decoration: none; }
.card-body { padding: 18px 20px; }

/* Démarrage */
.start { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
.task { display: grid; gap: 6px; padding: 16px 20px; align-content: start; min-width: 0; }
.task + .task { border-left: 1px solid var(--line); }
.task .tick { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--line); display: grid; place-items: center; color: transparent; font-size: 13px; font-weight: 800; }
.task.done .tick { background: var(--green); border-color: var(--green); color: var(--white); }
.task strong { font-size: 14.5px; }
.task span { font-size: 13px; color: var(--grey); }
.task a { font-size: 13px; font-weight: 600; color: var(--green); text-decoration: none; }
.task.done a { display: none; }
.progress { font: 600 12.5px var(--mono); color: var(--grey); }

/* Chiffres */
.kpis { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 14px; }
.kpi { background: var(--white); border: 1px solid var(--line); border-radius: 20px; padding: 16px 18px; display: grid; gap: 4px; min-width: 0; }
.kpi.main { background: var(--ink); color: var(--white); border-color: var(--ink); }
.kpi > span { font-size: 13px; color: var(--grey); }
.kpi.main > span { color: var(--grey-light); }
.kpi strong { font: 700 clamp(20px, 2.4vw, 26px)/1.15 var(--display); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.kpi strong em { font-style: normal; font-size: .55em; color: var(--green-bright); }
.kpi small { font: 500 12.5px var(--mono); color: var(--green); }
.kpi.main small { color: var(--green-bright); }

/* Graphique + encaissement */
.duo { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; align-items: start; }
.chart-wrap { position: relative; padding: 14px 18px 12px; }
.chart-total { display: flex; align-items: baseline; gap: 8px; padding: 0 2px 6px; }
.chart-total strong { font: 700 22px var(--display); font-variant-numeric: tabular-nums; }
.chart-total span { color: var(--grey); font-size: 13px; }
svg.chart { width: 100%; height: 200px; display: block; overflow: visible; }
.chart text { font: 500 11px var(--mono); fill: var(--grey); }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .bar { fill: var(--green); }
.chart .bar.zero { fill: var(--mist-2); }
.chart .hit { fill: transparent; cursor: default; }
.chart .hit:hover + .bar, .chart g:hover .bar { fill: #6E5100; }
.tip { position: absolute; pointer-events: none; background: var(--ink); color: var(--white); border-radius: 10px; padding: 8px 10px; font-size: 12.5px; white-space: nowrap; transform: translate(-50%, -110%); box-shadow: 0 8px 20px rgba(10,15,12,.2); }
.tip b { display: block; font-family: var(--mono); }
.collect { padding: 18px 20px; display: grid; gap: 12px; }
.collect p { margin: 0; color: var(--grey); font-size: 13.5px; }
.collect label { display: grid; gap: 6px; font-weight: 600; font-size: 13.5px; }
.collect input { font: 15px var(--body); padding: 11px 12px; border: 1px solid var(--line); border-radius: 12px; width: 100%; min-width: 0; }
.collect input:focus { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.amount { display: flex; align-items: center; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.amount:focus-within { border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.amount input { border: 0; font: 600 20px var(--mono); box-shadow: none !important; }
.amount span { padding: 0 12px; color: var(--grey); font-weight: 600; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.chips button { border: 1px solid var(--line); background: var(--white); border-radius: 999px; padding: 5px 10px; font: 500 12.5px var(--mono); cursor: pointer; }
.chips button:hover { border-color: var(--green); }
.go { border: 0; border-radius: 12px; padding: 12px 14px; background: var(--ink); color: var(--white); font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
.go:hover { background: var(--green); }

/* Tableau des paiements */
.toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.filters { display: flex; gap: 4px; background: var(--mist); padding: 4px; border-radius: 999px; }
.filters button { border: 0; background: none; font-weight: 600; font-size: 13px; color: var(--grey); padding: 6px 12px; border-radius: 999px; cursor: pointer; }
.filters button[aria-pressed="true"] { background: var(--white); color: var(--ink); box-shadow: 0 1px 3px rgba(10,15,12,.12); }
.search { border: 1px solid var(--line); border-radius: 999px; padding: 8px 14px; font: 14px var(--body); min-width: 0; width: 220px; max-width: 100%; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 720px; }
th { text-align: left; font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--grey); padding: 10px 20px; background: var(--mist); }
td { padding: 13px 20px; border-top: 1px solid var(--line); vertical-align: middle; }
td.num, th.num { text-align: right; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.amt { font-weight: 700; }
.sats, .ref { font: 500 12px var(--mono); color: var(--grey); }
.desc { font-weight: 600; }
.when { color: var(--grey); white-space: nowrap; font-size: 13.5px; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12.5px; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.pill::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pill.paid { background: var(--green-soft); color: var(--green); }
.pill.pending { background: var(--amber-soft); color: var(--amber); }
.pill.expired { background: var(--mist); color: var(--grey); }
.hook { font: 500 12.5px var(--mono); white-space: nowrap; }
.hook.ok { color: var(--green); } .hook.ko { color: var(--red); } .hook.none { color: var(--grey-light); }
td a.open { font-size: 13px; font-weight: 600; color: var(--green); text-decoration: none; white-space: nowrap; }
tr.flash-row td { animation: flash 2.2s ease; }
@keyframes flash { 0%, 40% { background: var(--green-soft); } 100% { background: transparent; } }
.empty { padding: 40px 20px; text-align: center; color: var(--grey); display: grid; gap: 8px; justify-items: center; }
.empty strong { color: var(--ink); font-size: 15.5px; }

/* Développeurs et compte */
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.field { display: grid; gap: 6px; }
.field + .field { margin-top: 16px; }
.lbl { font: 600 11px var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--grey); }
.val { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.val code, .codeblock { font: 500 13px var(--mono); background: var(--mist); border-radius: 10px; padding: 9px 12px; overflow-wrap: anywhere; min-width: 0; }
.val code { flex: 1 1 220px; }
.hint { margin: 0; font-size: 13px; color: var(--grey); }
.btn-s { background: var(--ink); color: var(--white); border: 0; border-radius: 10px; padding: 9px 12px; font-weight: 600; font-size: 13px; cursor: pointer; white-space: nowrap; }
.btn-s:hover { background: var(--green); }
.btn-s.light { background: var(--white); color: var(--ink); border: 1px solid var(--line); }
.codeblock { display: block; white-space: pre; overflow-x: auto; background: var(--ink); color: #DCE5DF; padding: 14px 16px; border-radius: 14px; line-height: 1.6; }
.codeblock .s { color: var(--green-bright); }
.deliv { list-style: none; margin: 0; padding: 0; display: grid; }
.deliv li { display: flex; gap: 10px; justify-content: space-between; align-items: center; padding: 11px 20px; border-top: 1px solid var(--line); font-size: 13.5px; flex-wrap: wrap; }
.deliv li:first-child { border-top: 0; }
.deliv code { font: 500 12.5px var(--mono); }
dl.info { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 10px 20px; }
dl.info dt { color: var(--grey); font-size: 13.5px; }
dl.info dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }

@media (max-width: 1100px) { .duo { grid-template-columns: 1fr; } .start { grid-template-columns: 1fr 1fr; } .task:nth-child(3) { border-left: 0; } .task:nth-child(n+3) { border-top: 1px solid var(--line); } }
@media (max-width: 900px) {
  .app { grid-template-columns: 1fr; }
  .side { position: sticky; top: 0; z-index: 5; height: auto; flex-direction: row; align-items: center; gap: 8px; padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left)); overflow-x: auto; }
  .logo span, .side-foot, .side-new span, .nav .count { display: none; }
  .nav { display: flex; gap: 2px; }
  .nav a { padding: 9px 10px; }
  .nav a span { display: none; }
  .side-new { padding: 9px 12px; margin-left: auto; }
  .kpis { grid-template-columns: 1fr 1fr; }
  .grid2 { grid-template-columns: 1fr; }
}
@media (max-width: 560px) { .start { grid-template-columns: 1fr; } .task + .task { border-left: 0; border-top: 1px solid var(--line); } }
@media (prefers-reduced-motion: reduce) { .sync i, tr.flash-row td { animation: none; } }
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <a class="logo" href="/"><i>₿</i><span>YOMBAL<b>PAY</b></span></a>
    <nav class="nav" aria-label="Tableau de bord">
      <a href="#accueil" data-view="accueil">${icon("home")}<span>Accueil</span></a>
      <a href="#paiements" data-view="paiements">${icon("list")}<span>Paiements</span><em class="count" id="navCount">0</em></a>
      <a href="#developpeurs" data-view="developpeurs">${icon("code")}<span>Développeurs</span></a>
      <a href="#compte" data-view="compte">${icon("user")}<span>Compte</span></a>
      ${admin ? `<a href="/admin">${icon("list")}<span>Admin · vérifications</span></a>` : ""}
    </nav>
    <a class="side-new" href="#encaisser" id="sideNew">${icon("plus", 16)}<span>Encaisser</span></a>
    <div class="side-foot">
      <span class="mode${live ? " live" : ""}">${live ? "Production" : "Mode test"}</span>
      <strong>${esc(merchant.businessName)}</strong>
      <span>${esc(merchant.email)}</span>
      <form method="post" action="/deconnexion"><button class="logout" type="submit">Se déconnecter</button></form>
    </div>
  </aside>

  <main class="main">
    <div class="switch" role="group" aria-label="Mode">
      <a href="/dashboard" data-mode="test"${live ? "" : ' aria-current="true"'}>Test</a>
      <a href="/dashboard?mode=live" data-mode="live"${live ? ' aria-current="true"' : ""}>Production</a>
    </div>
    ${modeBanner}
    <div class="top">
      <div><h1 id="title">Bonjour, ${esc(firstName)}</h1><p id="subtitle">Voici l'activité de votre boutique.</p></div>
      <span class="sync" aria-live="polite"><i aria-hidden="true"></i><span id="sync">Mise à jour en direct</span></span>
    </div>
    ${notice ? `<p class="flash ok" role="status">${esc(notice)}</p>` : ""}
    ${error ? `<p class="flash ko" role="alert">${esc(error)}</p>` : ""}
    ${banner}

    <!-- ===== Accueil ===== -->
    <section data-section="accueil" class="view stack">
      <div class="card" id="startCard">
        <div class="card-head"><h2>Bien démarrer avec YombalPay</h2><span class="progress" id="startProgress">0 / 4</span></div>
        <div class="start">
          <div class="task done" data-task="account"><span class="tick">✓</span><strong>Compte créé</strong><span>Votre clé API de test est prête.</span></div>
          <div class="task" data-task="first"><span class="tick">✓</span><strong>Premier paiement</strong><span>Créez une page de paiement ou appelez l'API.</span><a href="#encaisser">Encaisser maintenant →</a></div>
          <div class="task" data-task="paid"><span class="tick">✓</span><strong>Premier paiement reçu</strong><span>En mode test, simulez-le depuis la page de paiement.</span><a href="#paiements">Voir les paiements →</a></div>
          <div class="task" data-task="webhook"><span class="tick">✓</span><strong>Webhook branché</strong><span>Votre site est prévenu à chaque paiement.</span><a href="#developpeurs">Voir comment →</a></div>
        </div>
      </div>

      <section class="kpis" aria-label="Résumé">
        <div class="kpi main"><span>Total encaissé</span><strong><span id="kTotal">0</span> <em>FCFA</em></strong><small id="kSats">0 sats reçus</small></div>
        <div class="kpi"><span>Paiements réussis</span><strong id="kPaid">0</strong><small id="kRate"></small></div>
        <div class="kpi"><span>En attente</span><strong id="kPending">0</strong></div>
        <div class="kpi"><span>Panier moyen</span><strong id="kAvg">–</strong></div>
      </section>

      <div class="duo">
        <div class="card">
          <div class="card-head"><h2>Encaissé sur 7 jours</h2><span class="hint">en FCFA, paiements réussis</span></div>
          <div class="chart-wrap" id="chartWrap">
            <div class="chart-total"><strong id="weekTotal">0 FCFA</strong><span id="weekCount">aucun paiement cette semaine</span></div>
            <svg class="chart" id="chart" role="img" aria-label="Montants encaissés par jour sur les 7 derniers jours"></svg>
            <div class="tip" id="tip" hidden></div>
          </div>
        </div>

        <div class="card" id="encaisser">
          <div class="card-head"><h2>Encaisser maintenant</h2></div>
          <form class="collect" method="post" action="/dashboard/paiements${modeQS}"${canCollect ? "" : " inert"}>
            <input type="hidden" name="mode" value="${live ? "live" : "test"}">
            <p>Pas de site web ? Créez une page de paiement et montrez son QR code à votre client, ou envoyez-lui le lien.</p>
            <label for="qAmount">Montant
              <span class="amount"><input id="qAmount" name="amount" type="text" inputmode="numeric" required placeholder="5 000" autocomplete="off"><span>FCFA</span></span>
            </label>
            <div class="chips" role="group" aria-label="Montants rapides"><button type="button" data-v="2500">2 500</button><button type="button" data-v="5000">5 000</button><button type="button" data-v="15000">15 000</button><button type="button" data-v="25000">25 000</button></div>
            <label for="qDesc">Description <input id="qDesc" name="description" maxlength="140" placeholder="Ex. Tissu wax, 6 yards"></label>
            <button class="go" type="submit">${icon("plus", 16)} Créer la page de paiement</button>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h2>Derniers paiements</h2><a href="#paiements">Tout voir →</a></div>
        <div class="scroll"><table><thead><tr><th>Date</th><th>Description</th><th class="num">Montant</th><th>Statut</th><th></th></tr></thead><tbody id="recentRows"></tbody></table></div>
        <div class="empty" id="recentEmpty" hidden><strong>Aucun paiement pour l'instant</strong><span>Créez votre premier paiement avec « Encaisser maintenant ».</span></div>
      </div>
    </section>

    <!-- ===== Paiements ===== -->
    <section data-section="paiements" class="view card" hidden>
      <div class="card-head">
        <h2>Tous les paiements</h2>
        <div class="toolbar">
          <input class="search" id="search" type="search" placeholder="Rechercher une description ou une référence" aria-label="Rechercher">
          <div class="filters" role="group" aria-label="Filtrer par statut">
            <button type="button" data-f="all" aria-pressed="true">Tous</button>
            <button type="button" data-f="paid" aria-pressed="false">Payés</button>
            <button type="button" data-f="pending" aria-pressed="false">En attente</button>
            <button type="button" data-f="expired" aria-pressed="false">Expirés</button>
          </div>
        </div>
      </div>
      <div class="scroll"><table><thead><tr><th>Date</th><th>Description</th><th class="num">Montant</th><th>Statut</th><th>Confirmé par</th><th>Webhook</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
      <div class="empty" id="empty" hidden><strong>Aucun paiement ne correspond</strong><span>Changez le filtre ou créez un paiement.</span></div>
    </section>

    <!-- ===== Développeurs ===== -->
    <section data-section="developpeurs" class="view stack" hidden>
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>Clés API</h2></div><div class="card-body">
          <div class="field"><span class="lbl">Adresse de l'API</span><div class="val"><code id="apiBase">${esc(apiBase)}/v1</code><button class="btn-s light" type="button" data-copy="apiBase">Copier</button></div></div>
          <div class="field"><span class="lbl">Clé de test <span class="tag t">sk_test_</span></span><div class="val"><code>${esc(merchant.apiKeyHint)}</code></div>
            <p class="hint">Paiements simulés sur Bitcoin testnet. La clé complète n'est montrée qu'à sa création : perdue, générez-en une nouvelle.</p>
            ${
              isDemo
                ? '<p class="hint"><em>Compte de démo : la clé se change dans le fichier .env (YOMBAL_SECRET_KEY).</em></p>'
                : '<form method="post" action="/dashboard/cle" style="margin:0"><input type="hidden" name="mode" value="test"><button class="btn-s light" type="submit">Nouvelle clé de test</button></form>'
            }
          </div>
          <div class="field keylive"><span class="lbl">Clé de production <span class="tag l">sk_live_</span></span>
            ${
              !verified
                ? `<p class="hint">Délivrée après la vérification de votre entreprise. Avec elle, les paiements sont réels. <a href="/activation">Activer mon compte →</a></p>`
                : merchant.liveApiKeyHint
                  ? `<div class="val"><code>${esc(merchant.liveApiKeyHint)}</code></div><p class="hint">Paiements réels. Ne la mettez jamais dans le code visible de votre site.</p><form method="post" action="/dashboard/cle" style="margin:0"><input type="hidden" name="mode" value="live"><button class="btn-s light" type="submit">Nouvelle clé de production</button></form>`
                  : `<p class="hint">Votre entreprise est vérifiée : générez votre clé de production.</p><form method="post" action="/dashboard/cle" style="margin:0"><input type="hidden" name="mode" value="live"><button class="btn-s" type="submit">Générer ma clé de production</button></form>`
            }
          </div>
        </div></div>
        <div class="card"><div class="card-head"><h2>Webhooks</h2></div><div class="card-body">
          <div class="field"><span class="lbl">Secret de signature</span><div class="val"><code id="whsec" data-secret="${esc(merchant.webhookSecret)}">whsec_••••••••••••••••</code><button class="btn-s light" type="button" id="reveal">Afficher</button></div>
            <p class="hint">Vérifiez l'en-tête <code>Yombal-Signature</code> de chaque notification : HMAC-SHA256 de « horodatage.corps » avec ce secret.</p></div>
          <div class="field"><span class="lbl">Événement envoyé</span><p class="hint"><code>checkout.paid</code> vers le <code>webhook_url</code> donné à la création du paiement, avec 4 tentatives maximum.</p></div>
        </div></div>
      </div>
      <div class="card"><div class="card-head"><h2>Créer un paiement depuis votre serveur</h2><span style="display:flex;gap:8px;align-items:center"><a href="/docs#demarrage">Documentation →</a><button class="btn-s light" type="button" data-copy="snippet">Copier</button></span></div><div class="card-body">
<code class="codeblock" id="snippet">curl ${esc(apiBase)}/v1/checkouts \\
  -u <span class="s">VOTRE_CLE_SECRETE:</span> \\
  -H "Content-Type: application/json" \\
  -d '{"amount": 5000, "currency": "XOF", "reference": "commande-1042",
       "webhook_url": "https://votre-site.sn/hooks/yombalpay"}'</code>
      </div></div>
      <div class="card"><div class="card-head"><h2>Derniers webhooks envoyés</h2></div><ul class="deliv" id="deliveries"></ul><div class="empty" id="delivEmpty" hidden><strong>Aucun webhook envoyé</strong><span>Ajoutez un webhook_url à vos paiements pour être prévenu automatiquement.</span></div></div>
    </section>

    <!-- ===== Compte ===== -->
    <section data-section="compte" class="view card" hidden>
      <div class="card-head"><h2>Votre compte</h2></div>
      <div class="card-body">
        <dl class="info">
          <dt>Entreprise</dt><dd>${esc(merchant.businessName)}</dd>
          <dt>Email</dt><dd>${esc(merchant.email)}</dd>
          ${merchant.phone ? `<dt>Téléphone</dt><dd>${esc(merchant.phone)}</dd>` : ""}
          <dt>Connexion</dt><dd>${esc(loginMethod)}</dd>
          <dt>Email</dt><dd>${emailOk ? "Confirmé" : "Non confirmé"}</dd>
          ${vStatus !== undefined ? `<dt>Entreprise</dt><dd>${esc(V_LABEL[vStatus] || vStatus)} · <a href="/activation">${vStatus === "verified" || vStatus === "pending" ? "Voir" : "Activer"}</a></dd>` : ""}
          <dt>Production</dt><dd>${verified ? (merchant.liveApiKeyHint ? "Clé de production active" : "Disponible : générez votre clé dans Développeurs") : "Après vérification de l'entreprise"}</dd>
          ${since ? `<dt>Membre depuis</dt><dd>${esc(since)}</dd>` : ""}
          <dt>Identifiant</dt><dd><code>${esc(merchant.id)}</code></dd>
        </dl>
      </div>
    </section>
  </main>
</div>

<script>
(function () {
  var nf = new Intl.NumberFormat("fr-FR");
  var df = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  var dayf = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
  var LABEL = { paid: "Payé", pending: "En attente", expired: "Expiré" };
  var VIA = { bitnob_status: "Vérification Bitnob", test_helper: "Simulation (test)" };
  var TITLES = {
    accueil: ["Bonjour, " + ${JSON.stringify(firstName).replace(/</g, "\\u003c")}, "Voici l'activité de votre boutique."],
    paiements: ["Paiements", "Tous vos paiements, en direct."],
    developpeurs: ["Développeurs", "Vos clés, vos webhooks et un exemple d'intégration."],
    compte: ["Compte", "Les informations de votre compte marchand."]
  };
  var filter = "all", query = "", items = [], seenPaid = null, lastData = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- Bouton Retour ----------
     Après une connexion, l'historique contient l'écran Google ou le formulaire de connexion.
     On remplace l'entrée précédente par la page d'accueil : Retour mène toujours à « / ». */
  if (!history.state || history.state.yp !== "dash") {
    history.replaceState({ yp: "home" }, "", "/");
    history.pushState({ yp: "dash" }, "", "/dashboard" + location.search + location.hash);
  }
  window.addEventListener("popstate", function (e) {
    if (e.state && e.state.yp === "home") location.replace("/");
  });

  document.querySelectorAll(".switch a").forEach(function (a) {
    a.addEventListener("click", function (e) { e.preventDefault(); location.href = a.getAttribute("href") + location.hash; });
  });

  /* ---------- Vues ---------- */
  function show(view) {
    if (!TITLES[view]) view = "accueil";
    document.querySelectorAll(".view").forEach(function (v) { v.hidden = v.dataset.section !== view; });
    document.querySelectorAll(".nav a").forEach(function (a) { if (a.dataset.view === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    document.getElementById("title").textContent = TITLES[view][0];
    document.getElementById("subtitle").textContent = TITLES[view][1];
  }
  function route() {
    var h = location.hash.slice(1);
    if (h === "encaisser") { show("accueil"); var f = document.getElementById("encaisser"); f.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(function () { document.getElementById("qAmount").focus(); }, 300); return; }
    show(h);
  }
  window.addEventListener("hashchange", route);
  route();

  /* ---------- Rendu ---------- */
  function via(v) { if (!v) return "–"; if (v.indexOf("bitnob_webhook") === 0) return "Webhook Bitnob"; return VIA[v] || v; }
  function hook(c) {
    if (!c.webhook_url) return '<span class="hook none">–</span>';
    var d = c.deliveries && c.deliveries[c.deliveries.length - 1];
    if (!d) return '<span class="hook none">' + (c.status === "paid" ? "envoi…" : "en attente") + "</span>";
    var ok = d.status >= 200 && d.status < 300;
    return '<span class="hook ' + (ok ? "ok" : "ko") + '">' + (ok ? "✓ " : "✕ ") + (d.status || "réseau") + (d.attempt > 1 ? " · essai " + d.attempt : "") + "</span>";
  }
  function amountCell(c) { return '<td class="num"><div class="amt">' + nf.format(c.amount) + ' FCFA</div><div class="sats">' + nf.format(c.amount_sats) + " sats</div></td>"; }
  function descCell(c) { return '<td><div class="desc">' + esc(c.description || "Paiement") + '</div><div class="ref">' + esc(c.reference || c.id) + "</div></td>"; }
  function openCell(c) { return c.status === "pending" ? '<td><a class="open" href="/pay/' + esc(c.id) + '" target="_blank" rel="noopener">Ouvrir le QR ↗</a></td>' : "<td></td>"; }

  function render(data) {
    lastData = data;
    var s = data.summary;
    document.getElementById("kTotal").textContent = nf.format(s.totalXof);
    document.getElementById("kSats").textContent = nf.format(s.totalSats) + " sats reçus";
    document.getElementById("kPaid").textContent = nf.format(s.paidCount);
    document.getElementById("kRate").textContent = s.count ? Math.round(s.paidCount / s.count * 100) + " % des paiements créés" : "";
    document.getElementById("kPending").textContent = nf.format(s.pendingCount);
    document.getElementById("kAvg").textContent = s.paidCount ? nf.format(Math.round(s.totalXof / s.paidCount)) + " FCFA" : "–";
    document.getElementById("navCount").textContent = nf.format(s.count);

    // Les paiements devenus payés depuis le dernier rafraîchissement sont surlignés.
    var fresh = {};
    data.checkouts.forEach(function (c) { if (c.status === "paid" && seenPaid && !seenPaid[c.id]) fresh[c.id] = true; });
    seenPaid = {};
    data.checkouts.forEach(function (c) { if (c.status === "paid") seenPaid[c.id] = true; });
    items = data.checkouts;

    // Démarrage
    var tasks = { account: true, first: s.count > 0, paid: s.paidCount > 0, webhook: items.some(function (c) { return c.webhook_url; }) };
    var done = 0;
    Object.keys(tasks).forEach(function (k) { var el = document.querySelector('[data-task="' + k + '"]'); el.classList.toggle("done", tasks[k]); if (tasks[k]) done++; });
    document.getElementById("startProgress").textContent = done + " / 4";
    document.getElementById("startCard").hidden = done === 4;

    // Derniers paiements
    var recent = items.slice(0, 5);
    document.getElementById("recentEmpty").hidden = recent.length > 0;
    document.getElementById("recentRows").innerHTML = recent.map(function (c) {
      return "<tr" + (fresh[c.id] ? ' class="flash-row"' : "") + '><td class="when">' + esc(df.format(new Date(c.created_at))) + "</td>" + descCell(c) + amountCell(c) +
        '<td><span class="pill ' + c.status + '">' + LABEL[c.status] + "</span></td>" + openCell(c) + "</tr>";
    }).join("");

    renderTable(fresh);
    renderChart();
    renderDeliveries();
  }

  function renderTable(fresh) {
    var q = query.toLowerCase();
    var rows = items.filter(function (c) {
      if (filter !== "all" && c.status !== filter) return false;
      return !q || (c.description || "").toLowerCase().indexOf(q) >= 0 || (c.reference || "").toLowerCase().indexOf(q) >= 0 || c.id.indexOf(q) >= 0;
    });
    document.getElementById("empty").hidden = rows.length > 0;
    document.getElementById("rows").innerHTML = rows.map(function (c) {
      return "<tr" + (fresh && fresh[c.id] ? ' class="flash-row"' : "") + '><td class="when">' + esc(df.format(new Date(c.created_at))) + "</td>" + descCell(c) + amountCell(c) +
        '<td><span class="pill ' + c.status + '">' + LABEL[c.status] + "</span></td><td>" + esc(via(c.paid_via)) + "</td><td>" + hook(c) + "</td>" + openCell(c) + "</tr>";
    }).join("");
  }

  function renderDeliveries() {
    var list = [];
    items.forEach(function (c) { (c.deliveries || []).forEach(function (d) { list.push({ c: c, d: d }); }); });
    list.sort(function (a, b) { return Date.parse(b.d.at) - Date.parse(a.d.at); });
    list = list.slice(0, 8);
    document.getElementById("delivEmpty").hidden = list.length > 0;
    document.getElementById("deliveries").innerHTML = list.map(function (x) {
      var ok = x.d.status >= 200 && x.d.status < 300;
      return "<li><span><code>" + esc(x.d.type) + "</code> · " + esc(x.c.description || x.c.id) + '</span><span class="hook ' + (ok ? "ok" : "ko") + '">' + (ok ? "✓ " : "✕ ") + (x.d.status || "réseau") + " · " + esc(df.format(new Date(x.d.at))) + "</span></li>";
    }).join("");
  }

  /* ---------- Graphique : barres, une série, 7 derniers jours ---------- */
  function renderChart() {
    var days = [], today = new Date(); today.setHours(0, 0, 0, 0);
    for (var i = 6; i >= 0; i--) { var d = new Date(today); d.setDate(d.getDate() - i); days.push({ date: d, total: 0, count: 0 }); }
    items.forEach(function (c) {
      if (c.status !== "paid" || !c.paid_at) return;
      var p = new Date(c.paid_at); p.setHours(0, 0, 0, 0);
      days.forEach(function (d) { if (d.date.getTime() === p.getTime()) { d.total += c.amount; d.count++; } });
    });
    var weekTotal = days.reduce(function (t, d) { return t + d.total; }, 0), weekCount = days.reduce(function (t, d) { return t + d.count; }, 0);
    document.getElementById("weekTotal").textContent = nf.format(weekTotal) + " FCFA";
    document.getElementById("weekCount").textContent = weekCount ? weekCount + " paiement" + (weekCount > 1 ? "s" : "") + " réussi" + (weekCount > 1 ? "s" : "") : "aucun paiement cette semaine";

    var svg = document.getElementById("chart"), W = svg.clientWidth || 600, H = 200, padL = 46, padB = 24, padT = 8;
    var max = Math.max.apply(null, days.map(function (d) { return d.total; }));
    var step = niceStep(max || 1000), top = Math.max(step * 4, Math.ceil((max || 1) / step) * step);
    var plotH = H - padB - padT, plotW = W - padL, slot = plotW / 7, bw = Math.min(42, slot * 0.56);
    var y = function (v) { return padT + plotH - (v / top) * plotH; };
    var out = "";
    for (var t = 0; t <= top; t += top / 4) {
      out += '<line class="grid" x1="' + padL + '" x2="' + W + '" y1="' + y(t) + '" y2="' + y(t) + '"></line>';
      out += '<text x="' + (padL - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + short(t) + "</text>";
    }
    days.forEach(function (d, i) {
      var cx = padL + slot * i + slot / 2, h = Math.max(d.total ? 4 : 3, (d.total / top) * plotH), x = cx - bw / 2, yy = padT + plotH - h, r = Math.min(4, bw / 2, h);
      var path = "M" + x + "," + (padT + plotH) + "V" + (yy + r) + "Q" + x + "," + yy + " " + (x + r) + "," + yy + "H" + (x + bw - r) + "Q" + (x + bw) + "," + yy + " " + (x + bw) + "," + (yy + r) + "V" + (padT + plotH) + "Z";
      out += '<g data-i="' + i + '"><rect class="hit" x="' + (cx - slot / 2) + '" y="' + padT + '" width="' + slot + '" height="' + plotH + '"></rect><path class="bar' + (d.total ? "" : " zero") + '" d="' + path + '"></path>' +
        '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle">' + (i === 6 ? "Auj." : dayf.format(d.date).replace(".", "")) + "</text></g>";
    });
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = out;
    var tip = document.getElementById("tip"), wrap = document.getElementById("chartWrap");
    svg.querySelectorAll("g[data-i]").forEach(function (g) {
      g.addEventListener("mousemove", function (e) {
        var d = days[+g.dataset.i], r = wrap.getBoundingClientRect();
        tip.innerHTML = d.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + "<b>" + nf.format(d.total) + " FCFA</b>" + d.count + " paiement" + (d.count > 1 ? "s" : "");
        tip.style.left = (e.clientX - r.left) + "px"; tip.style.top = (e.clientY - r.top) + "px"; tip.hidden = false;
      });
      g.addEventListener("mouseleave", function () { tip.hidden = true; });
    });
  }
  function niceStep(max) { var raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag; }
  function short(v) { return v >= 1000000 ? (v / 1000000).toLocaleString("fr-FR") + " M" : v >= 1000 ? (v / 1000).toLocaleString("fr-FR") + " k" : String(v); }
  window.addEventListener("resize", function () { if (lastData) renderChart(); });

  /* ---------- Chargement ---------- */
  function load() {
    fetch("/dashboard/data.json" + ${JSON.stringify(modeQS)}, { cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (r.status === 401) { location.href = "/connexion"; throw new Error("session"); } if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { render(d); document.getElementById("sync").textContent = "Mis à jour à " + new Date().toLocaleTimeString("fr-FR"); })
      .catch(function () { document.getElementById("sync").textContent = "Connexion perdue, nouvel essai…"; })
      .finally(function () { setTimeout(load, 3000); });
  }

  /* ---------- Interactions ---------- */
  document.querySelectorAll(".filters button").forEach(function (b) {
    b.addEventListener("click", function () {
      filter = b.dataset.f;
      document.querySelectorAll(".filters button").forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      renderTable();
    });
  });
  document.getElementById("search").addEventListener("input", function (e) { query = e.target.value.trim(); renderTable(); });
  var amt = document.getElementById("qAmount");
  amt.addEventListener("input", function () { var d = amt.value.replace(/\\D/g, "").slice(0, 9); amt.value = d ? nf.format(+d) : ""; });
  document.querySelectorAll(".chips button").forEach(function (b) { b.addEventListener("click", function () { amt.value = nf.format(+b.dataset.v); document.getElementById("qDesc").focus(); }); });
  var reveal = document.getElementById("reveal"), wh = document.getElementById("whsec"), shown = false;
  reveal.addEventListener("click", function () { shown = !shown; wh.textContent = shown ? wh.dataset.secret : "whsec_••••••••••••••••"; reveal.textContent = shown ? "Masquer" : "Afficher"; });
  document.querySelectorAll("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var el = document.getElementById(b.dataset.copy), text = el.textContent;
      function done(m) { b.textContent = m; setTimeout(function () { b.textContent = "Copier"; }, 1500); }
      function select() { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done("Sélectionné"); }
      try { navigator.clipboard.writeText(text).then(function () { done("Copié"); }, select); } catch (e) { select(); }
    });
  });

  load();
})();
</script>
</body>
</html>`;
}
