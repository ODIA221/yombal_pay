import { Code } from '../components/ui.jsx';

const origin = typeof window !== 'undefined' ? window.location.origin : 'https://votre-passerelle';

export default function Docs() {
  return (
    <div className="page docs">
      <p className="eyebrow">Documentation</p>
      <h1>Accepter Bitcoin en 5 minutes</h1>
      <p className="lead">Trois façons d'intégrer YombalPay, de la plus simple à la plus complète. Tous les montants sont en FCFA.</p>

      <h2>
        <span className="num">A</span> Bouton à copier-coller
      </h2>
      <p>Aucun backend requis : collez cette balise là où le bouton doit apparaître. La clé publique ne peut que créer des paiements.</p>
      <Code lang="html">{`<script src="${origin}/sdk/yombalpay.js"
        data-key="pk_test_waxco_demo_2026"
        data-amount="5000"
        data-reference="CMD-42"></script>`}</Code>

      <h2>
        <span className="num">B</span> SDK Node.js
      </h2>
      <Code lang="node.js">{`import YombalPay from 'yombalpay';

const tp = new YombalPay({
  apiKey: process.env.YOMBALPAY_SECRET_KEY,   // sk_… — jamais dans le navigateur
  baseUrl: '${origin}',
});

app.post('/commander', async (req, res) => {
  const checkout = await tp.createCheckout({
    amount: 5000,                 // FCFA
    currency: 'XOF',
    reference: 'CMD-42',          // idempotent : même référence = même paiement
    returnUrl: 'https://maboutique.sn/merci',
  });
  res.redirect(checkout.pay_url); // page hébergée avec QR Lightning
});`}</Code>

      <h2>
        <span className="num">C</span> API REST
      </h2>
      <Code lang="bash">{`curl -X POST ${origin}/v1/checkouts \\
  -H "Authorization: Bearer sk_test_waxco_demo_2026" \\
  -H "Content-Type: application/json" \\
  -d '{ "amount": 5000, "currency": "XOF", "reference": "CMD-42",
        "return_url": "https://maboutique.sn/merci" }'`}</Code>

      <div className="table-wrap">
        <table className="routes">
          <thead>
            <tr>
              <th>Méthode</th>
              <th>Route</th>
              <th>Rôle</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['POST', '/v1/checkouts', 'Créer un paiement (montant FCFA, référence idempotente, URL de retour, URL de webhook) — clé sk_ ou pk_'],
              ['GET', '/v1/checkouts', 'Lister vos paiements + statistiques — clé sk_'],
              ['GET', '/v1/checkouts/:id', "Lire le statut d'un paiement"],
              ['GET', '/v1/checkouts/:id/stream', 'Statut en temps réel (Server-Sent Events)'],
              ['POST', '/v1/payment-links', 'Créer un lien de paiement partageable — clé sk_'],
              ['GET', '/v1/overview', 'Solde (BTC, USDT, total FCFA), statistiques, derniers paiements — clé sk_'],
              ['GET', '/v1/ledger', 'Registre comptable : paiements, commissions, conversions, retraits — clé sk_'],
              ['GET', '/v1/rates', 'Taux BTC → FCFA et sa source'],
              ['GET', '/.well-known/lnurlp/:identifiant', 'Adresse Lightning du marchand (LUD-16 / LNURL-pay)'],
              ['GET', '/@:identifiant', 'Page de paiement publique à montant libre'],
              ['GET', '/pay/:id', 'Page de paiement hébergée avec QR Lightning'],
              ['POST', '/webhooks/bitnob', 'Réception des événements Bitnob (paiements et retraits)'],
            ].map(([m, r, d]) => (
              <tr key={r}>
                <td>
                  <span className={`method ${m.toLowerCase()}`}>{m}</span>
                </td>
                <td className="mono">{r}</td>
                <td>{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Recevoir la confirmation</h2>
      <p>
        À chaque paiement confirmé, YombalPay envoie <code>checkout.paid</code> à votre URL de webhook, signé avec votre
        secret (<code>X-YombalPay-Signature: t=…,v1=…</code>, HMAC-SHA256). Les envois échoués sont retentés
        automatiquement (2 s, 5 s, 15 s, 30 s, 60 s).
      </p>
      <Code lang="node.js">{`app.post('/webhooks/yombalpay', express.raw({ type: '*/*' }), (req, res) => {
  const event = YombalPay.verifyWebhook(
    req.body, req.get('X-YombalPay-Signature'), process.env.YOMBALPAY_WEBHOOK_SECRET,
  );
  if (event.type === 'checkout.paid') {
    marquerCommandePayee(event.data.reference);   // idempotent de votre côté aussi
  }
  res.sendStatus(200);
});`}</Code>

      <h2>Sécurité</h2>
      <ul className="bullets">
        <li>Les clés Bitnob ne quittent jamais la passerelle ; votre site ne parle qu'à YombalPay.</li>
        <li>Le statut « Payé » vient toujours du serveur (webhook Bitnob vérifié + reconfirmation via l'API Bitnob), jamais du navigateur.</li>
        <li>Idempotence de bout en bout : référence de commande, référence Bitnob, identifiant d'événement, écritures comptables uniques par paiement.</li>
        <li>Clés secrètes stockées hachées (SHA-256) et révocables ; retraits et conversions réservés au tableau de bord connecté, retraits confirmés par mot de passe.</li>
        <li>Soldes calculés depuis un registre PostgreSQL en ajout seul ; chaque débit se fait sous verrou par marchand (pas de double dépense).</li>
        <li>Requêtes Bitnob signées HMAC-SHA256 avec horodatage et nonce (anti-rejeu).</li>
      </ul>
    </div>
  );
}
