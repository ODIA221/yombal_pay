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
  --white: #FFFFFF; --mist: #F3F7F4; --line: #E1E8E3;
  --ink: #0A0F0C; --ink-2: #141B17; --ink-3: #1D2620; --grey: #56635B; --grey-light: #97A69D;
  --green: #8F6A00; --green-bright: #E2B341; --green-soft: #FBF3DC; --red: #B42318; --red-soft: #FDECEA;
  --display: "Unbounded", "Arial Black", system-ui, sans-serif;
  --body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--white); color: var(--ink); font: 16px/1.5 var(--body); }
a { color: inherit; }
.logo { display: inline-flex; align-items: center; gap: 10px; font: 800 15px var(--display); letter-spacing: .03em; text-decoration: none; }
.logo i { width: 32px; height: 32px; border-radius: 10px; background: var(--green); color: var(--white); display: grid; place-items: center; font-style: normal; transform: rotate(-8deg); }
.logo b { color: var(--green); }
h1 { margin: 0; font: 700 clamp(24px, 3.4vw, 32px)/1.15 var(--display); text-wrap: balance; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 20px; border-radius: 999px; font: 600 15px var(--body); text-decoration: none; cursor: pointer; border: 1px solid transparent; }
.btn-green { background: var(--green); color: var(--white); }
.btn-green:hover { background: #A67C0A; }
.btn-line { background: var(--white); color: var(--ink); border-color: var(--line); }
:focus-visible { outline: 2px solid var(--green-bright); outline-offset: 3px; }
</style>
</head>
<body>`;

const GOOGLE_G = `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

export function renderAuth({ mode, error, values = {}, googleEnabled = false }) {
  if (mode === "google") return renderGoogleSignup({ error, values });
  const signup = mode === "signup";
  return `${HEAD(signup ? "Créer un compte" : "Connexion")}
<style>
.page { min-height: 100vh; display: grid; grid-template-columns: 1fr 0.9fr; }
.form-side { padding: 28px max(16px, env(safe-area-inset-left)) 40px; display: grid; align-content: start; gap: 40px; }
.form-wrap { width: 100%; max-width: 420px; justify-self: center; display: grid; gap: 22px; }
.sub { color: var(--grey); margin: -8px 0 0; }
form { display: grid; gap: 16px; }
label { display: grid; gap: 6px; font-weight: 600; font-size: 14px; }
label span { color: var(--grey); font-weight: 400; }
input { font: 16px var(--body); padding: 13px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--white); color: var(--ink); width: 100%; }
input:focus { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.err { background: var(--red-soft); color: var(--red); border-radius: 14px; padding: 12px 14px; font-size: 14.5px; }
.switch { color: var(--grey); font-size: 14.5px; }
.switch a { color: var(--green); font-weight: 600; }
.btn-google { background: var(--white); color: var(--ink); border-color: var(--line); gap: 10px; }
.btn-google:hover { border-color: var(--ink); }
.or { display: flex; align-items: center; gap: 12px; color: var(--grey); font-size: 13.5px; margin: -4px 0; }
.or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--line); }
.demo { font-size: 13.5px; color: var(--grey); background: var(--mist); border-radius: 14px; padding: 12px 14px; }
.demo code { font-family: var(--mono); color: var(--ink); }
.brand-side { background: var(--ink); color: var(--white); padding: 48px clamp(24px, 5vw, 64px); display: grid; align-content: center; gap: 22px; position: relative; overflow: hidden; }
.brand-side::after { content: "₿"; position: absolute; right: -30px; bottom: -90px; font: 800 380px/1 var(--display); color: rgba(226,179,65,.07); }
.brand-side h2 { margin: 0; font: 700 clamp(22px, 2.6vw, 30px)/1.2 var(--display); max-width: 18ch; }
.brand-side ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; position: relative; z-index: 1; }
.brand-side li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; color: var(--grey-light); }
.brand-side li b { color: var(--white); display: block; font-weight: 600; }
.brand-side li::before { content: "✓"; width: 22px; height: 22px; border-radius: 50%; background: var(--green); color: var(--white); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
@media (max-width: 860px) { .page { grid-template-columns: 1fr; } .brand-side { display: none; } }
</style>
<div class="page">
  <div class="form-side">
    <a class="logo" href="/"><i>₿</i><span>YOMBAL<b>PAY</b></span></a>
    <div class="form-wrap">
      <h1>${signup ? "Créez votre compte marchand" : "Connectez-vous"}</h1>
      <p class="sub">${signup ? "Gratuit, sans engagement. Vos clés API sont prêtes en quelques secondes." : "Retrouvez vos paiements et vos clés API."}</p>
      ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
      ${
        googleEnabled
          ? `<a class="btn btn-google" href="/auth/google">${GOOGLE_G}Continuer avec Google</a><div class="or"><span>ou avec votre email</span></div>`
          : ""
      }
      <form method="post" action="${signup ? "/inscription" : "/connexion"}">
        ${
          signup
            ? `<label for="businessName">Nom de l'entreprise<input id="businessName" name="businessName" required autocomplete="organization" value="${esc(values.businessName)}" placeholder="Ex. Wax de Dakar"></label>`
            : ""
        }
        <label for="email">Adresse email<input id="email" name="email" type="email" required autocomplete="email" value="${esc(values.email)}"></label>
        ${
          signup
            ? `<label for="phone">Téléphone <span>(facultatif, pour les futurs retraits Wave et Orange Money)</span><input id="phone" name="phone" type="tel" autocomplete="tel" value="${esc(values.phone)}" placeholder="+221 77 000 00 00"></label>`
            : ""
        }
        <label for="password">Mot de passe${signup ? " <span>(8 caractères minimum)</span>" : ""}<input id="password" name="password" type="password" required minlength="${signup ? 8 : 1}" autocomplete="${signup ? "new-password" : "current-password"}"></label>
        <button class="btn btn-green" type="submit">${signup ? "Créer mon compte" : "Se connecter"}</button>
      </form>
      <p class="switch">${signup ? 'Déjà un compte ? <a href="/connexion">Se connecter</a>' : 'Pas encore de compte ? <a href="/inscription">Créer un compte</a>'}</p>
      ${signup ? "" : '<p class="demo">Compte de démonstration : <code>demo@yombalpay.sn</code>, mot de passe <code>DASHBOARD_PASSWORD</code> du fichier .env.</p>'}
    </div>
  </div>
  <aside class="brand-side">
    <h2>Encaissez le monde entier en Bitcoin.</h2>
    <ul>
      <li><span><b>Prix en FCFA</b>Vos clients paient en sats, depuis n'importe quel pays.</span></li>
      <li><span><b>Mode test gratuit</b>Testez tout sans dépenser un seul sat.</span></li>
      <li><span><b>Webhooks signés</b>Votre site est prévenu à chaque paiement confirmé.</span></li>
    </ul>
  </aside>
</div>
</body>
</html>`;
}

// Affichée une seule fois : après l'inscription ou après la création d'une nouvelle clé.
export function renderKeyReveal({ merchant, apiKey, title, intro, emailSentTo, googleEmail, live = false }) {
  return `${HEAD(title)}
<style>
main { max-width: 620px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); display: grid; gap: 22px; }
.ok { width: 64px; height: 64px; border-radius: 50%; background: var(--green); color: var(--white); display: grid; place-items: center; }
p { margin: 0; color: var(--grey); }
.box { border: 1px solid var(--line); border-radius: 20px; padding: 18px; display: grid; gap: 10px; background: var(--mist); }
.box strong { font-size: 15px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
code { flex: 1 1 260px; min-width: 0; font: 500 14px var(--mono); background: var(--white); border: 1px solid var(--line); padding: 12px 14px; border-radius: 12px; overflow-wrap: anywhere; }
.copy { background: var(--ink); color: var(--white); border: 0; border-radius: 12px; padding: 12px 16px; font: 600 14px var(--body); cursor: pointer; }
.mail { background: var(--green-soft); color: var(--ink); border-radius: 14px; padding: 12px 14px; font-size: 14.5px; }
.warn { background: #FFF4D6; color: #7A5300; border-radius: 14px; padding: 12px 14px; font-size: 14.5px; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
</style>
<main>
  <a class="logo" href="/"><i>₿</i><span>YOMBAL<b>PAY</b></span></a>
  <div class="ok" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
  <h1>${esc(title)}</h1>
  <p>${esc(intro)}</p>
  ${googleEmail ? `<p class="mail">Votre adresse <b>${esc(googleEmail)}</b> est vérifiée par Google : pas besoin de confirmation. Un email de bienvenue vient de vous être envoyé.</p>` : ""}
  ${emailSentTo ? `<p class="mail">Un email de confirmation vient d'être envoyé à <b>${esc(emailSentTo)}</b>. Cliquez sur le lien qu'il contient pour pouvoir créer des paiements.</p>` : ""}
  <div class="box">
    <strong>${live ? "Votre clé de production (paiements réels)" : "Votre clé API secrète (mode test)"}</strong>
    <div class="row"><code id="k1">${esc(apiKey)}</code><button class="copy" type="button" data-target="k1">Copier</button></div>
  </div>
  <p class="warn">Copiez cette clé maintenant : pour votre sécurité, elle ne sera plus jamais affichée. Gardez-la sur votre serveur, jamais dans votre site web.</p>
  <div class="box">
    <strong>Secret de vos webhooks</strong>
    <p>Il sert à vérifier l'en-tête <code style="display:inline;padding:2px 6px;border:0">Yombal-Signature</code> des notifications. Vous le retrouvez à tout moment dans votre tableau de bord.</p>
    <div class="row"><code id="k2">${esc(merchant.webhookSecret)}</code><button class="copy" type="button" data-target="k2">Copier</button></div>
  </div>
  <div class="actions"><a class="btn btn-green" href="/dashboard">Aller au tableau de bord</a><a class="btn btn-line" href="/#developpeur">Voir l'exemple d'intégration</a></div>
</main>
<script>
document.querySelectorAll(".copy").forEach(function (b) {
  b.addEventListener("click", function () {
    var el = document.getElementById(b.dataset.target);
    function done(m) { b.textContent = m; setTimeout(function () { b.textContent = "Copier"; }, 1600); }
    function select() { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done("Sélectionné"); }
    try { navigator.clipboard.writeText(el.textContent).then(function () { done("Copié"); }, select); } catch (e) { select(); }
  });
});
</script>
</body>
</html>`;
}

// Après la connexion Google d'un nouvel utilisateur : il ne reste qu'à nommer son entreprise.
function renderGoogleSignup({ error, values = {} }) {
  return `${HEAD("Finaliser votre compte")}
<style>
main { max-width: 440px; margin: 0 auto; padding: 32px max(16px, env(safe-area-inset-right)) 48px max(16px, env(safe-area-inset-left)); display: grid; gap: 20px; }
p { margin: 0; color: var(--grey); }
.who { display: flex; align-items: center; gap: 10px; background: var(--mist); border-radius: 14px; padding: 12px 14px; font-size: 14.5px; }
.who b { color: var(--ink); overflow-wrap: anywhere; }
form { display: grid; gap: 16px; }
label { display: grid; gap: 6px; font-weight: 600; font-size: 14px; }
label span { color: var(--grey); font-weight: 400; }
input { font: 16px var(--body); padding: 13px 14px; border: 1px solid var(--line); border-radius: 14px; width: 100%; }
input:focus { outline: none; border-color: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.err { background: var(--red-soft); color: var(--red); border-radius: 14px; padding: 12px 14px; font-size: 14.5px; }
</style>
<main>
  <a class="logo" href="/"><i>₿</i><span>YOMBAL<b>PAY</b></span></a>
  <h1>Encore une étape</h1>
  <div class="who">${GOOGLE_G}<span>Connecté avec Google : <b>${esc(values.email)}</b></span></div>
  ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
  <form method="post" action="/inscription/google">
    <label for="businessName">Nom de l'entreprise<input id="businessName" name="businessName" required autocomplete="organization" value="${esc(values.businessName)}" placeholder="Ex. Wax de Dakar"></label>
    <label for="phone">Téléphone <span>(facultatif)</span><input id="phone" name="phone" type="tel" autocomplete="tel" value="${esc(values.phone)}" placeholder="+221 77 000 00 00"></label>
    <button class="btn btn-green" type="submit">Créer mon compte</button>
  </form>
  <p style="font-size:14px"><a href="/connexion">Annuler</a></p>
</main>
</body>
</html>`;
}
