import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime, fcfa, num, SOURCE, timeAgo } from '../../lib/format.js';
import { useLive } from '../../components/AppLayout.jsx';
import { CopyButton, Empty, Icon, Modal, Pill, Spinner } from '../../components/ui.jsx';

const FILTERS = [
  ['', 'Tous'],
  ['paid', 'Payés'],
  ['pending', 'En attente'],
  ['expired', 'Expirés'],
];

const CONFIRMED_BY = {
  bitnob_webhook: 'Webhook Bitnob signé, revérifié auprès de Bitnob',
  bitnob_api: 'Vérification serveur via l’API Bitnob',
  webhook_demo: 'Webhook simulé (démo)',
};

export default function Payments() {
  const { merchant } = useAuth();
  const staff = merchant.staff;
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: '200' });
    if (status) params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    const r = await api(`/v1/checkouts?${params}`);
    setRows(r.data);
  }, [status, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useLive((type) => type === 'checkout' && load());

  function exportCsv() {
    const head = ['reference', 'description', 'statut', 'montant_fcfa', 'sats', 'commission_sats', 'source', 'cree_le', 'paye_le'];
    const lines = rows.map((c) => [c.reference, c.description, c.status, c.amount, c.amount_sats, c.fee_sats, c.source, c.created_at, c.paid_at || ''].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `yombalpay-paiements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{staff ? 'Mes ventes' : 'Paiements'}</h1>
        {!staff && (
          <button className="btn ghost sm" onClick={exportCsv} disabled={!rows?.length}>
            Exporter CSV
          </button>
        )}
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist">
          {FILTERS.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={status === v} className={status === v ? 'active' : ''} onClick={() => setStatus(v)}>
              {l}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Rechercher une référence, un article…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section className="panel flush">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty title="Aucun paiement">Les paiements créés par la caisse, vos liens et votre site apparaîtront ici.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="table-click">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="hide-sm">Source</th>
                  <th className="r">Montant</th>
                  <th className="r hide-sm">Sats</th>
                  <th>Statut</th>
                  <th className="hide-sm">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} onClick={() => setDetail(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setDetail(c)}>
                    <td>
                      <div className="cell-main">
                        <strong className="ellipsis">{c.description}</strong>
                        <span className="mono muted small">{c.reference}</span>
                      </div>
                    </td>
                    <td className="muted hide-sm">{SOURCE[c.source] || c.source}</td>
                    <td className="r strong">{fcfa(c.amount)}</td>
                    <td className="r mono hide-sm">{num(c.amount_sats)}</td>
                    <td>
                      <Pill status={c.status} />
                    </td>
                    <td className="muted hide-sm">{timeAgo(c.paid_at || c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail && <PaymentDetail c={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function PaymentDetail({ c, onClose }) {
  const rows = [
    ['Montant', fcfa(c.amount)],
    ...(c.pay_asset === 'USDT'
      ? [
          ['Payé en', `${c.usdt.received} USDT (stablecoin)`],
          ['Réseau', c.usdt.addresses.map((a) => a.chain).join(', ')],
        ]
      : [['Montant Bitcoin', `${num(c.amount_sats)} sats`]]),
    ...(c.fee_sats !== undefined && c.pay_asset !== 'USDT'
      ? [
          ['Commission YombalPay', `${num(c.fee_sats)} sats`],
          ['Net crédité', c.status === 'paid' ? `${num(c.amount_sats - c.fee_sats)} sats` : '-'],
        ]
      : []),
    ['Taux appliqué', `1 BTC = ${fcfa(c.rate.xof_per_btc)}`],
    ['Source du taux', c.rate.source],
    ['Canal', SOURCE[c.source] || c.source],
    ['Créé le', dateTime(c.created_at)],
    ['Payé le', dateTime(c.paid_at)],
  ];
  if (c.confirmed_by !== undefined) rows.push(['Confirmé par', CONFIRMED_BY[c.confirmed_by] || c.confirmed_by || '-']);
  if (c.payer_note) rows.push(['Note du payeur', c.payer_note]);
  return (
    <Modal title={c.description} onClose={onClose}>
      <div className="detail-head">
        <Pill status={c.status} />
        <span className="mono muted small">{c.reference}</span>
      </div>
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {c.preimage && (
        <div className="proof">
          <span className="small muted">
            <Icon name="shield" size={14} /> Preuve de paiement Lightning (preimage)
          </span>
          <code className="mono small">{c.preimage}</code>
        </div>
      )}
      <div className="row wrap">
        <a className="btn ghost sm" href={`/pay/${c.id}`} target="_blank" rel="noreferrer">
          <Icon name="external" size={16} /> Page de paiement
        </a>
        <CopyButton text={c.id} label="Copier l'identifiant" className="btn ghost sm" />
      </div>
    </Modal>
  );
}
