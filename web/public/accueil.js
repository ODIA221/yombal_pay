// Page d'accueil : navigation, carte 3D du Sénégal, démonstration du parcours, expérience développeur.
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  // Indicateur qui glisse sous le lien survolé ou la section visible
  var linksEl = document.getElementById("links"), ind = document.getElementById("indicator");
  var spyLinks = Array.prototype.slice.call(linksEl.querySelectorAll("[data-spy]"));
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
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        spyLinks.forEach(function (l) { l.classList.toggle("on", l.dataset.spy === en.target.id); });
        activeEl = spyLinks.filter(function (l) { return l.dataset.spy === en.target.id; })[0] || null;
        moveTo(activeEl);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["produits", "developpeur", "tarifs", "lancement"].forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    document.querySelectorAll(".hero, #parcours, #securite, #pourquoi, #partenaires, #contact").forEach(function (s) {
      new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { spyLinks.forEach(function (l) { l.classList.remove("on"); }); activeEl = null; moveTo(null); } }); }, { rootMargin: "-45% 0px -50% 0px" }).observe(s);
    });
  }

  /* ---------- Retour sur la page : même endroit qu'au départ ---------- */
  // Le navigateur remonte parfois en haut (3D, polices, page rechargée). On mémorise la position
  // pour cet onglet et on la rétablit au retour, sauf si l'adresse vise une section (#…).
  var SCROLL_KEY = "yp_home_scroll";
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) {}
  function saveScroll() { try { sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY))); } catch (e) {} }
  var saveTimer = null;
  window.addEventListener("scroll", function () { clearTimeout(saveTimer); saveTimer = setTimeout(saveScroll, 150); }, { passive: true });
  window.addEventListener("pagehide", saveScroll);
  function restoreScroll() {
    if (location.hash) return;
    var y = 0;
    try { y = +sessionStorage.getItem(SCROLL_KEY) || 0; } catch (e) {}
    if (y > 0) window.scrollTo({ top: y, behavior: "instant" });
  }
  restoreScroll();
  window.addEventListener("load", restoreScroll);
  window.addEventListener("pageshow", function (e) { if (e.persisted) restoreScroll(); });

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

  /* ---------- Carte 3D du Sénégal ---------- */
  var SN = [[-16.71,13.59],[-17.13,14.37],[-17.63,14.73],[-17.19,14.92],[-16.70,15.62],[-16.46,16.14],[-16.12,16.46],[-15.62,16.37],[-15.14,16.59],[-14.58,16.60],[-14.10,16.30],[-13.44,16.04],[-12.83,15.30],[-12.17,14.62],[-12.12,13.99],[-11.93,13.42],[-11.55,13.14],[-11.47,12.75],[-11.51,12.44],[-11.66,12.39],[-12.20,12.47],[-12.28,12.35],[-12.50,12.33],[-13.22,12.58],[-13.70,12.59],[-15.55,12.63],[-15.82,12.52],[-16.15,12.55],[-16.68,12.38],[-16.84,13.15],[-15.93,13.13],[-15.69,13.27],[-15.51,13.28],[-15.14,13.51],[-14.71,13.30],[-14.28,13.28],[-13.84,13.51],[-14.05,13.79],[-14.38,13.63],[-14.69,13.63],[-15.08,13.88],[-15.40,13.86],[-15.62,13.62],[-16.71,13.59]];
  var CITIES = [
    { n: "Dakar", lon: -17.44, lat: 14.69, main: true },
    { n: "Saint-Louis", lon: -16.49, lat: 16.03 },
    { n: "Touba", lon: -15.88, lat: 14.85, hide: true },
    { n: "Tambacounda", lon: -13.67, lat: 13.77, hide: true },
    { n: "Ziguinchor", lon: -16.27, lat: 12.58 }
  ];
  var CX = -14.5, CY = 14.45, S = 0.74;
  function px(lon) { return (lon - CX) * S; }
  function py(lat) { return (lat - CY) * S; }

  function svgFallback() {
    var d = SN.map(function (p, i) { return (i ? "L" : "M") + (px(p[0]) * 40 + 200).toFixed(1) + " " + (200 - py(p[1]) * 40).toFixed(1); }).join(" ") + "Z";
    var dk = CITIES[0];
    document.getElementById("fallback").innerHTML =
      '<svg viewBox="0 0 400 400"><path d="' + d + '" fill="#E8830F" stroke="#0A0F0C" stroke-width="2"/>' +
      '<circle cx="' + (px(dk.lon) * 40 + 200) + '" cy="' + (200 - py(dk.lat) * 40) + '" r="8" fill="#0A0F0C" stroke="#fff" stroke-width="3"/></svg>';
  }

  function coinTexture(draw) {
    var c = document.createElement("canvas"); c.width = c.height = 512;
    var g = c.getContext("2d");
    var grd = g.createRadialGradient(190, 170, 20, 256, 256, 280);
    grd.addColorStop(0, "#3A443E"); grd.addColorStop(0.5, "#141B17"); grd.addColorStop(1, "#000");
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "#F7931A"; g.lineWidth = 8;
    g.beginPath(); g.arc(256, 256, 228, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.globalAlpha = .6;
    for (var i = 0; i < 72; i++) {
      var a = i / 72 * Math.PI * 2;
      g.beginPath(); g.moveTo(256 + Math.cos(a) * 200, 256 + Math.sin(a) * 200); g.lineTo(256 + Math.cos(a) * 214, 256 + Math.sin(a) * 214); g.stroke();
    }
    g.globalAlpha = 1;
    draw(g);
    var t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  function initMap() {
    var canvas = document.getElementById("map3d");
    if (!window.THREE) { svgFallback(); return; }
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); }
    catch (e) { svgFallback(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 1.2, 12.5);
    camera.lookAt(0, 0.4, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(-4, 8, 6); scene.add(key);
    var fill = new THREE.DirectionalLight(0xFBF3DC, 0.35); fill.position.set(5, -2, 4); scene.add(fill);

    var world = new THREE.Group(); scene.add(world);
    var map = new THREE.Group();
    map.rotation.x = -0.88;
    map.position.y = -0.9;
    world.add(map);

    // Socle en points
    var gp = [];
    for (var gx = -7; gx <= 7; gx += 0.45) for (var gy = -5; gy <= 5; gy += 0.45) gp.push(gx, gy, -0.02);
    var gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
    map.add(new THREE.Points(gridGeo, new THREE.PointsMaterial({ color: 0xB9C7BE, size: 0.045 })));

    // Sénégal extrudé
    var shape = new THREE.Shape();
    SN.forEach(function (p, i) { if (i) shape.lineTo(px(p[0]), py(p[1])); else shape.moveTo(px(p[0]), py(p[1])); });
    var geo = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
    var land = new THREE.Mesh(geo, [
      new THREE.MeshStandardMaterial({ color: 0xE8830F, roughness: 0.5, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0x0A0F0C, roughness: 0.6 })
    ]);
    map.add(land);
    var edgePts = SN.map(function (p) { return new THREE.Vector3(px(p[0]), py(p[1]), 0.37); });
    map.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(edgePts), new THREE.LineBasicMaterial({ color: 0xF7931A })));

    // Villes
    var TOP = 0.38;
    var cityPos = CITIES.map(function (c) { return new THREE.Vector3(px(c.lon), py(c.lat), TOP); });
    cityPos.forEach(function (v, i) {
      var pin = new THREE.Mesh(new THREE.CylinderGeometry(i ? 0.05 : 0.08, i ? 0.05 : 0.08, i ? 0.25 : 0.5, 16),
        new THREE.MeshStandardMaterial({ color: i ? 0xffffff : 0x0A0F0C }));
      pin.rotation.x = Math.PI / 2;
      pin.position.copy(v); pin.position.z += i ? 0.12 : 0.25;
      map.add(pin);
    });
    var dakar = cityPos[0];
    var pulses = [0, 1, 2].map(function (k) {
      var r = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.2, 48), new THREE.MeshBasicMaterial({ color: 0xC9971C, transparent: true, side: THREE.DoubleSide }));
      r.position.copy(dakar); r.position.z += 0.01; r.userData.off = k / 3; map.add(r); return r;
    });

    // Paiements entrants depuis la diaspora
    var ORIGINS = [
      { n: "Paris", p: new THREE.Vector3(-2.3, 4.3, 0.4) },
      { n: "Milan", p: new THREE.Vector3(2.2, 4.0, 0.4) },
      { n: "New York", p: new THREE.Vector3(-4.4, 2.2, 0.4) }
    ];
    var arcs = ORIGINS.map(function (o, i) {
      var mid = o.p.clone().add(dakar).multiplyScalar(0.5); mid.z = 3.2;
      var curve = new THREE.QuadraticBezierCurve3(o.p, mid, dakar.clone().setZ(TOP + 0.5));
      var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(60)),
        new THREE.LineDashedMaterial({ color: 0x0A0F0C, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.5 }));
      line.computeLineDistances(); map.add(line);
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 16), new THREE.MeshBasicMaterial({ color: 0xF7931A }));
      map.add(dot);
      var src = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), new THREE.MeshBasicMaterial({ color: 0x56635B }));
      src.position.copy(o.p); map.add(src);
      return { curve: curve, dot: dot, off: i * 0.33 };
    });

    // Pièce Bitcoin au-dessus de Dakar
    var face = coinTexture(function (g) {
      g.fillStyle = "#F7931A"; g.font = "800 250px Unbounded, Arial Black, sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₿", 262, 272);
    });
    var back = coinTexture(function (g) {
      g.fillStyle = "#F7931A"; g.beginPath();
      g.moveTo(290, 92); g.lineTo(165, 282); g.lineTo(245, 282); g.lineTo(215, 420); g.lineTo(350, 222); g.lineTo(268, 222); g.closePath(); g.fill();
    });
    var coin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.16, 96), [
      new THREE.MeshStandardMaterial({ color: 0xF7931A, metalness: 0.7, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ map: face, metalness: 0.5, roughness: 0.35 }),
      new THREE.MeshStandardMaterial({ map: back, metalness: 0.5, roughness: 0.35 })
    ]);
    coin.rotation.x = Math.PI / 2;
    var coinG = new THREE.Group(); coinG.add(coin); world.add(coinG);
    var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 8), new THREE.MeshBasicMaterial({ color: 0x0A0F0C, transparent: true, opacity: 0.35 }));
    

    // Étiquettes HTML
    var labelsEl = document.getElementById("labels");
    var labelItems = CITIES.filter(function (c) { return !c.hide; }).map(function (c) {
      var i = CITIES.indexOf(c);
      var el = document.createElement("span");
      el.className = "lbl" + (c.main ? " main" : "");
      el.innerHTML = c.main ? "Dakar <i>· disponible</i>" : c.n;
      labelsEl.appendChild(el);
      var v = cityPos[i].clone(); v.z += c.main ? 0.55 : 0.3;
      return { el: el, v: v };
    }).concat(ORIGINS.map(function (o) {
      var el = document.createElement("span"); el.className = "lbl far"; el.textContent = o.n; labelsEl.appendChild(el);
      return { el: el, v: o.p.clone() };
    }));

    var mx = 0, my = 0;
    window.addEventListener("pointermove", function (e) { mx = (e.clientX / window.innerWidth - 0.5) * 2; my = (e.clientY / window.innerHeight - 0.5) * 2; }, { passive: true });

    var W = 0, H = 0;
    function resize() {
      W = canvas.clientWidth; H = canvas.clientHeight;
      if (!W || !H) return;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.position.z = W < 480 ? 15.5 : 13.5;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize); resize();

    var tmp = new THREE.Vector3(), dkWorld = new THREE.Vector3();
    var t0 = performance.now();
    function frame(now) {
      var t = reduce ? 2.4 : (now - t0) / 1000;
      world.rotation.y += ((mx * 0.18 - 0.08) - world.rotation.y) * 0.05;
      world.rotation.x += ((my * 0.06) - world.rotation.x) * 0.05;
      world.updateMatrixWorld(true);

      dkWorld.copy(dakar); map.localToWorld(dkWorld);
      var cx = dkWorld.x + 1.5, cy = dkWorld.y + 2.6 + Math.sin(t * 1.3) * 0.12;
      world.worldToLocal(tmp.set(cx, cy, dkWorld.z));
      coinG.position.copy(tmp);
      coinG.rotation.y = reduce ? 0.6 : t * 0.9;
      var base = dkWorld.clone(); world.worldToLocal(base);
      beam.position.set((tmp.x + base.x) / 2, (tmp.y - 0.95 + base.y) / 2, (tmp.z + base.z) / 2);
      beam.scale.y = Math.max(0.01, (tmp.y - 0.95) - base.y);

      pulses.forEach(function (r) {
        var k = ((t * 0.6) + r.userData.off) % 1;
        r.scale.setScalar(1 + k * 5); r.material.opacity = 0.55 * (1 - k);
      });
      arcs.forEach(function (a) {
        var k = ((t * 0.28) + a.off) % 1;
        a.dot.position.copy(a.curve.getPoint(k));
        a.dot.scale.setScalar(k > 0.92 ? 1 + (k - 0.92) * 10 : 1);
      });

      renderer.render(scene, camera);
      labelItems.forEach(function (li) {
        tmp.copy(li.v); map.localToWorld(tmp); tmp.project(camera);
        var x = (tmp.x + 1) / 2 * W, y = (1 - tmp.y) / 2 * H;
        var inside = x > 30 && x < W - 30 && y > 20 && y < H;
        li.el.style.left = x + "px"; li.el.style.top = y + "px"; li.el.style.opacity = inside ? 1 : 0;
      });
      if (!reduce) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    if (reduce) window.addEventListener("resize", function () { requestAnimationFrame(frame); });
  }
  if (document.fonts && document.fonts.load) document.fonts.load("800 40px Unbounded").then(initMap, initMap);
  else initMap();

  /* ---------- Cartes inclinées en 3D ---------- */
  if (!reduce) document.querySelectorAll(".tilt").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = "perspective(800px) rotateX(" + (-y * 8) + "deg) rotateY(" + (x * 10) + "deg) translateY(-4px)";
    });
    el.addEventListener("pointerleave", function () { el.style.transform = ""; });
  });

  /* ---------- Parcours animé d'un paiement ---------- */
  var RATE = 60000000;
  var nf = new Intl.NumberFormat("fr-FR");
  var STEP_MS = 3600;
  var flow = document.getElementById("flow"), stage = document.getElementById("stage");
  var items = flow.querySelectorAll(".flow-steps li");
  var step = 1, timer = null, playing = !reduce;
  flow.style.setProperty("--step-ms", STEP_MS + "ms");

  function satsFor(xof) { return Math.ceil(xof / RATE * 1e8); }
  function showRate() {
    var sats = nf.format(satsFor(5000)) + " sats";
    document.getElementById("fSats").textContent = sats;
    document.getElementById("fSats2").textContent = sats;
    document.getElementById("fRate").textContent = "1 BTC = " + nf.format(RATE) + " FCFA · prix figé 15 min";
    document.querySelectorAll(".rate-sats").forEach(function (el) { el.textContent = nf.format(satsFor(1000)); });
  }

  // QR décoratif du téléphone (motif fixe, ce n'est pas une vraie facture)
  (function drawQr() {
    var svg = document.getElementById("fQr"), s = 7, out = "";
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var y = 0; y < 21; y++) for (var x = 0; x < 21; x++) {
      var finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      if (!finder && rnd() > 0.5) out += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="#0A0F0C"/>';
    }
    [[0, 0], [14, 0], [0, 14]].forEach(function (p) {
      out += '<rect x="' + p[0] + '" y="' + p[1] + '" width="7" height="7" fill="#0A0F0C"/><rect x="' + (p[0] + 1) + '" y="' + (p[1] + 1) + '" width="5" height="5" fill="#fff"/><rect x="' + (p[0] + 2) + '" y="' + (p[1] + 2) + '" width="3" height="3" fill="#E8830F"/>';
    });
    svg.innerHTML = out;
  })();

  // Effet de saisie du prix, puis compteur du total
  function typeAmount() {
    var el = document.getElementById("fType"), full = "5 000", i = 0;
    el.textContent = "";
    (function next() { if (i <= full.length) { el.textContent = full.slice(0, i++); setTimeout(next, 160); } })();
  }
  function countTotal(from, to) {
    var el = document.getElementById("fTotal"), t0 = performance.now();
    (function frame(now) {
      var k = Math.min(1, (now - t0) / 900);
      el.textContent = nf.format(Math.round(from + (to - from) * k)) + " FCFA";
      if (k < 1) requestAnimationFrame(frame);
    })(t0);
  }

  function go(n) {
    step = n;
    var cls = "flow-stage";
    for (var i = 1; i <= n; i++) cls += " s" + i;
    stage.className = cls;
    items.forEach(function (li, i) {
      li.classList.toggle("on", i + 1 === n);
      li.classList.toggle("done", i + 1 < n);
      var bar = li.querySelector(".fs-bar"); bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = "";
    });
    if (n === 1) { typeAmount(); document.getElementById("fTotal").textContent = "25 000 FCFA"; }
    if (n === 5) countTotal(25000, 30000);
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (playing) timer = setTimeout(function () { go(step === 5 ? 1 : step + 1); }, step === 5 ? STEP_MS + 1600 : STEP_MS);
  }
  items.forEach(function (li) {
    li.querySelector("button").addEventListener("click", function () { go(+this.dataset.go); });
  });
  function setPlaying(p) {
    playing = p;
    flow.classList.toggle("paused", !p);
    schedule();
  }

  // L'animation ne tourne que lorsque la section est visible
  if ("IntersectionObserver" in window && !reduce) {
    var started = false;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting && !started) { started = true; go(1); }
        else if (!e.isIntersecting && started) { clearTimeout(timer); }
        else if (e.isIntersecting && started && playing) { schedule(); }
      });
    }, { threshold: 0.25 }).observe(flow);
  } else {
    setPlaying(false);
    go(5);
  }
  showRate();

  // Servie par YombalPay, la page prend le cours réel.
  fetch("/v1/rates").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.xof_per_btc) return;
    RATE = d.xof_per_btc;
    showRate();
  }).catch(function () {});


  /* ---------- Expérience développeur : étapes et onglets ---------- */
  var FILES = { keys: "Tableau de bord · Clés API", create: "checkout.js", hook: "POST /hooks/yombalpay" };
  var EXT = { node: "checkout.js", python: "checkout.py", php: "checkout.php", curl: "terminal" };
  var steps = Array.prototype.slice.call(document.querySelectorAll(".dx-step")), step = "keys";
  var tabs = document.querySelectorAll(".tabs button"), current = "node";
  var dxFile = document.getElementById("dxFile");
  function setStep(k, focus) {
    step = k;
    steps.forEach(function (b) {
      var on = b.dataset.step === k;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      document.getElementById(b.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) b.focus();
    });
    dxFile.textContent = k === "create" ? EXT[current] : FILES[k];
  }
  steps.forEach(function (b, i) {
    b.addEventListener("click", function () { setStep(b.dataset.step); });
    b.addEventListener("keydown", function (e) {
      var d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      setStep(steps[(i + d + steps.length) % steps.length].dataset.step, true);
    });
  });
  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      current = b.dataset.tab;
      tabs.forEach(function (o) { o.setAttribute("aria-selected", String(o === b)); });
      ["node", "python", "php", "curl"].forEach(function (k) { document.getElementById("code-" + k).hidden = k !== current; });
      dxFile.textContent = EXT[current];
    });
  });
  var KEYS = { test: "sk_test_tp_9Xk2mR7vDakar2026", live: "sk_live_•••••••••••••••••2026" };
  var mTest = document.getElementById("mTest"), mLive = document.getElementById("mLive");
  function setMode(m) {
    mTest.setAttribute("aria-pressed", String(m === "test"));
    mLive.setAttribute("aria-pressed", String(m === "live"));
    document.getElementById("keyShown").textContent = KEYS[m];
    document.querySelectorAll(".key-slot").forEach(function (el) { el.textContent = KEYS[m]; });
    document.getElementById("keyNote").textContent = m === "test"
      ? "Mode test : les paiements sont simulés, aucun vrai sats n'est débité."
      : "Mode production : les paiements sont réels. Gardez cette clé sur votre serveur.";
  }
  mTest.addEventListener("click", function () { setMode("test"); });
  mLive.addEventListener("click", function () { setMode("live"); });

  var copyBtn = document.getElementById("copyBtn");
  copyBtn.addEventListener("click", function () {
    var pre = document.getElementById("code-" + (step === "create" ? current : step === "keys" ? "env" : "hook")), text = pre.textContent;
    function done(msg) { copyBtn.textContent = msg; setTimeout(function () { copyBtn.textContent = "Copier"; }, 1600); }
    function select() { var r = document.createRange(); r.selectNodeContents(pre); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); done("Sélectionné"); }
    try { navigator.clipboard.writeText(text).then(function () { done("Copié"); }, select); } catch (e) { select(); }
  });
})();
