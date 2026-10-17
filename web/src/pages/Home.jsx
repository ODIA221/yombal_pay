import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fcfa, num } from '../lib/format.js';
import { Bolt, Code, Icon } from '../components/ui.jsx';

export default function Home() {
  const { merchant } = useAuth();
  const [rate, setRate] = useState(null);
  const [amount, setAmount] = useState(25000);

  useEffect(() => {
    api('/v1/rates').then(setRate).catch(() => {});
  }, []);

  const satsFor = rate ? Math.ceil((Number(amount) / rate.xof_per_btc) * 1e8) : 0;
  const cta = merchant ? (
    <Link className="btn primary lg" to="/app">
      Ouvrir mon espace <Icon name="external" size={18} />
    </Link>
  ) : (
    <Link className="btn primary lg" to="/signup">
      Créer mon compte gratuit
    </Link>
  );

  return (
    <div className="home">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Bitcoin Lightning × mobile money · Propulsé par Bitnob</p>
          <h1>
            Encaissez du <span className="hl-fcfa">monde entier</span>.
            <br />
            Recevez sur Wave.
          </h1>
          <p className="lead">
            YombalPay est la caisse Bitcoin des commerçants d'Afrique de l'Ouest. Vos prix restent en FCFA, la diaspora paie en Lightning
            depuis Paris ou Montréal, vous protégez vos gains en USDT et retirez sur Wave ou Orange Money. Sans jamais toucher à la crypto.
          </p>
          <div className="cta">
            {cta}
            <Link className="btn ghost lg" to="/login">
              Voir la démo
            </Link>
          </div>
          <p className="hero-proof">
            <Icon name="shield" size={16} /> Webhooks signés et reconfirmés · registre comptable PostgreSQL · retraits confirmés par mot de passe
          </p>
        </div>

        <div className="converter">
          <p className="eyebrow">Ce que paie votre client</p>
          <label className="conv-input">
            <input type="number" min="100" step="100" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Montant en FCFA" />
            <span>FCFA</span>
          </label>
          <div className="conv-arrow">↓</div>
          <div className="conv-out">
            <Bolt size={22} />
            <span>{num(satsFor)}</span>
            <small>sats</small>
          </div>
          {rate && (
            <p className="conv-src">
              1 BTC = {fcfa(rate.xof_per_btc)}
              <br />
              <span className="muted">{rate.source}</span>
            </p>
          )}
        </div>
      </section>

      <section className="flow" aria-label="Le parcours de l'argent">
        {[
          ['globe', 'Le client paie', "En Lightning, depuis n'importe quel pays et n'importe quel portefeuille. 2 secondes, quelques sats de frais."],
          ['wallet', 'Le solde est crédité', 'Webhook Bitnob vérifié, reconfirmé, inscrit au registre. La caisse sonne.'],
          ['shield', 'La valeur est protégée', 'Conversion automatique en USDT via le trading Bitnob : fini la volatilité.'],
          ['out', 'Retrait mobile money', 'Wave, Orange Money ou Free Money via les payouts Bitnob, en un geste.'],
        ].map(([icon, title, text], i) => (
          <div key={title} className="flow-step">
            <span className="flow-icon">
              <Icon name={icon} />
            </span>
            <span className="flow-num">0{i + 1}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </section>

      <section className="pillars">
        <h2>Un outil pour chaque façon de vendre</h2>
        <div className="pillar-grid">
          <Pillar icon="pos" title="Caisse mobile">
            Le vendeur du marché tape le montant en FCFA, le client scanne. Son et vibration à l'encaissement. S'installe comme une app.
          </Pillar>
          <Pillar icon="globe" title="Adresse Lightning">
            <span className="mono">aissatou@yombalpay</span> : se paie comme un e-mail, depuis n'importe quel portefeuille au monde.
          </Pillar>
          <Pillar icon="link" title="Liens & QR">
            Un lien WhatsApp à montant fixe, une page publique à montant libre, une affiche QR à imprimer pour le comptoir.
          </Pillar>
          <Pillar icon="code" title="API & SDK">
            Pour les sites e-commerce : un appel, une redirection, un webhook signé. Le bouton s'intègre en une balise.
          </Pillar>
        </div>
      </section>

      <section className="snippet">
        <div>
          <h2>Pour les développeurs : 5 lignes</h2>
          <p className="muted">
            Signature HMAC, nonces, conversion FCFA, factures, webhooks, doublons, retries : YombalPay s'en charge. Votre site ne parle qu'à
            nous, seule la passerelle détient les clés Bitnob.
          </p>
          <Link to="/docs" className="btn link">
            Voir la documentation →
          </Link>
        </div>
        <Code lang="node.js">{`import YombalPay from 'yombalpay';
const tp = new YombalPay({ apiKey: process.env.YOMBALPAY_SECRET_KEY });

const checkout = await tp.createCheckout({
  amount: 5000, currency: 'XOF', reference: 'CMD-42',
});
res.redirect(checkout.pay_url);`}</Code>
      </section>

      <section className="compare">
        <h2>Pourquoi YombalPay</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Clients hors Sénégal</th>
                <th>Prix en FCFA</th>
                <th>Retrait mobile money</th>
                <th>Anti-volatilité</th>
                <th>Caisse physique</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['YombalPay', '✓', '✓', '✓', '✓ USDT', '✓', true],
                ['PayDunya / Wave', '—', '✓', '✓', '—', '✓'],
                ['BitPay, OpenNode', '✓', '—', '—', 'USD', '—'],
                ['API Bitnob en direct', '✓', '—', 'à coder', 'à coder', '—'],
              ].map(([name, ...cells]) => {
                const us = cells[cells.length - 1] === true;
                return (
                  <tr key={name} className={us ? 'us' : ''}>
                    <td>{name}</td>
                    {cells.slice(0, 5).map((c, i) => (
                      <td key={i}>{c}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="home-foot">
        <span>YombalPay · Code & Chain Dakar 2026 · Propulsé par Bitnob</span>
        <span>
          <Link to="/docs">Documentation</Link> · <Link to="/login">Connexion</Link>
        </span>
      </footer>
    </div>
  );
}

function Pillar({ icon, title, children }) {
  return (
    <div className="pillar">
      <span className="flow-icon">
        <Icon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
