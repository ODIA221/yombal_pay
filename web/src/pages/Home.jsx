import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { fcfa, num } from '../lib/format.js';
import { Bolt, Code, Icon } from '../components/ui.jsx';

// Boutique de démo (dossier shop/) : servie à part, sur son propre port
const SHOP_URL = import.meta.env.VITE_SHOP_URL || 'http://localhost:4000';

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
          <p className="eyebrow">Bitcoin Lightning et mobile money, avec Bitnob</p>
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
            <Icon name="shield" size={16} /> Chaque paiement est vérifié deux fois auprès de Bitnob, et chaque retrait demande votre mot de passe.
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
          ['globe', 'Le client paie', "Votre client paie en Lightning depuis le pays de son choix. Ça prend deux secondes et presque rien en frais."],
          ['wallet', 'Le solde est crédité', "Bitnob confirme le paiement, on le revérifie de notre côté, puis la caisse sonne."],
          ['shield', 'La valeur est protégée', "La part que vous choisissez passe en USDT, une monnaie stable calée sur le dollar."],
          ['out', 'Retrait mobile money', 'Quand vous voulez, vous retirez sur Wave, Orange Money ou Free Money.'],
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

      <section className="story">
        <div className="story-photos">
          <img className="s1" src="/img/atelier-couture.jpg" alt="Couturière au travail dans un atelier" loading="lazy" />
          <img className="s2" src="/img/grand-boubou-bleu.jpg" alt="Grand boubou brodé bleu ciel" loading="lazy" />
          <img className="s3" src="/img/kente-sourire.jpg" alt="Femme souriante en kente" loading="lazy" />
          <div className="story-toast">
            <span className="toast-icon">
              <Bolt size={18} />
            </span>
            <div>
              <strong>+ 65 000 FCFA</strong>
              <span>Grand boubou, payé depuis Paris</span>
            </div>
          </div>
        </div>
        <div className="story-copy">
          <p className="eyebrow">Ils encaissent avec YombalPay</p>
          <h2>Aïssatou habille la diaspora, de Dakar au monde entier.</h2>
          <p className="lead">
            Avec <strong>African Costume Shop</strong>, Aïssatou vend ses grands boubous, bazins et kaftans cousus main. Ses clientes de
            Paris, Lyon ou Montréal paient en Lightning en quelques secondes. Elle, elle voit des FCFA et retire sur Wave le soir même.
          </p>
          <ul className="story-points">
            <li>
              <Icon name="globe" size={18} /> Sa cliente n'a besoin ni de carte bancaire, ni de bureau de change
            </li>
            <li>
              <Icon name="shield" size={18} /> Une partie de chaque vente protégée en USDT
            </li>
            <li>
              <Icon name="out" size={18} /> Retrait automatique sur Wave dès 50 000 FCFA
            </li>
          </ul>
          <div className="cta">
            <a className="btn primary" href={SHOP_URL} target="_blank" rel="noopener">
              Visiter la boutique <Icon name="external" size={16} />
            </a>
            <Link className="btn ghost" to="/@africancostume">
              Sa page de paiement
            </Link>
          </div>
        </div>
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
          <h2>Pour les développeurs, cinq lignes suffisent</h2>
          <p className="muted">
            La signature des requêtes, la conversion en FCFA, les factures, les webhooks et les doublons, on s'en occupe. Votre site ne parle qu'à
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
                ['PayDunya / Wave', '✗', '✓', '✓', '✗', '✓'],
                ['BitPay, OpenNode', '✓', '✗', '✗', 'USD', '✗'],
                ['API Bitnob en direct', '✓', '✗', 'à coder', 'à coder', '✗'],
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
        <span>YombalPay, construit avec Bitnob pour le Code & Chain Dakar 2026</span>
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
