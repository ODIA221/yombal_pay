import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { Field, Icon, Spinner, useToast } from '../../components/ui.jsx';

const NETWORKS = { wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money', expresso: 'Expresso' };
const STATUS = {
  none: { pill: 'muted', label: 'Non vérifiée' },
  pending: { pill: 'warn', label: 'En cours de vérification' },
  verified: { pill: 'ok', label: 'Entreprise vérifiée' },
  rejected: { pill: 'bad', label: 'À corriger' },
};
const EMPTY = {
  legal_name: '', legal_form: '', sector: '', ninea: '', rccm: '', representative_name: '', address: '', city: 'Dakar', payout_network: 'wave', payout_phone: '',
};

// Vérification de l'entreprise (KYB) : exigée pour encaisser et retirer de l'argent réel
export default function Activation() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [v, setV] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/v1/verification').then((r) => {
      setV(r);
      if (r.details) setF({ ...EMPTY, ...r.details, rccm: r.details.rccm || '' });
    });
  }, []);

  if (!v) return <div className="page narrow"><Spinner /></div>;
  const st = STATUS[v.status] || STATUS.none;
  const editable = v.status === 'none' || v.status === 'rejected';
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const r = await api('/v1/verification', { method: 'POST', body: f });
      setV({ ...v, ...r });
      await refresh();
      toast('Demande envoyée. Vous recevrez un e-mail à la fin de la vérification.');
    } catch (err) {
      toast(err.message, 'bad');
      setErrors(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page narrow">
      <div className="page-head">
        <h1 className="page-title">Activation</h1>
        <span className={`pill ${st.pill}`}>{st.label}</span>
      </div>

      <section className="panel">
        <h2>
          <Icon name="shield" size={18} /> Vérification de l'entreprise
        </h2>
        <p className="muted">
          {v.required_for_real_money
            ? 'Obligatoire pour recevoir de vrais paiements et retirer vers votre mobile money.'
            : 'Les paiements de test restent ouverts. La vérification sera exigée pour encaisser de l’argent réel.'}
        </p>
        {v.status === 'pending' && <div className="callout warn">Votre dossier est en cours de vérification. Vous serez prévenu par e-mail.</div>}
        {v.status === 'verified' && (
          <div className="callout ok">
            <Icon name="check" /> {v.details?.legal_name} est vérifiée.
          </div>
        )}
        {v.status === 'rejected' && (
          <div className="callout bad">
            <strong>Dossier à corriger</strong>
            <span>{v.note}</span>
          </div>
        )}
      </section>

      {editable && (
        <form className="panel stack" onSubmit={submit}>
          <Field label="Raison sociale" error={errors.legal_name}>
            <input required value={f.legal_name} onChange={set('legal_name')} placeholder="Ex. Boutique Aïssatou SUARL" />
          </Field>
          <div className="grid-2">
            <Field label="Forme juridique" error={errors.legal_form}>
              <select required value={f.legal_form} onChange={set('legal_form')}>
                <option value="">Choisir…</option>
                {Object.entries(v.legal_forms).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Secteur d'activité" error={errors.sector}>
              <select required value={f.sector} onChange={set('sector')}>
                <option value="">Choisir…</option>
                {Object.entries(v.sectors).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid-2">
            <Field label="NINEA" hint="7 à 9 chiffres, avec ou sans code de cotation." error={errors.ninea}>
              <input required value={f.ninea} onChange={set('ninea')} placeholder="0012345 2G3" />
            </Field>
            <Field label="RCCM (facultatif)" error={errors.rccm}>
              <input value={f.rccm} onChange={set('rccm')} placeholder="SN-DKR-2024-B-12345" />
            </Field>
          </div>
          <Field label="Représentant légal" error={errors.representative_name}>
            <input required value={f.representative_name} onChange={set('representative_name')} />
          </Field>
          <div className="grid-2">
            <Field label="Adresse" error={errors.address}>
              <input required value={f.address} onChange={set('address')} />
            </Field>
            <Field label="Ville" error={errors.city}>
              <input required value={f.city} onChange={set('city')} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="Mobile money de l'entreprise" error={errors.payout_network}>
              <select value={f.payout_network} onChange={set('payout_network')}>
                {Object.entries(NETWORKS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </Field>
            <Field label="Numéro" error={errors.payout_phone}>
              <input type="tel" required value={f.payout_phone} onChange={set('payout_phone')} placeholder="77 123 45 67" />
            </Field>
          </div>
          <button className="btn primary lg wide" disabled={busy}>
            {busy ? 'Envoi…' : v.status === 'rejected' ? 'Renvoyer ma demande' : 'Envoyer ma demande'}
          </button>
        </form>
      )}
    </div>
  );
}
