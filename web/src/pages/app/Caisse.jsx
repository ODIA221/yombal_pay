import { useEffect, useState } from 'react';
import { api, live } from '../../lib/api.js';
import { fcfa, num } from '../../lib/format.js';
import { Bolt, CopyButton, Icon, QR, playChaChing, useCountdown } from '../../components/ui.jsx';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del'];
const QUICK = [1000, 2500, 5000, 10000];

// Caisse : le commerçant tape le montant en FCFA, le client scanne, la caisse sonne.
export default function Caisse() {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [checkout, setCheckout] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rate, setRate] = useState(null);

  useEffect(() => {
    api('/v1/rates').then(setRate).catch(() => {});
  }, []);

  // Statut en direct du paiement affiché
  useEffect(() => {
    if (!checkout || checkout.status !== 'pending') return;
    return live(
      `/v1/checkouts/${checkout.id}/stream`,
      (type, d) => {
        if (type !== 'status') return;
        setCheckout(d);
        if (d.status === 'paid') playChaChing();
      },
      { fallback: async () => setCheckout(await api(`/v1/checkouts/${checkout.id}`)), intervalMs: 5000, events: ['status'] },
    );
  }, [checkout?.id, checkout?.status]);

  const value = Number(amount || 0);
  const press = (k) => {
    setError('');
    if (k === 'del') return setAmount((a) => a.slice(0, -1));
    setAmount((a) => (a + k).replace(/^0+/, '').slice(0, 7));
  };

  async function charge() {
    if (value < 100) return setError('Montant minimum : 100 FCFA.');
    setBusy(true);
    setError('');
    try {
      const c = await api('/v1/checkouts', {
        method: 'POST',
        body: { amount: value, currency: 'XOF', description: note.trim() || 'Vente en caisse', reference: `POS-${Date.now().toString(36).toUpperCase()}`, source: 'pos' },
      });
      setCheckout(c);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const reset = () => {
    setCheckout(null);
    setAmount('');
    setNote('');
  };

  if (checkout) return <ChargeScreen c={checkout} onDone={reset} onUpdate={setCheckout} />;

  return (
    <div className="pos">
      <div className="pos-display">
        <span className="eyebrow">Montant à encaisser</span>
        <div className={`pos-amount ${value ? '' : 'placeholder'}`}>
          {num(value)} <small>FCFA</small>
        </div>
        <span className="pos-sats">
          <Bolt size={14} /> {rate && value ? `${num(Math.ceil((value / rate.xof_per_btc) * 1e8))} sats` : '0 sats'}
        </span>
      </div>

      <div className="pos-quick">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setAmount(String(q))}>
            {num(q)}
          </button>
        ))}
      </div>

      <input className="pos-note" placeholder="Article ou note (facultatif)" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'del' ? 'Effacer' : k}>
            {k === 'del' ? <Icon name="backspace" size={24} /> : k}
          </button>
        ))}
      </div>

      {error && <p className="form-error center">{error}</p>}
      <button className="btn primary xl wide" disabled={busy || value < 100} onClick={charge}>
        <Bolt size={20} /> {busy ? 'Création…' : value ? `Encaisser ${fcfa(value)}` : 'Encaisser'}
      </button>
    </div>
  );
}

function ChargeScreen({ c, onDone, onUpdate }) {
  const { seconds, label } = useCountdown(c.expires_at);
  const [simulating, setSimulating] = useState(false);
  const expired = c.status === 'expired' || (c.status === 'pending' && seconds === 0);

  if (c.status === 'paid')
    return (
      <div className="pos pos-result">
        <div className="big-check">
          <svg viewBox="0 0 52 52" aria-hidden="true">
            <circle cx="26" cy="26" r="24" />
            <path d="M15 27l7 7 15-16" />
          </svg>
        </div>
        <h2>Paiement reçu</h2>
        <p className="pos-paid-amount">{fcfa(c.amount)}</p>
        <p className="muted">{c.pay_asset === 'USDT' ? `${c.usdt.received} USDT` : `${num(c.amount_sats)} sats`} crédités sur votre solde</p>
        <a className="btn ghost wide" href={`/recu/${c.id}`} target="_blank" rel="noreferrer">
          Reçu à envoyer au client
        </a>
        <button className="btn primary xl wide" onClick={onDone}>
          Nouvelle vente
        </button>
      </div>
    );

  return (
    <div className="pos pos-charge">
      <div className="pos-charge-head">
        <button className="icon-btn" onClick={onDone} aria-label="Annuler">
          <Icon name="back" />
        </button>
        <div>
          <strong>{fcfa(c.amount)}</strong>
          <span className="muted small">
            <Bolt size={12} /> {num(c.amount_sats)} sats
          </span>
        </div>
      </div>
      {expired ? (
        <div className="pos-result">
          <h2>Facture expirée</h2>
          <p className="muted">Le taux n'est plus garanti.</p>
          <button className="btn primary xl wide" onClick={onDone}>
            Recommencer
          </button>
        </div>
      ) : (
        <>
          <a className="qr-wrap big" href={`lightning:${c.payment_request}`}>
            <QR value={`lightning:${c.payment_request}`.toUpperCase()} size={300} className="qr qr-big" />
          </a>
          <p className="status-row">
            <span className="live-dot" /> Le client scanne avec son portefeuille Lightning
            <span className="timer">{label}</span>
          </p>
          <div className="actions">
            <CopyButton text={c.payment_request} label="Copier la facture" />
            <a className="btn ghost" href={`/pay/${c.id}`} target="_blank" rel="noreferrer">
              <Icon name="external" size={16} /> Page client
            </a>
          </div>
          {c.demo && (
            <button
              className="btn demo wide"
              disabled={simulating}
              onClick={async () => {
                setSimulating(true);
                try {
                  const r = await api(`/v1/checkouts/${c.id}/simulate-payment`, { method: 'POST' });
                  onUpdate(r.checkout);
                  if (r.checkout.status === 'paid') playChaChing();
                } finally {
                  setSimulating(false);
                }
              }}
            >
              {simulating ? 'Webhook en cours…' : 'Simuler le paiement du client (démo)'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
