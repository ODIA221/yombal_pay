import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime, fcfa, num, snPhone, usdt } from '../../lib/format.js';
import { useLive } from '../../components/AppLayout.jsx';
import { Bolt, Empty, Field, Icon, Modal, Pill, Spinner, useToast } from '../../components/ui.jsx';

const NETWORK_STYLE = { wave: 'net-wave', orange_money: 'net-orange', free_money: 'net-free', expresso: 'net-expresso' };
const NETWORK_LABEL = { wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', expresso: 'Expresso' };
const LEDGER_LABEL = {
  payment: 'Paiement reçu',
  fee: 'Commission',
  conversion_out: 'Conversion → USDT',
  conversion_in: 'Conversion depuis BTC',
  payout: 'Retrait',
  payout_reversal: 'Retrait remboursé',
  savings_in: 'Mis de côté (épargne)',
  savings_out: 'Épargne débloquée',
};

export default function Wallet() {
  const { merchant, setMerchant } = useAuth();
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [conversions, setConversions] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [corridor, setCorridor] = useState(null);
  const [tab, setTab] = useState('payouts');
  const action = params.get('action');
  const close = () => setParams({}, { replace: true });

  const load = useCallback(async () => {
    const [o, p, c, l] = await Promise.all([api('/v1/overview'), api('/v1/payouts'), api('/v1/conversions'), api('/v1/ledger')]);
    setOverview(o);
    setPayouts(p);
    setConversions(c.data);
    // Le registre du portefeuille montre le solde disponible ; les mouvements internes à l’épargne sont sur sa page
    setLedger(l.data.filter((e) => e.pocket !== 'savings'));
  }, []);
  useEffect(() => {
    load();
    api('/v1/payouts/corridor').then(setCorridor).catch(() => {});
  }, [load]);
  useLive((type) => ['balance', 'payout', 'checkout'].includes(type) && load());

  if (!overview || !payouts) return <div className="page"><Spinner /></div>;
  const b = overview.balance;

  return (
    <div className="page">
      <h1 className="page-title">Portefeuille</h1>

      <section className="wallet-grid">
        <div className="asset-card btc">
          <span className="asset-name">
            <span className="asset-icon"><Bolt size={16} /></span> Bitcoin
          </span>
          <strong>{fcfa(b.btc.xof)}</strong>
          <span className="mono muted">{num(b.btc.sats)} sats</span>
          <span className="small muted">Suit le cours du Bitcoin</span>
        </div>
        <div className="asset-card usdt">
          <span className="asset-name">
            <span className="asset-icon">₮</span> USDT
          </span>
          <strong>{fcfa(b.usdt.xof)}</strong>
          <span className="mono muted">{usdt(b.usdt.amount)}</span>
          <span className="small muted">Stable, indexé sur le dollar</span>
        </div>
        <div className="wallet-actions">
          <button className="btn primary lg wide" onClick={() => setParams({ action: 'retrait' })}>
            <Icon name="out" /> Retirer vers mobile money
          </button>
          <button className="btn ghost lg wide" onClick={() => setParams({ action: 'convertir' })} disabled={b.btc.sats < 1000}>
            <Icon name="swap" /> Convertir BTC → USDT
          </button>
          {corridor && (
            <p className={`corridor ${corridor.available ? 'ok' : 'warn'}`}>
              <span className="dot" /> {corridor.message}
            </p>
          )}
        </div>
      </section>

      <AutoConvert merchant={merchant} onSaved={setMerchant} />
      <AutoPayout merchant={merchant} onSaved={setMerchant} />

      <section className="panel flush">
        <div className="tabs">
          {[
            ['payouts', 'Retraits'],
            ['conversions', 'Conversions'],
            ['ledger', 'Journal'],
          ].map(([v, l]) => (
            <button key={v} className={tab === v ? 'active' : ''} onClick={() => setTab(v)}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'payouts' &&
          (payouts.data.length === 0 ? (
            <Empty icon="out" title="Aucun retrait">Vos retraits vers Wave, Orange Money, Free Money ou Expresso apparaîtront ici.</Empty>
          ) : (
            <ul className="tx-list padded">
              {payouts.data.map((p) => (
                <li key={p.id}>
                  <span className={`net-badge ${NETWORK_STYLE[p.network]}`}>{p.network_label.slice(0, 1)}</span>
                  <div className="tx-main">
                    <strong>
                      {p.network_label} · {p.phone}
                    </strong>
                    <span className="muted small">
                      {p.account_name} · {dateTime(p.created_at)} · depuis {p.source_asset}
                      {p.trigger === 'auto' ? ' · automatique' : ''}
                      {p.provider === 'simulated' ? ' · simulé' : ''}
                      {p.error ? ` · ${p.error}` : ''}
                    </span>
                  </div>
                  <div className="tx-amount">
                    <strong>−{fcfa(p.amount)}</strong>
                    <Pill status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'conversions' &&
          (conversions.length === 0 ? (
            <Empty icon="swap" title="Aucune conversion">Convertissez vos sats en USDT pour vous protéger de la volatilité.</Empty>
          ) : (
            <ul className="tx-list padded">
              {conversions.map((c) => (
                <li key={c.id}>
                  <span className="tx-icon paid">
                    <Icon name="swap" size={18} />
                  </span>
                  <div className="tx-main">
                    <strong>
                      {num(c.sats)} sats → {usdt(c.usdt)}
                    </strong>
                    <span className="muted small">
                      {c.trigger === 'auto' ? 'Automatique' : 'Manuelle'} · {c.provider === 'bitnob' ? 'Trading Bitnob' : 'simulée'} · {dateTime(c.created_at)}
                    </span>
                  </div>
                  <span className="mono small muted">1 BTC = {num(c.price_usdt)} $</span>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'ledger' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Opération</th>
                  <th className="r">Montant</th>
                  <th className="hide-sm">Date</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <div className="cell-main">
                        <strong>{LEDGER_LABEL[e.type] || e.type}</strong>
                        <span className="muted small">{e.description}</span>
                      </div>
                    </td>
                    <td className={`r mono ${e.amount > 0 ? 'amt-pos' : 'amt-neg'}`}>
                      {e.amount > 0 ? '+' : ''}
                      {e.asset === 'BTC' ? `${num(e.amount)} sats` : usdt(e.amount / 1e6)}
                    </td>
                    <td className="muted hide-sm">{dateTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Reconciliation />

      {action === 'retrait' && <PayoutModal balance={b} merchant={merchant} networks={payouts.networks} onClose={close} onDone={load} />}
      {action === 'convertir' && <ConvertModal balance={b} onClose={close} onDone={load} />}
    </div>
  );
}

function AutoConvert({ merchant, onSaved }) {
  const [pct, setPct] = useState(merchant.auto_convert_pct);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const dirty = pct !== merchant.auto_convert_pct;
  return (
    <section className="panel auto-convert">
      <div>
        <h2>
          <Icon name="shield" size={18} /> Protection automatique
        </h2>
        <p className="muted small">
          À chaque paiement reçu, convertir automatiquement <strong>{pct} %</strong> en USDT via le trading Bitnob. Le reste est gardé en Bitcoin.
        </p>
      </div>
      <div className="auto-controls">
        <input type="range" min="0" max="100" step="10" value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Pourcentage converti automatiquement" />
        <span className="pct">{pct} %</span>
        <button
          className="btn primary sm"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              onSaved(await api('/v1/merchant', { method: 'PATCH', body: { auto_convert_pct: pct } }));
              toast('Protection automatique enregistrée');
            } catch (e) {
              toast(e.message, 'bad');
            } finally {
              setSaving(false);
            }
          }}
        >
          Enregistrer
        </button>
      </div>
    </section>
  );
}

function AutoPayout({ merchant, onSaved }) {
  const toast = useToast();
  const cfg = merchant.auto_payout;
  const [min, setMin] = useState(cfg.min_xof);
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const account = merchant.payout;

  async function save(enabled) {
    setError('');
    try {
      onSaved(await api('/v1/merchant', { method: 'PATCH', body: { auto_payout: { enabled, min_xof: Number(min) }, password } }));
      toast(enabled ? 'Retrait automatique activé' : 'Retrait automatique désactivé');
      setAsking(false);
      setPassword('');
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="panel auto-convert">
      <div>
        <h2>
          <Icon name="out" size={18} /> Retrait automatique {cfg.enabled && <span className="pill ok">Actif</span>}
        </h2>
        <p className="muted small">
          {account
            ? <>Dès que le solde Bitcoin atteint <strong>{fcfa(min || 0)}</strong>, tout est envoyé sur {NETWORK_LABEL[account.network] || account.network} +221 {snPhone(account.phone)}.</>
            : <>Enregistrez d'abord un compte de retrait par défaut dans les Réglages.</>}
        </p>
      </div>
      <div className="auto-controls">
        <div className="input-suffix compact">
          <input type="number" min="500" step="500" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Seuil de retrait automatique" />
          <span>FCFA</span>
        </div>
        {cfg.enabled ? (
          <>
            <button className="btn ghost sm" disabled={Number(min) === cfg.min_xof} onClick={() => setAsking(true)}>
              Modifier
            </button>
            <button className="btn link sm danger" onClick={() => save(false)}>
              Désactiver
            </button>
          </>
        ) : (
          <button className="btn primary sm" disabled={!account} onClick={() => setAsking(true)}>
            Activer
          </button>
        )}
      </div>
      {asking && (
        <Modal title="Confirmer le retrait automatique" onClose={() => setAsking(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              save(true);
            }}
          >
            <p className="muted small">Les retraits partiront sans nouvelle confirmation. Votre mot de passe est exigé pour l'autoriser.</p>
            <Field label="Mot de passe">
              <input type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="form-error">{error}</p>}
            <button className="btn primary wide">Autoriser</button>
          </form>
        </Modal>
      )}
      {error && !asking && <p className="form-error">{error}</p>}
    </section>
  );
}

function PayoutModal({ balance, merchant, networks, onClose, onDone }) {
  const saved = merchant.payout;
  const [f, setF] = useState({
    amount: '',
    network: saved?.network || 'wave',
    phone: saved?.phone || '',
    account_name: saved?.name || '',
    source_asset: balance.usdt.xof >= 500 && balance.btc.xof < 500 ? 'USDT' : 'BTC',
    password: '',
  });
  const [step, setStep] = useState('form');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const available = f.source_asset === 'BTC' ? balance.btc.xof : balance.usdt.xof;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const amount = Number(f.amount || 0);

  async function submit(e) {
    e.preventDefault();
    if (step === 'form') {
      if (amount < 500) return setError('Montant minimum : 500 FCFA.');
      if (amount > available) return setError(`Solde ${f.source_asset} disponible : ${fcfa(available)}.`);
      setError('');
      return setStep('confirm');
    }
    setBusy(true);
    setError('');
    try {
      const p = await api('/v1/payouts', { method: 'POST', body: { ...f, amount } });
      setResult(p);
      setStep('done');
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const net = networks.find((n) => n.id === f.network);

  return (
    <Modal title="Retirer vers mobile money" onClose={onClose}>
      {step === 'done' ? (
        <div className="pos-result">
          <div className="big-check sm">
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <circle cx="26" cy="26" r="24" />
              <path d="M15 27l7 7 15-16" />
            </svg>
          </div>
          <h2>Retrait lancé</h2>
          <p className="muted">
            {fcfa(result.amount)} vers {result.network_label} {result.phone}. Vous serez notifié dès réception.
            {result.provider === 'simulated' && <><br /><em>Retrait simulé (mode démo).</em></>}
          </p>
          <button className="btn primary wide" onClick={onClose}>
            Terminé
          </button>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          {step === 'form' ? (
            <>
              <div className="net-picker" role="radiogroup" aria-label="Réseau">
                {networks.map((n) => (
                  <button type="button" key={n.id} role="radio" aria-checked={f.network === n.id} className={`net ${NETWORK_STYLE[n.id]} ${f.network === n.id ? 'active' : ''}`} onClick={() => setF((x) => ({ ...x, network: n.id }))}>
                    <span className="net-badge">{n.label.slice(0, 1)}</span>
                    {n.label}
                  </button>
                ))}
              </div>
              <Field label="Montant à recevoir" hint={`Disponible en ${f.source_asset} : ${fcfa(available)}`}>
                <div className="input-suffix">
                  <input type="number" inputMode="numeric" min="500" step="100" required value={f.amount} onChange={set('amount')} placeholder="25 000" />
                  <span>FCFA</span>
                </div>
              </Field>
              <div className="segmented small">
                {['BTC', 'USDT'].map((a) => (
                  <button type="button" key={a} className={f.source_asset === a ? 'active' : ''} onClick={() => setF((x) => ({ ...x, source_asset: a }))}>
                    Depuis {a === 'BTC' ? 'Bitcoin' : 'USDT'}
                  </button>
                ))}
              </div>
              <Field label={`Numéro ${net?.label || ''}`}>
                <div className="input-prefix">
                  <span>+221</span>
                  <input type="tel" inputMode="tel" required value={f.phone} onChange={set('phone')} placeholder="77 123 45 67" />
                </div>
              </Field>
              <Field label="Nom du titulaire">
                <input required minLength={2} value={f.account_name} onChange={set('account_name')} placeholder="Aïssatou Ndiaye" />
              </Field>
            </>
          ) : (
            <>
              <div className="confirm-box">
                <span className="muted small">Vous allez recevoir</span>
                <strong>{fcfa(amount)}</strong>
                <span>
                  sur {net?.label} · +221 {f.phone}
                </span>
                <span className="muted small">
                  {f.account_name}, prélevé sur votre solde {f.source_asset}
                </span>
              </div>
              <Field
                label={merchant.has_payout_pin ? 'Confirmez avec votre code de retrait' : 'Confirmez avec votre mot de passe'}
                hint={merchant.has_payout_pin ? 'Le code à 4-6 chiffres, ou à défaut votre mot de passe.' : 'Chaque retrait exige votre mot de passe. Définissez un code de retrait dans les Réglages pour aller plus vite.'}
              >
                <input type="password" autoComplete="current-password" inputMode={merchant.has_payout_pin ? 'numeric' : undefined} required autoFocus value={f.password} onChange={set('password')} />
              </Field>
            </>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="row">
            {step === 'confirm' && (
              <button type="button" className="btn ghost" onClick={() => setStep('form')}>
                Retour
              </button>
            )}
            <button className="btn primary wide" disabled={busy}>
              {step === 'form' ? 'Continuer' : busy ? 'Envoi…' : `Confirmer le retrait`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ConvertModal({ balance, onClose, onDone }) {
  const [pct, setPct] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const sats = Math.floor((balance.btc.sats * pct) / 100);
  const xof = Math.round((balance.btc.xof * pct) / 100);
  const usdtEst = xof / balance.rate.usd_xof;

  return (
    <Modal title="Protéger en USDT" onClose={onClose}>
      <p className="muted small">
        Le Bitcoin bouge. L'USDT reste stable (≈ 1 $). La conversion passe par le trading Bitnob, au prix coté.
      </p>
      <div className="segmented">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} type="button" className={pct === p ? 'active' : ''} onClick={() => setPct(p)}>
            {p} %
          </button>
        ))}
      </div>
      <div className="convert-preview">
        <div>
          <span className="muted small">Vous convertissez</span>
          <strong>{num(sats)} sats</strong>
          <span className="muted small">≈ {fcfa(xof)}</span>
        </div>
        <Icon name="swap" />
        <div>
          <span className="muted small">Vous recevez environ</span>
          <strong>{usdt(usdtEst)}</strong>
          <span className="muted small">prix final confirmé par Bitnob</span>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <button
        className="btn primary lg wide"
        disabled={busy || sats < 1000}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await api('/v1/conversions', { method: 'POST', body: { sats } });
            toast(`${num(r.sats)} sats convertis en ${usdt(r.usdt)}`);
            onDone();
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Conversion…' : 'Convertir maintenant'}
      </button>
    </Modal>
  );
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

// Rapprochement comptable : chaque paiement, dépôt, retrait et conversion a les bonnes écritures dans le registre
function Reconciliation() {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      setR(await api('/v1/reconciliation'));
    } catch (e) {
      setR({ error: e.message });
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    run();
  }, [run]);
  useLive((type) => ['balance', 'payout'].includes(type) && run());
  if (!r) return null;
  const c = r.checked;
  return (
    <section className="panel reconciliation">
      <div className="panel-head">
        <h2>
          <Icon name="check" size={18} /> Rapprochement comptable{' '}
          {!r.error && <span className={`pill ${r.ok ? 'ok' : 'bad'}`}>{r.ok ? 'Aucun écart' : `${r.errors} écart${r.errors > 1 ? 's' : ''}`}</span>}
        </h2>
        <button className="btn ghost sm" onClick={run} disabled={busy}>
          <Icon name="refresh" size={16} /> Vérifier
        </button>
      </div>
      {r.error ? (
        <p className="form-error">{r.error}</p>
      ) : (
        <>
          <p className="muted small">
            {plural(c.payments, 'paiement')}, {plural(c.deposits, 'dépôt')} USDT, {plural(c.payouts, 'retrait')} et {plural(c.conversions, 'conversion')} comparés au
            registre : crédits, commissions, débits et remboursements. Vérifié {dateTime(r.checked_at)}.
          </p>
          {r.issues.length > 0 && (
            <ul className="issues">
              {r.issues.map((i, k) => (
                <li key={k} className={i.severity}>
                  {i.severity === 'error' ? '❌' : '⚠️'} {i.message} <span className="mono muted small">{i.ref}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
