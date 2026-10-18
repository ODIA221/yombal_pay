import { LEGAL_FORMS, PAYOUT_METHODS, SECTORS } from "../merchants.js";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const HEAD = (title) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · YombalPay</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@700;800&family=Figtree:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
:root {
  --white: #FFFFFF; --mist: #F3F7F4; --line: #E1E8E3; --ink: #0A0F0C; --grey: #56635B;
  --green: #8F6A00; --green-bright: #E2B341; --green-soft: #FBF3DC;
  --amber: #7A5300; --amber-soft: #FFF4D6; --red: #B42318; --red-soft: #FDECEA;
  --display: "Unbounded", "Arial Black", system-ui, sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--mist); color: var(--ink); font: 15.5px/1.55 var(--body); }
a { color: var(--green); }
:focus-visible { outline: 2px solid var(--green-bright); outline-offset: 2px; }
header { background: var(--ink); color: var(--white); }
header .in { max-width: 860px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px max(16px, env(safe-area-inset-right)) 14px max(16px, env(safe-area-inset-left)); }
.logo { display: flex; align-items: center; gap: 10px; font: 800 15px var(--display); text-decoration: none; color: var(--white); }
.logo i { width: 30px; height: 30px; border-radius: 9px; background: var(--green); display: grid; place-items: center; font-style: normal; transform: rotate(-8deg); }
.logo b { color: var(--green-bright); }
header a.back { color: #97A69D; text-decoration: none; font-weight: 600; font-size: 14px; }
main { max-width: 860px; margin: 0 auto; padding: 28px max(16px, env(safe-area-inset-right)) 64px max(16px, env(safe-area-inset-left)); display: grid; gap: 18px; }
h1 { margin: 0; font: 700 clamp(22px, 3vw, 30px)/1.2 var(--display); }
.sub { margin: 0; color: var(--grey); }
.card { background: var(--white); border: 1px solid var(--line); border-radius: 22px; padding: clamp(18px, 3vw, 28px); display: grid; gap: 16px; }
.card h2 { margin: 0; font: 700 17px var(--body); }
.steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.step { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: var(--white); border: 1px solid var(--line); font-size: 13.5px; }
.step b { font-size: 14px; }
.step i { font-style: normal; font: 600 11px var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--grey); }
.step.done { border-color: #EBD8A6; background: var(--green-soft); }
.step.done i { color: var(--green); }
.step.now { border-color: var(--ink); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.full { grid-column: 1 / -1; }
label { display: grid; gap: 6px; font-weight: 600; font-size: 14px; min-width: 0; }
label small { color: var(--grey); font-weight: 400; }
input, select { font: 15px var(--body); padding: 11px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--white); color: var(--ink); width: 100%; min-width: 0; }
input:focus, select:focus { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.bad input, .bad select { border-color: var(--red); }
.msg { color: var(--red); font-weight: 500; font-size: 13px; }
.radios { display: flex; gap: 8px; flex-wrap: wrap; }
.radios label { flex: 1 1 160px; display: flex; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; cursor: pointer; font-weight: 600; }
.radios input { width: auto; }
.radios label:has(input:checked) { border-color: var(--green); background: var(--green-soft); }
.err { background: var(--red-soft); color: var(--red); border-radius: 14px; padding: 12px 16px; margin: 0; font-weight: 600; }
.note { background: var(--mist); border-radius: 14px; padding: 12px 16px; margin: 0; font-size: 14px; color: var(--grey); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 20px; border-radius: 999px; font: 700 15px var(--body); text-decoration: none; cursor: pointer; border: 0; background: var(--green); color: var(--white); }
.btn:hover { background: #A67C0A; }
.status { display: grid; gap: 10px; justify-items: start; }
.pill { font: 600 12px var(--mono); letter-spacing: .06em; text-transform: uppercase; padding: 5px 12px; border-radius: 999px; }
.pill.pending { background: var(--amber-soft); color: var(--amber); }
.pill.verified { background: var(--green); color: var(--white); }
.pill.rejected { background: var(--red-soft); color: var(--red); }
dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 8px 18px; font-size: 14.5px; }
dt { color: var(--grey); } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
@media (max-width: 680px) { .grid { grid-template-columns: 1fr; } .steps { grid-template-columns: 1fr 1fr; } }
</style>
</head>
<body>
<header><div class="in"><a class="logo" href="/"><i>₿</i><span>YOMBAL<b>PAY</b></span></a><a class="back" href="/dashboard">← Tableau de bord</a></div></header>`;

function steps(m) {
  const s = m.verificationStatus;
  const list = [
    ["Compte créé", true],
    ["Email confirmé", Boolean(m.emailVerifiedAt)],
    ["Entreprise envoyée", s === "pending" || s === "verified"],
    ["Compte vérifié", s === "verified"],
  ];
  const firstTodo = list.findIndex(([, done]) => !done);
  return `<div class="steps" aria-label="Étapes d'activation">${list
    .map(([label, done], i) => `<div class="step${done ? " done" : ""}${i === firstTodo ? " now" : ""}"><i>${done ? "✓ Fait" : i === firstTodo ? "À faire" : "Ensuite"}</i><b>${label}</b></div>`)
    .join("")}</div>`;
}

export function renderActivation({ merchant: m, errors = {}, values }) {
  const v = values || m;
  const field = (name, label, attrs = "", hint = "") =>
    `<label class="${errors[name] ? "bad" : ""}" for="${name}">${label}${hint ? ` <small>${hint}</small>` : ""}<input id="${name}" name="${name}" value="${esc(v[name])}" ${attrs}>${errors[name] ? `<span class="msg">${esc(errors[name])}</span>` : ""}</label>`;

  const pendingOrDone = (m.verificationStatus === "pending" || m.verificationStatus === "verified") && !values;
  const statusBlock = pendingOrDone
    ? `<section class="card status">
        <span class="pill ${m.verificationStatus}">${m.verificationStatus === "verified" ? "Compte vérifié" : "En cours de vérification"}</span>
        <h2>${m.verificationStatus === "verified" ? "Votre entreprise est vérifiée" : "Nous vérifions votre entreprise"}</h2>
        <p class="sub">${m.verificationStatus === "verified" ? "Générez votre clé de production dans l'onglet Développeurs du tableau de bord, puis passez l'interrupteur sur « Production »." : "Vous recevrez un email à la fin de la vérification. Le mode test reste disponible en attendant."}</p>
        <dl>
          <dt>Raison sociale</dt><dd>${esc(m.legalName)}</dd>
          <dt>Forme juridique</dt><dd>${esc(LEGAL_FORMS[m.legalForm] || m.legalForm || "")}</dd>
          <dt>Secteur</dt><dd>${esc(SECTORS[m.sector] || m.sector || "")}</dd>
          <dt>NINEA</dt><dd>${esc(m.ninea)}</dd>
          <dt>RCCM</dt><dd>${esc(m.rccm || "Non renseigné")}</dd>
          <dt>Représentant</dt><dd>${esc(m.representativeName)}</dd>
          <dt>Versements</dt><dd>${esc(PAYOUT_METHODS[m.payoutMethod] || "")} · ${esc(maskAccount(m.payoutAccount))}</dd>
        </dl>
      </section>`
    : "";

  const form = pendingOrDone
    ? ""
    : `${m.verificationStatus === "rejected" ? `<p class="err" role="alert">Votre demande a été refusée${m.verificationNote ? " : " + esc(m.verificationNote) : "."} Corrigez vos informations et renvoyez-la.</p>` : ""}
    ${Object.keys(errors).length ? '<p class="err" role="alert">Certaines informations sont à corriger.</p>' : ""}
    <form method="post" action="/activation" class="card" novalidate>
      <h2>Votre entreprise</h2>
      <div class="grid">
        ${field("legalName", "Raison sociale", 'required autocomplete="organization" placeholder="Ex. Wax de Dakar SARL"')}
        <label class="${errors.legalForm ? "bad" : ""}" for="legalForm">Forme juridique
          <select id="legalForm" name="legalForm" required><option value="">Choisir…</option>${Object.entries(LEGAL_FORMS)
            .map(([k, l]) => `<option value="${k}"${v.legalForm === k ? " selected" : ""}>${l}</option>`)
            .join("")}</select>${errors.legalForm ? `<span class="msg">${esc(errors.legalForm)}</span>` : ""}</label>
        <label class="${errors.sector ? "bad" : ""}" for="sector">Secteur d'activité
          <select id="sector" name="sector" required><option value="">Choisir…</option>${Object.entries(SECTORS)
            .map(([k, l]) => `<option value="${k}"${v.sector === k ? " selected" : ""}>${l}</option>`)
            .join("")}</select>${errors.sector ? `<span class="msg">${esc(errors.sector)}</span>` : ""}</label>
        ${field("ninea", "NINEA", 'required inputmode="numeric" placeholder="0012345 2G3"', "(Numéro d'identification national)")}
        ${field("rccm", "RCCM", 'placeholder="SN-DKR-2024-B-12345"', "(facultatif)")}
        ${field("representativeName", "Représentant légal", 'required autocomplete="name" placeholder="Prénom et nom"')}
        ${field("city", "Ville", 'required autocomplete="address-level2" placeholder="Dakar"')}
        <div class="full">${field("address", "Adresse de l'entreprise", 'required autocomplete="street-address" placeholder="Rue, quartier"')}</div>
      </div>
      <h2>Où recevoir vos fonds</h2>
      <p class="sub" style="margin-top:-8px">Vos encaissements vous seront versés en FCFA sur ce compte mobile money.</p>
      <div class="radios" role="radiogroup" aria-label="Moyen de versement">
        ${Object.entries(PAYOUT_METHODS)
          .map(([k, l]) => `<label><input type="radio" name="payoutMethod" value="${k}"${v.payoutMethod === k ? " checked" : ""} required>${l}</label>`)
          .join("")}
      </div>
      ${errors.payoutMethod ? `<span class="msg">${esc(errors.payoutMethod)}</span>` : ""}
      ${field("payoutAccount", "Numéro Wave ou Orange Money", 'required inputmode="tel" autocomplete="tel" placeholder="77 123 45 67"')}
      <p class="note">Ces informations servent à vérifier que votre entreprise existe et à vous verser vos fonds. Elles ne sont jamais montrées à vos clients.</p>
      <button class="btn" type="submit">Envoyer pour vérification</button>
    </form>`;

  return `${HEAD("Activer mon compte")}
<main>
  <h1>Activer mon compte</h1>
  <p class="sub">Comme toute plateforme de paiement, nous vérifions chaque entreprise avant de lui verser de l'argent. En attendant, le mode test reste disponible.</p>
  ${steps(m)}
  ${statusBlock}
  ${form}
</main>
</body>
</html>`;
}

export function maskAccount(a) {
  const s = String(a || "");
  return s.length > 6 ? s.slice(0, 4) + " •••• " + s.slice(-4) : s;
}

export function renderAdmin({ pending, notice }) {
  return `${HEAD("Vérifications")}
<main>
  <h1>Vérifications en attente</h1>
  <p class="sub">Comptes qui demandent l'activation des paiements réels. Vérifiez le NINEA (et le RCCM s'il est fourni) avant d'approuver.</p>
  ${notice ? `<p class="note" role="status">${esc(notice)}</p>` : ""}
  ${
    pending.length
      ? pending
          .map(
            (m) => `<section class="card">
      <h2>${esc(m.legalName)} <small style="color:var(--grey);font-weight:500">· ${esc(m.businessName)}</small></h2>
      <dl>
        <dt>Email</dt><dd>${esc(m.email)}${m.emailVerifiedAt ? " ✓" : " (non confirmé)"}</dd>
        <dt>Forme juridique</dt><dd>${esc(LEGAL_FORMS[m.legalForm] || m.legalForm)}</dd>
        <dt>Secteur</dt><dd>${esc(SECTORS[m.sector] || m.sector)}</dd>
        <dt>NINEA</dt><dd>${esc(m.ninea)}</dd>
        <dt>RCCM</dt><dd>${esc(m.rccm || "Non renseigné")}</dd>
        <dt>Représentant</dt><dd>${esc(m.representativeName)}</dd>
        <dt>Adresse</dt><dd>${esc(m.address)}, ${esc(m.city)}</dd>
        <dt>Versements</dt><dd>${esc(PAYOUT_METHODS[m.payoutMethod])} · ${esc(m.payoutAccount)}</dd>
        <dt>Envoyé le</dt><dd>${esc(new Date(m.verificationSubmittedAt).toLocaleString("fr-FR"))}</dd>
      </dl>
      <form method="post" action="/admin/verifications/${esc(m.id)}" style="display:grid;gap:10px">
        <label for="note-${esc(m.id)}">Motif en cas de refus <small>(envoyé au marchand)</small><input id="note-${esc(m.id)}" name="note" placeholder="Ex. le NINEA ne correspond pas à la raison sociale"></label>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn" type="submit" name="decision" value="approve">Approuver</button>
          <button class="btn" type="submit" name="decision" value="reject" style="background:var(--red)">Refuser</button>
        </div>
      </form>
    </section>`,
          )
          .join("")
      : '<section class="card"><h2>Aucune demande en attente</h2><p class="sub">Les nouvelles demandes d\'activation apparaîtront ici.</p></section>'
  }
</main>
</body>
</html>`;
}
