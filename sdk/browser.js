/*! YombalPay — bouton « Payer en Bitcoin » à copier-coller.
 *
 * Option 1 — sans code :
 *   <script src="https://VOTRE-PASSERELLE/sdk/yombalpay.js"
 *           data-key="pk_test_…" data-amount="5000" data-reference="CMD-42"></script>
 *
 * Option 2 — JavaScript :
 *   YombalPay.init({ publishableKey: 'pk_test_…' });
 *   YombalPay.createCheckout({ amount: 5000, currency: 'XOF' }).then(c => location.href = c.pay_url);
 */
(function () {
  var script = document.currentScript;
  var base = script ? new URL(script.src).origin : '';
  var state = { key: script && script.dataset.key, baseUrl: base };

  function createCheckout(opts) {
    opts = opts || {};
    if (!state.key) return Promise.reject(new Error('YombalPay : clé publique (pk_…) manquante'));
    return fetch(state.baseUrl + '/v1/checkouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + state.key },
      body: JSON.stringify({
        amount: opts.amount,
        currency: opts.currency || 'XOF',
        reference: opts.reference,
        description: opts.description,
        return_url: opts.returnUrl || location.href,
        source: 'button',
      }),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j.error && j.error.message) || 'Erreur YombalPay');
        return j;
      });
    });
  }

  function renderButton(el, opts) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor"/></svg>' +
      '<span>Payer ' + Number(opts.amount).toLocaleString('fr-FR') + ' FCFA en Bitcoin</span>';
    btn.style.cssText =
      'display:inline-flex;align-items:center;gap:10px;padding:14px 22px;border:0;border-radius:12px;' +
      'background:#F7931A;color:#1a1206;font:600 16px/1 system-ui,-apple-system,sans-serif;cursor:pointer;' +
      'box-shadow:0 6px 18px rgba(247,147,26,.35)';
    btn.onclick = function () {
      btn.disabled = true;
      btn.style.opacity = '.7';
      createCheckout(opts)
        .then(function (c) { location.href = c.pay_url; })
        .catch(function (e) { alert(e.message); btn.disabled = false; btn.style.opacity = '1'; });
    };
    el.appendChild(btn);
    return btn;
  }

  window.YombalPay = {
    init: function (o) { if (o.publishableKey) state.key = o.publishableKey; if (o.baseUrl) state.baseUrl = o.baseUrl; },
    createCheckout: createCheckout,
    button: function (selector, opts) { return renderButton(document.querySelector(selector), opts); },
  };

  if (script && script.dataset.amount) {
    var holder = document.createElement('span');
    script.parentNode.insertBefore(holder, script);
    renderButton(holder, {
      amount: Number(script.dataset.amount),
      reference: script.dataset.reference,
      description: script.dataset.description,
    });
  }
})();
