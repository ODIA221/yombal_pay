import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, live } from '../lib/api.js';
import { fcfa, num } from '../lib/format.js';
import { LangSwitch, useLang } from '../lib/i18n.jsx';
import { Bolt, CopyButton, Logo, QR, Spinner, useCountdown } from '../components/ui.jsx';

// Libellés des réseaux stablecoin (identifiants Bitnob)
const CHAINS = {
  tron: 'Tron (TRC-20)',
  bsc: 'BNB Chain (BEP-20)',
  polygon: 'Polygon',
  ethereum: 'Ethereum (ERC-20)',
  solana: 'Solana',
  base: 'Base',
  avalanche: 'Avalanche',
  optimism: 'Optimism',
};
const chainLabel = (c) => CHAINS[c] || c;

export default function Pay() {
  const { id } = useParams();
  const { lang, setLang, t } = useLang();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [redirectIn, setRedirectIn] = useState(null);
  const [method, setMethod] = useState('ln');
  const [chain, setChain] = useState(null);
  const [addrBusy, setAddrBusy] = useState(false);
  const { seconds, label } = useCountdown(c?.expires_at);

  useEffect(() => {
    let stop;
    api(`/v1/checkouts/${id}`)
      .then((data) => {
        setC(data);
        stop = live(`/v1/checkouts/${id}/stream`, (type, d) => type === 'status' && setC(d), {
          fallback: async () => setC(await api(`/v1/checkouts/${id}`)),
          intervalMs: 5000,
          events: ['status'],
        });
      })
      .catch((e) => setError(e.message));
    return () => stop?.();
  }, [id]);

  // Une adresse USDT déjà demandée (page rechargée) : on rouvre directement le paiement en USDT
  const lastAddress = c?.usdt?.addresses?.at(-1);
  useEffect(() => {
    if (lastAddress && !chain) {
      setMethod('usdt');
      setChain(lastAddress.chain);
    }
  }, [lastAddress, chain]);

  // Retour automatique vers le site marchand après paiement (URL http(s) validée côté serveur)
  useEffect(() => {
    if (c?.status !== 'paid' || !c.return_url) return;
    setRedirectIn(5);
    const timer = setInterval(() => {
      setRedirectIn((n) => {
        if (n <= 1) {
          clearInterval(timer);
          window.location.href = c.return_url;
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [c?.status, c?.return_url]);

  async function verify() {
    setChecking(true);
    try {
      setC(await api(`/v1/checkouts/${id}/refresh`, { method: 'POST' }));
    } catch (e) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }

  async function chooseChain(ch) {
    setChain(ch);
    if (c.usdt.addresses.some((a) => a.chain === ch)) return;
    setAddrBusy(true);
    setError('');
    try {
      setC(await api(`/v1/checkouts/${id}/usdt`, { method: 'POST', body: { chain: ch } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setAddrBusy(false);
    }
  }

  async function simulate() {
    setSimulating(true);
    try {
      const r = await api(`/v1/checkouts/${id}/simulate-payment`, { method: 'POST', body: method === 'usdt' ? { asset: 'USDT' } : undefined });
      setC(r.checkout);
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  }

  if (error && !c)
    return (
      <div className="pay-shell">
        <div className="pay-card center">
          <h2>{t.notFound}</h2>
          <p className="muted">{t.checkLink}</p>
        </div>
      </div>
    );
  if (!c)
    return (
      <div className="pay-shell">
        <div className="pay-card center">
          <Spinner />
        </div>
      </div>
    );

  // Un dépôt USDT reste accepté après l'expiration de la facture Lightning (la blockchain peut prendre quelques minutes)
  const usdtStarted = c.usdt?.addresses?.length > 0;
  const expired = !usdtStarted && (c.status === 'expired' || (c.status === 'pending' && seconds === 0));
  const lightningUri = `lightning:${c.payment_request}`;

  return (
    <div className="pay-shell">
      <div className="pay-card">
        <header className="pay-head">
          <div>
            <p className="eyebrow">{t.payTo}</p>
            <h1 className="merchant">{c.merchant?.name}</h1>
          </div>
          <div className="pay-head-right">
            {c.demo && <span className="pill warn">{t.demo}</span>}
            <LangSwitch lang={lang} setLang={setLang} />
          </div>
        </header>

        <div className="amount">
          <span className="amount-xof">{fcfa(c.amount)}</span>
          {c.pay_asset === 'USDT' || method === 'usdt' ? (
            <span className="amount-sats usdt-sub">₮ {c.usdt.received && c.status === 'paid' ? c.usdt.received : c.usdt.amount} USDT</span>
          ) : (
            <span className="amount-sats">
              <Bolt size={14} /> {num(c.amount_sats)} sats
            </span>
          )}
        </div>
        <p className="desc">{c.description}</p>
        {c.status === 'pending' && !expired && c.savings?.xof > 0 && <p className="savings">{t.savings(fcfa(c.savings.xof), c.savings.benchmark_pct)}</p>}

        {c.status === 'paid' ? (
          <div className="success">
            <div className="check">
              <svg viewBox="0 0 52 52" aria-hidden="true">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27l7 7 15-16" />
              </svg>
            </div>
            <h2>{t.received}</h2>
            <p className="muted">
              {c.pay_asset === 'USDT' ? t.receivedUsdt(fcfa(c.amount), c.usdt.received) : t.receivedText(fcfa(c.amount), num(c.amount_sats))}
              <br />
              {t.merchantNotified}
            </p>
            {c.savings?.xof > 0 && <p className="savings">{t.saved(fcfa(c.savings.xof))}</p>}
            {c.return_url && (
              <a className="btn primary wide" href={c.return_url}>
                {t.backTo(c.merchant?.name)} {redirectIn ? `(${redirectIn})` : ''}
              </a>
            )}
          </div>
        ) : expired ? (
          <div className="success">
            <h2>{t.expired}</h2>
            <p className="muted">{t.expiredText}</p>
            {c.return_url && (
              <a className="btn ghost wide" href={c.return_url}>
                {t.backToMerchant}
              </a>
            )}
          </div>
        ) : (
          <>
            {c.usdt?.available && (
              <div className="segmented pay-method" role="tablist">
                <button type="button" className={method === 'ln' ? 'active' : ''} onClick={() => setMethod('ln')}>
                  <Bolt size={14} /> Bitcoin Lightning
                </button>
                <button type="button" className={method === 'usdt' ? 'active' : ''} onClick={() => setMethod('usdt')}>
                  <span className="usdt-dot">₮</span> {t.usdtOr}
                </button>
              </div>
            )}
            {method === 'usdt' ? (
              <UsdtPanel c={c} t={t} chain={chain} onChain={chooseChain} busy={addrBusy} error={error} />
            ) : (
              <>
                <a href={lightningUri} className="qr-wrap" title={t.openWallet}>
                  <QR value={lightningUri.toUpperCase()} />
                </a>
                <div className="status-row">
                  <span className="live-dot" /> {t.waiting}
                  <span className="timer" title={t.rateValid}>
                    {label}
                  </span>
                </div>
                <div className="actions">
                  <a className="btn primary" href={lightningUri}>
                    <Bolt /> {t.openWallet}
                  </a>
                  <CopyButton text={c.payment_request} label={t.copyInvoice} />
                </div>
                <details className="how">
                  <summary>{t.howTo}</summary>
                  <ol>
                    <li>{t.how1}</li>
                    <li>{t.how2}</li>
                    <li>{t.how3}</li>
                  </ol>
                </details>
              </>
            )}
            <div className="actions small">
              {method === 'ln' && (
                <button className="btn link" onClick={verify} disabled={checking}>
                  {checking ? t.checking : t.iPaid}
                </button>
              )}
              {c.demo && (method === 'ln' || usdtStarted) && (
                <button className="btn demo" onClick={simulate} disabled={simulating}>
                  {simulating ? t.simulating : t.simulate}
                </button>
              )}
            </div>
          </>
        )}

        <footer className="pay-foot">
          <span>
            1 BTC = {fcfa(c.rate?.xof_per_btc)} · {c.rate?.source}
          </span>
          <span className="secured">
            {t.securedBy} <Logo />
          </span>
        </footer>
      </div>
    </div>
  );
}

function UsdtPanel({ c, t, chain, onChain, busy, error }) {
  const address = c.usdt.addresses.find((a) => a.chain === chain)?.address;
  return (
    <div className="usdt-panel">
      <p className="eyebrow">{t.network}</p>
      <div className="chain-list">
        {c.usdt.chains.map((ch) => (
          <button type="button" key={ch} className={`chip ${chain === ch ? 'active' : ''}`} onClick={() => onChain(ch)} disabled={busy}>
            {chainLabel(ch)}
          </button>
        ))}
      </div>
      {busy && <Spinner small />}
      {error && <p className="form-error">{error}</p>}
      {address && (
        <>
          <div className="qr-wrap">
            <QR value={address} />
          </div>
          <p className="usdt-amount">
            {t.sendExactly} <strong>{c.usdt.amount} USDT</strong>
          </p>
          <p className="mono usdt-address">{address}</p>
          <div className="actions">
            <CopyButton text={address} label={t.copyAddress} className="btn primary" />
            <CopyButton text={c.usdt.amount} label={t.copyAmount} />
          </div>
          {c.usdt.received && <p className="savings">{t.usdtReceived(c.usdt.received, c.usdt.amount)}</p>}
          <p className="usdt-warn">{t.usdtWarn(chainLabel(chain))}</p>
          <div className="status-row">
            <span className="live-dot" /> {t.waiting}
          </div>
          <p className="muted small">{t.usdtFrom}</p>
        </>
      )}
    </div>
  );
}
