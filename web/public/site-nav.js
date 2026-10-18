// Barre de navigation du site (accueil, documentation) : affichée dans <header id="navShell">, menus déroulants,
// compte connecté et déconnexion. Chargée juste après l'emplacement, elle s'affiche avant le reste de la page.
(function () {
  var shell = document.getElementById("navShell");
  shell.innerHTML = `
  <nav class="pill" aria-label="Navigation principale">
    <a class="logo" href="/" aria-label="YombalPay, accueil">
      <img src="/logo-dark.png" alt="YombalPay" width="120" height="50">
    </a>
    <ul class="links" id="links">
      <li><button type="button" id="solBtn" data-spy="produits" aria-expanded="false" aria-controls="mega">Produits
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></li>
      <li><button type="button" id="devBtn" data-spy="developpeur" aria-expanded="false" aria-controls="devPop">Développeurs
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></li>
      <li><a href="/#tarifs" data-spy="tarifs">Tarifs</a></li>
      <li class="indicator" aria-hidden="true" id="indicator"></li>
    </ul>
    <div class="pill-right">
      <a class="login guest" href="/login">Connexion</a>
      <a class="btn btn-green guest" href="/signup">Commencer →</a>
      <button type="button" class="me-btn" id="meBtn" aria-expanded="false" aria-controls="mePop" hidden>
        <span class="avatar" id="meAvatar" aria-hidden="true">Y</span><span class="me-name" id="meName">Mon compte</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
      <button type="button" class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="sheet">Menu</button>
    </div>

    <div class="pop mega" id="mega" hidden>
      <a class="m" href="/boutique"><span class="m-ic">⚡</span><strong>Démonstration de paiement</strong><span>FCFA, sats et QR Lightning. Essayez-la sur la boutique de démo.</span></a>
      <a class="m" href="/docs#sans-code"><span class="m-ic">₿</span><strong>Encaisser sans site web</strong><span>Créez un QR depuis votre tableau de bord et montrez-le au client.</span></a>
      <a class="m" href="/docs#api"><span class="m-ic">{ }</span><strong>API pour développeurs</strong><span>Votre site crée les paiements automatiquement.</span></a>
    </div>

    <div class="pop dev-pop" id="devPop" hidden>
      <a href="/docs#demarrage"><strong>Démarrage rapide</strong><span>Votre premier paiement test en 5 minutes</span></a>
      <a href="/docs#api"><strong>Référence API</strong><span>Les routes, les champs et l'objet paiement</span></a>
      <a href="/docs#webhooks"><strong>Webhooks</strong><span>Être prévenu quand un paiement est confirmé</span></a>
      <a href="/docs#mode-test"><strong>Mode test</strong><span>Tester sans dépenser un seul sat</span></a>
      <a href="/docs#exemples"><strong>Exemples de code</strong><span>La même requête en cURL, Node.js, Python et PHP</span></a>
      <a href="/docs#erreurs"><strong>Erreurs</strong><span>Les codes de réponse et leur signification</span></a>
      <a class="key-line" href="/docs">Toute la documentation <b>→</b></a>
    </div>

    <div class="pop me-pop" id="mePop" hidden>
      <div class="me-head"><span class="avatar big" id="meAvatar2" aria-hidden="true">Y</span><span><strong id="meName2">Mon compte</strong><small id="meEmail"></small></span></div>
      <span class="me-status"><i class="live"></i>Connecté</span>
      <a href="/app">Tableau de bord</a>
      <a href="/app/paiements">Mes paiements</a>
      <a href="/app/caisse">Encaisser</a>
      <a href="/app/developpeurs">Clés API et webhooks</a>
      <button type="button" id="logoutBtn">Se déconnecter</button>
    </div>

    <div class="pop sheet" id="sheet" hidden>
      <a href="/#produits">Produits</a>
      <a href="/docs">Documentation développeurs</a>
      <a href="/#tarifs">Tarifs</a>
      <a href="/login" class="guest">Connexion</a>
      <a href="/app" class="member" hidden>Mon tableau de bord</a>
      <div class="sheet-foot">
        <span class="made">Disponible au Sénégal</span>
        <a class="btn btn-green guest" href="/signup" style="justify-content:center">Commencer →</a>
      </div>
    </div>
  </nav>
`;

  /* ---------- Navigation ---------- */
  var shell = document.getElementById("navShell");
  var pops = {
    solBtn: document.getElementById("mega"),
    menuBtn: document.getElementById("sheet"),
    devBtn: document.getElementById("devPop"),
    meBtn: document.getElementById("mePop")
  };
  function closeAll(except) {
    Object.keys(pops).forEach(function (id) {
      if (id === except) return;
      pops[id].hidden = true;
      document.getElementById(id).setAttribute("aria-expanded", "false");
    });
  }
  Object.keys(pops).forEach(function (id) {
    var btn = document.getElementById(id);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = pops[id].hidden;
      closeAll(id);
      pops[id].hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });
    pops[id].addEventListener("click", function (e) { if (e.target.closest("a")) closeAll(); else e.stopPropagation(); });
  });
  document.addEventListener("click", function () { closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });
  window.addEventListener("scroll", function () { shell.classList.toggle("scrolled", window.scrollY > 24); }, { passive: true });

  // Indicateur qui glisse sous le lien survolé ; une page peut aussi marquer un lien actif
  // (l'accueil suit la section visible) avec YombalNav.setActive(lien).
  var linksEl = document.getElementById("links"), ind = document.getElementById("indicator");
  var activeEl = null;
  function moveTo(el) {
    if (!el) { ind.style.opacity = 0; return; }
    ind.style.opacity = 1;
    ind.style.left = el.offsetLeft + "px";
    ind.style.width = el.offsetWidth + "px";
  }
  linksEl.querySelectorAll("a, button").forEach(function (el) {
    el.addEventListener("mouseenter", function () { moveTo(el); });
    el.addEventListener("focus", function () { moveTo(el); });
  });
  linksEl.addEventListener("mouseleave", function () { moveTo(activeEl); });
  window.YombalNav = {
    links: linksEl,
    setActive: function (el) { activeEl = el; moveTo(el); }
  };

  /* ---------- Marchand connecté : avatar dans la barre ---------- */
  fetch("/v1/auth/me", { cache: "no-store", credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var me = d && d.merchant;
      if (!me) return;
      me.businessName = me.name;
      var initial = (me.businessName || me.email || "Y").trim().charAt(0).toUpperCase();
      ["meAvatar", "meAvatar2"].forEach(function (id) { document.getElementById(id).textContent = initial; });
      document.getElementById("meName").textContent = me.businessName;
      document.getElementById("meName2").textContent = me.businessName;
      document.getElementById("meEmail").textContent = me.email;
      document.querySelectorAll(".guest").forEach(function (el) { el.hidden = true; });
      document.querySelectorAll(".member").forEach(function (el) { el.hidden = false; });
      document.getElementById("meBtn").hidden = false;
    })
    .catch(function () {});
  document.getElementById("logoutBtn").addEventListener("click", function () {
    fetch("/v1/auth/logout", { method: "POST", credentials: "same-origin", headers: { "X-YombalPay-CSRF": "1" } })
      .finally(function () { location.reload(); });
  });
})();
