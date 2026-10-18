// Documentation : adresse réelle de la passerelle dans les exemples, onglets des langages, sommaire qui suit la lecture.
(function () {
  document.querySelectorAll(".base").forEach(function (el) { el.textContent = location.origin; });

  // Onglets des exemples
  var tabs = document.querySelectorAll(".tabs button");
  tabs.forEach(function (b) {
    b.addEventListener("click", function () {
      tabs.forEach(function (o) { o.setAttribute("aria-selected", String(o === b)); });
      ["curl", "node", "python", "php"].forEach(function (k) { document.getElementById("ex-" + k).hidden = k !== b.dataset.tab; });
    });
  });

  // Sommaire : surligne la section en cours de lecture
  var links = {};
  document.querySelectorAll("aside a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle("on", k === e.target.id); });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    document.querySelectorAll("main section").forEach(function (s) { io.observe(s); });
  }
})();
