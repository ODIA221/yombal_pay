import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { fcfa, num, SOURCE, timeAgo, usdt } from '../../lib/format.js';
import { useLive } from '../../components/AppLayout.jsx';
import RevenueChart from '../../components/RevenueChart.jsx';
import { Bolt, CopyButton, Empty, Icon, Pill, QR, Spinner } from '../../components/ui.jsx';

export default function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await api('/v1/overview'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLive((type, d) => {
    if (type === 'checkout' && d.status === 'paid') {
      setFlash(d.id);
      setTimeout(() => setFlash(null), 3000);
    }
    if (['checkout', 'balance', 'payout'].includes(type)) load();
  });

  if (!data) return <div className="page">{error ? <p className="form-error">{error}</p> : <Spinner />}</div>;
  const { merchant, balance, stats, recent } = data;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Bonjour</p>
          <h1 className="page-title">{merchant.name}</h1>
        </div>
        <Link to="/app/caisse" className="btn primary">
          <Icon name="pos" size={18} /> Encaisser
        </Link>
      </div>

      <section className="balance-card">
        <div className="balance-main">
          <span className="balance-label">Solde disponible</span>
          <span className="balance-value">{fcfa(balance.total_xof)}</span>
          <div className="balance-split">
            <span>
              <Bolt size={14} /> {num(balance.btc.sats)} sats <em>≈ {fcfa(balance.btc.xof)}</em>
            </span>
            <span>
              <span className="usdt-dot">₮</span> {usdt(balance.usdt.amount)} <em>≈ {fcfa(balance.usdt.xof)}</em>
            </span>
          </div>
        </div>
        <div className="balance-actions">
          <Link to="/app/portefeuille?action=retrait" className="btn primary">
            <Icon name="out" size={18} /> Retirer vers Wave / OM
          </Link>
          <Link to="/app/portefeuille?action=convertir" className="btn ghost">
            <Icon name="shield" size={18} /> Protéger en USDT
          </Link>
        </div>
        <p className="balance-rate">
          1 BTC = {fcfa(balance.rate.xof_per_btc)} · {balance.rate.source}
        </p>
      </section>

      <section className="stats">
        <Stat label="Aujourd'hui" value={fcfa(stats.today_xof)} sub={`${stats.today_count} paiement${stats.today_count > 1 ? 's' : ''}`} />
        <Stat label="Total encaissé" value={fcfa(stats.total_xof)} sub={`${num(stats.total_sats)} sats`} />
        <Stat label="Paiements réussis" value={num(stats.paid_count)} sub={`${stats.pending_count} en attente`} />
        <Stat label="Taux de réussite" value={`${stats.conversion_rate} %`} sub="payés / terminés" />
      </section>

      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Ventes des 7 derniers jours</h2>
            <span className="muted small">{fcfa(stats.series.reduce((s, d) => s + d.xof, 0))}</span>
          </div>
          <RevenueChart series={stats.series} />
        </section>

        <section className="panel share-panel">
          <h2>Recevez de n'importe où</h2>
          <p className="muted small">Votre adresse Lightning fonctionne comme un e-mail : la diaspora vous paie depuis n'importe quel portefeuille.</p>
          <div className="share-row">
            <div className="qr-mini">
              <QR value={`${location.origin}/@${merchant.username}`} size={112} className="qr-small" />
            </div>
            <div className="stack-sm">
              <strong className="mono ln-address">{merchant.lightning_address}</strong>
              <CopyButton text={merchant.lightning_address} label="Copier l'adresse" className="btn ghost sm" />
              <a className="btn whatsapp sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Payez ${merchant.name} en Bitcoin, depuis n'importe quel pays : ${location.origin}/@${merchant.username}`)}`}>
                Partager sur WhatsApp
              </a>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Derniers paiements</h2>
          <Link to="/app/paiements" className="btn link sm">
            Tout voir →
          </Link>
        </div>
        {recent.length === 0 ? (
          <Empty icon="pos" title="Aucun paiement pour l'instant">
            Ouvrez la caisse ou partagez votre lien pour encaisser votre premier paiement.
          </Empty>
        ) : (
          <ul className="tx-list">
            {recent.map((c) => (
              <li key={c.id} className={flash === c.id ? 'flash' : ''}>
                <span className={`tx-icon ${c.status}`}>
                  <Icon name={c.status === 'paid' ? 'in' : 'refresh'} size={18} />
                </span>
                <div className="tx-main">
                  <strong>{c.description}</strong>
                  <span className="muted small">
                    {SOURCE[c.source] || c.source} · {timeAgo(c.paid_at || c.created_at)}
                  </span>
                </div>
                <div className="tx-amount">
                  <strong>{fcfa(c.amount)}</strong>
                  <Pill status={c.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
