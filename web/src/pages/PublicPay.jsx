import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fcfa, num } from '../lib/format.js';
import { LangSwitch, useLang } from '../lib/i18n.jsx';
import { Bolt, CopyButton, Logo, Spinner } from '../components/ui.jsx';

const QUICK = [2000, 5000, 10000, 25000];

// Page publique du marchand : le client choisit le montant en FCFA (diaspora, comptoir, Instagram…)
export default function PublicPay({ usernameOverride }) {
  const params = useParams();
  const username = usernameOverride || params.username;
  const navigate = useNavigate();
  const { lang, setLang, t } = useLang();
  const [m, setM] = useState(null);
  const [forRelative, setForRelative] = useState(false);
  const [forName, setForName] = useState('');
  const [rate, setRate] = useState(null);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/v1/public/merchants/${encodeURIComponent(username)}`).then(setM).catch((e) => setError(e.message));
    api('/v1/rates').then(setRate).catch(() => {});
  }, [username]);

  const value = Number(amount || 0);

  if (error && !m)
    return (
      <div className="pay-shell">
        <div className="pay-card center">
          <h2>{t.merchantNotFound}</h2>
          <p className="muted">{t.checkLink}</p>
        </div>
      </div>
    );
  if (!m)
    return (
      <div className="pay-shell">
        <div className="pay-card center">
          <Spinner />
        </div>
      </div>
    );

  return (
    <div className="pay-shell">
      <div className="pay-card">
        <header className="public-head">
          <span className="avatar lg">{m.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <p className="eyebrow">{t.pay}</p>
            <h1 className="merchant">{m.name}</h1>
            <span className="mono small muted">{m.lightning_address}</span>
          </div>
          <LangSwitch lang={lang} setLang={setLang} />
        </header>

        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const c = await api(`/v1/public/merchants/${encodeURIComponent(username)}/checkouts`, {
                method: 'POST',
                body: { amount: value, payer_name: payer, note, for_name: forRelative ? forName : '' },
              });
              navigate(`/pay/${c.id}`);
            } catch (err) {
              setError(err.message);
              setBusy(false);
            }
          }}
        >
          <label className="big-amount">
            <input type="number" inputMode="numeric" min={m.min} max={m.max} required autoFocus placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t.amountLabel} />
            <span>FCFA</span>
          </label>
          <span className="amount-sats center-text">
            <Bolt size={14} /> {rate && value ? `${num(Math.ceil((value / rate.xof_per_btc) * 1e8))} sats` : t.amountHint}
          </span>
          <div className="pos-quick">
            {QUICK.map((q) => (
              <button type="button" key={q} onClick={() => setAmount(String(q))}>
                {num(q)}
              </button>
            ))}
          </div>
          <input placeholder={t.yourName} maxLength={60} value={payer} onChange={(e) => setPayer(e.target.value)} />
          <label className="check-row">
            <input type="checkbox" checked={forRelative} onChange={(e) => setForRelative(e.target.checked)} />
            <span>{t.forRelative}</span>
          </label>
          {forRelative && <input placeholder={t.relativeName} maxLength={60} required value={forName} onChange={(e) => setForName(e.target.value)} autoFocus />}
          <input placeholder={t.reason} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary xl wide" disabled={busy || value < m.min}>
            <Bolt size={20} /> {busy ? t.preparing : value ? `${t.pay} ${fcfa(value)}` : t.pay}
          </button>
        </form>

        <details className="how">
          <summary>{t.sendDirect}</summary>
          <div className="row" style={{ marginTop: 10 }}>
            <code className="mono small ellipsis">{m.lightning_address}</code>
            <CopyButton text={m.lightning_address} className="btn ghost sm" />
          </div>
        </details>

        <footer className="pay-foot">
          {rate && (
            <span>
              1 BTC = {fcfa(rate.xof_per_btc)} · {rate.source}
            </span>
          )}
          <span className="secured">
            {t.securedBy} <Logo />
          </span>
        </footer>
      </div>
    </div>
  );
}
