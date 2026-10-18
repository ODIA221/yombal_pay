import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { timeAgo } from '../../lib/format.js';
import { Empty, Icon, Spinner, useToast } from '../../components/ui.jsx';

const FORMS = { ei: 'Entreprise individuelle', suarl: 'SUARL', sarl: 'SARL', sa: 'SA', sas: 'SAS', gie: 'GIE', association: 'Association' };
const NETWORKS = { wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', expresso: 'Expresso' };
const TABS = [
  ['pending', 'En attente'],
  ['verified', 'Vérifiées'],
  ['rejected', 'Refusées'],
];

// Administration YombalPay : validation des entreprises (comptes listés dans ADMIN_EMAILS)
export default function Admin() {
  const { merchant } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [rows, setRows] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setRows(null);
    setRows((await api(`/v1/admin/verifications?status=${tab}`)).data);
  }, [tab]);
  useEffect(() => {
    if (merchant?.is_admin) load();
  }, [load, merchant]);

  if (!merchant?.is_admin) return <Navigate to="/app" replace />;

  async function decide(m, decision) {
    try {
      await api(`/v1/admin/verifications/${m.id}`, { method: 'POST', body: { decision, note: notes[m.id] } });
      toast(`${m.verification.legal_name} : ${decision === 'approve' ? 'approuvée' : 'refusée'}. Le marchand est prévenu par e-mail.`);
      load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Administration</h1>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={`btn sm ${tab === k ? 'primary' : 'ghost'}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {!rows ? (
        <Spinner />
      ) : !rows.length ? (
        <Empty icon="shield" title="Aucune demande">
          Les demandes de vérification des entreprises apparaîtront ici.
        </Empty>
      ) : (
        rows.map((m) => {
          const d = m.verification || {};
          return (
            <section className="panel" key={m.id}>
              <div className="panel-head">
                <h2>
                  <Icon name="shield" size={18} /> {d.legal_name}
                </h2>
                <span className="muted small">{m.verification_submitted_at ? `envoyée ${timeAgo(m.verification_submitted_at)}` : ''}</span>
              </div>
              <dl className="kv">
                {[
                  ['Commerce', `${m.name} · @${m.username} · ${m.email}`],
                  ['Forme, secteur', `${FORMS[d.legal_form] || d.legal_form} · ${d.sector}`],
                  ['NINEA', d.ninea],
                  ['RCCM', d.rccm || 'Aucun'],
                  ['Représentant', d.representative_name],
                  ['Adresse', `${d.address}, ${d.city}`],
                  ['Mobile money', `${NETWORKS[d.payout_network] || d.payout_network} · ${d.payout_phone}`],
                  ...(m.verification_note ? [['Motif du refus', m.verification_note]] : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              {tab === 'pending' && (
                <div className="stack" style={{ marginTop: 12 }}>
                  <input placeholder="Motif en cas de refus (envoyé au marchand)" value={notes[m.id] || ''} onChange={(e) => setNotes({ ...notes, [m.id]: e.target.value })} />
                  <div className="row wrap">
                    <button className="btn primary sm" onClick={() => decide(m, 'approve')}>
                      <Icon name="check" size={16} /> Approuver
                    </button>
                    <button className="btn ghost sm" onClick={() => decide(m, 'reject')}>
                      <Icon name="x" size={16} /> Refuser
                    </button>
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
