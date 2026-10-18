// Épargne en USDT : un objectif (Tabaski, rentrée, stock…), une part de chaque vente mise de côté en dollars stables,
// hors du solde disponible. Débloquer l'épargne exige le mot de passe.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { dateTime, fcfa, usdt } from '../../lib/format.js';
import { useLive } from '../../components/AppLayout.jsx';
import { Empty, Field, Icon, Modal, Spinner, useToast } from '../../components/ui.jsx';

const IDEAS = ['Tabaski', 'Rentrée scolaire', 'Stock de bazin', 'Machine à coudre', 'Korité'];

export default function Epargne() {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const load = useCallback(async () => {
    try {
      setS(await api('/v1/savings'));
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLive((type) => type === 'balance' && load());

  if (!s) return <div className="page">{error ? <p className="form-error">{error}</p> : <Spinner />}</div>;
  const { balance, goal } = s;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Épargne</p>
          <h1 className="page-title">{goal.name || 'Mon objectif'}</h1>
        </div>
      </div>

      <section className="balance-card savings-card">
        <div className="balance-main">
          <span className="balance-label">
            <Icon name="lock" size={14} /> Mis de côté, en dollars stables
          </span>
          <span className="balance-value">{fcfa(balance.xof)}</span>
          <div className="balance-split">
            <span>
              <span className="usdt-dot">₮</span> {usdt(balance.usdt)}
            </span>
            {s.added_this_month_xof > 0 && <span>+{fcfa(s.added_this_month_xof)} ce mois-ci</span>}
          </div>
          {goal.xof && (
            <div className="goal">
              <div className="goal-bar" role="progressbar" aria-valuenow={goal.progress} aria-valuemin="0" aria-valuemax="100">
                <span style={{ width: `${goal.progress}%` }} />
              </div>
              <span className="muted small">
                {goal.progress} % de {fcfa(goal.xof)}
                {goal.progress >= 100 ? ' : objectif atteint 🎉' : `, encore ${fcfa(Math.max(0, goal.xof - balance.xof))}`}
              </span>
            </div>
          )}
        </div>
        <div className="balance-actions">
          <button className="btn primary" onClick={() => setModal('save')}>
            <Icon name="plus" size={18} /> Mettre de côté
          </button>
          <button className="btn ghost" disabled={!balance.micro} onClick={() => setModal('unlock')}>
            <Icon name="lock" size={18} /> Débloquer
          </button>
        </div>
      </section>

      <Settings s={s} onSaved={setS} />

      <section className="panel">
        <div className="panel-head">
          <h2>Mouvements</h2>
        </div>
        {s.history.length === 0 ? (
          <Empty icon="lock" title="Rien de côté pour l'instant">
            Choisissez un pourcentage ci-dessus : chaque vente alimentera votre objectif, sans y penser.
          </Empty>
        ) : (
          <ul className="tx-list">
            {s.history.map((h, i) => (
              <li key={i}>
                <span className={`tx-icon ${h.amount > 0 ? 'paid' : ''}`}>
                  <Icon name={h.amount > 0 ? 'in' : 'out'} size={18} />
                </span>
                <div className="tx-main">
                  <strong>{h.description}</strong>
                  <span className="muted small">{dateTime(h.created_at)}</span>
                </div>
                <div className="tx-amount">
                  <strong>
                    {h.amount > 0 ? '+' : '−'}
                    {fcfa(Math.abs(h.xof))}
                  </strong>
                  <span className="muted small">{usdt(Math.abs(h.usdt))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {modal === 'save' && <SaveModal onClose={() => setModal(null)} onDone={setS} />}
      {modal === 'unlock' && <UnlockModal max={balance.xof} onClose={() => setModal(null)} onDone={setS} />}
    </div>
  );
}

function Settings({ s, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(s.goal.name || '');
  const [goal, setGoal] = useState(s.goal.xof || '');
  const [pct, setPct] = useState(s.pct);
  const [busy, setBusy] = useState(false);
  const dirty = name !== (s.goal.name || '') || Number(goal || 0) !== Number(s.goal.xof || 0) || pct !== s.pct;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      onSaved(await api('/v1/savings', { method: 'PATCH', body: { goal_name: name, goal_xof: goal ? Number(goal) : null, pct } }));
      toast('Objectif enregistré');
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel savings-settings" onSubmit={save}>
      <h2>
        <Icon name="settings" size={18} /> Mon objectif
      </h2>
      <div className="savings-fields">
        <Field label="Pour quoi ?">
          <input value={name} maxLength={40} placeholder="Tabaski" onChange={(e) => setName(e.target.value)} list="savings-ideas" />
          <datalist id="savings-ideas">
            {IDEAS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
        <Field label="Montant visé">
          <div className="input-suffix">
            <input type="number" min="1000" step="1000" placeholder="300000" value={goal} onChange={(e) => setGoal(e.target.value)} />
            <span>FCFA</span>
          </div>
        </Field>
      </div>
      <span className="field-label">Mettre de côté à chaque vente</span>
      <div className="auto-controls">
        <input type="range" min="0" max="50" step="5" value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Part de chaque vente mise de côté" />
        <span className="pct">{pct} %</span>
        <button className="btn primary sm" disabled={!dirty || busy}>
          Enregistrer
        </button>
      </div>
      <p className="muted small">
        {pct > 0
          ? `Sur une vente de 10 000 FCFA, ${fcfa(10000 * (pct / 100))} sont convertis en USDT et mis de côté automatiquement.`
          : 'Épargne automatique désactivée : vous mettez de côté à la main.'}
      </p>
    </form>
  );
}

function SaveModal({ onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Mettre de côté" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            onDone(await api('/v1/savings/deposit', { method: 'POST', body: { amount: Number(amount) } }));
            toast(`${fcfa(amount)} mis de côté`);
            onClose();
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted small">Pris sur votre solde USDT. S'il ne suffit pas, la différence est d'abord convertie depuis votre Bitcoin (trading Bitnob).</p>
        <Field label="Montant">
          <div className="input-suffix">
            <input type="number" min="600" step="500" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span>FCFA</span>
          </div>
        </Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'En cours…' : 'Mettre de côté'}
        </button>
      </form>
    </Modal>
  );
}

function UnlockModal({ max, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Débloquer l'épargne" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            onDone(await api('/v1/savings/unlock', { method: 'POST', body: { amount: amount ? Number(amount) : undefined, password } }));
            toast('Épargne débloquée : elle est dans votre solde disponible');
            onClose();
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted small">L'argent revient dans votre solde disponible, en USDT. Vous pourrez ensuite le retirer sur Wave ou Orange Money.</p>
        <Field label="Montant" hint={`Laissez vide pour tout débloquer (${fcfa(max)})`}>
          <div className="input-suffix">
            <input type="number" min="600" step="500" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span>FCFA</span>
          </div>
        </Field>
        <Field label="Code de retrait ou mot de passe">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary wide" disabled={busy}>
          {busy ? 'En cours…' : 'Débloquer'}
        </button>
      </form>
    </Modal>
  );
}
