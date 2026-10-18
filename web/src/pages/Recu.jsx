// Reçu de paiement imprimable (Imprimer → Enregistrer en PDF), avec QR de vérification vers la page de paiement.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { fcfa, num } from '../lib/format.js';
import { LangSwitch, useLang } from '../lib/i18n.jsx';
import { Logo, QR, Spinner } from '../components/ui.jsx';

const CHAINS = { tron: 'Tron', bsc: 'BNB Chain', polygon: 'Polygon', ethereum: 'Ethereum', solana: 'Solana', base: 'Base' };

export default function Recu() {
  const { id } = useParams();
  const { lang, setLang, t } = useLang();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/v1/checkouts/${id}`).then(setC).catch((e) => setError(e.message));
  }, [id]);

  if (!c)
    return (
      <div className="receipt-shell">
        <div className="receipt center">{error ? <p>{t.notFound}</p> : <Spinner />}</div>
      </div>
    );

  if (c.status !== 'paid')
    return (
      <div className="receipt-shell">
        <div className="receipt center">
          <p>{t.receiptNotPaid}</p>
          <a className="btn primary" href={`/pay/${c.id}`}>
            {t.pay}
          </a>
        </div>
      </div>
    );

  const verifyUrl = `${location.origin}/pay/${c.id}`;
  const date = new Date(c.paid_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' });
  const usdt = c.pay_asset === 'USDT';
  const rows = [
    [t.paidOn, date],
    [t.reference, c.reference],
    [t.method, usdt ? `${c.usdt.received} USDT (${c.usdt.addresses.map((a) => CHAINS[a.chain] || a.chain).join(', ')})` : `Bitcoin Lightning · ${num(c.amount_sats)} sats`],
    ...(usdt ? [] : [[t.rate, `1 BTC = ${fcfa(c.rate.xof_per_btc)}`]]),
    ...(c.savings?.xof > 0 ? [[t.feesAvoided, fcfa(c.savings.xof)]] : []),
  ];
  const proofs = usdt
    ? (c.proof?.transactions ?? []).map((p) => [t.chainProof(CHAINS[p.chain] || p.chain), p.hash])
    : c.proof?.payment_hash
      ? [[t.lnProof, c.proof.payment_hash]]
      : [];

  return (
    <div className="receipt-shell">
      <div className="receipt-tools no-print">
        <LangSwitch lang={lang} setLang={setLang} />
        <button className="btn primary sm" onClick={() => window.print()}>
          {t.printPdf}
        </button>
        <a className="btn whatsapp sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${t.shareText(c.merchant.name, fcfa(c.amount))} ${location.href}`)}`}>
          {t.share}
        </a>
      </div>

      <article className="receipt">
        <header className="receipt-head">
          <Logo light />
          <span className="receipt-badge">{t.received}</span>
        </header>
        <p className="receipt-kind">{t.receipt}</p>
        <h1 className="receipt-merchant">{c.merchant.name}</h1>
        <p className="receipt-amount">{fcfa(c.amount)}</p>
        <p className="receipt-desc">{c.description}</p>

        <dl className="receipt-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        {proofs.length > 0 && (
          <div className="receipt-proof">
            <p className="receipt-label">{t.proof}</p>
            {proofs.map(([k, v]) => (
              <p key={v}>
                <span>{k}</span>
                <code>{v}</code>
              </p>
            ))}
          </div>
        )}

        <footer className="receipt-foot">
          <QR value={verifyUrl} size={96} className="receipt-qr" />
          <p>
            {t.verify}
            <br />
            <span className="mono">{c.id}</span>
          </p>
        </footer>
      </article>
    </div>
  );
}
