import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { dateTime } from '../../lib/format.js';
import { Field, Icon, useToast } from '../../components/ui.jsx';

const ACTIONS = {
  signup: 'Création du compte',
  login: 'Connexion',
  login_failed: 'Échec de connexion',
  password_changed: 'Mot de passe modifié',
  logout_all: 'Déconnexion de tous les appareils',
  api_key_created: 'Clé API créée',
  api_key_revoked: 'Clé API révoquée',
  webhook_secret_rotated: 'Secret webhook régénéré',
  payout_created: 'Retrait demandé',
  payout_password_failed: 'Retrait refusé (code ou mot de passe)',
  payout_account_changed: 'Compte de retrait modifié',
  payout_account_password_failed: 'Changement du compte de retrait refusé (mot de passe)',
  payout_pin_set: 'Code de retrait défini',
  payout_pin_removed: 'Code de retrait supprimé',
  payout_pin_password_failed: 'Changement du code de retrait refusé (mot de passe)',
  savings_unlock: 'Épargne débloquée',
  savings_unlock_password_failed: 'Déblocage d’épargne refusé (code ou mot de passe)',
  staff_created: 'Caissier ajouté',
  staff_disabled: 'Caissier désactivé',
  staff_login: 'Connexion caissier',
  auto_payout_enabled: 'Retrait automatique activé',
  auto_payout_disabled: 'Retrait automatique désactivé',
  conversion: 'Conversion USDT',
  settings_updated: 'Réglages modifiés',
};

export default function Settings() {
  const { merchant, setMerchant, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ name: merchant.name, phone: merchant.phone || '' });
  const [payout, setPayout] = useState({ network: merchant.payout?.network || 'wave', phone: merchant.payout?.phone ? merchant.payout.phone.replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4') : '', name: merchant.payout?.name || '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [payoutPw, setPayoutPw] = useState('');
  const [pin, setPin] = useState({ pin: '', password: '' });
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    api('/v1/audit').then((r) => setAudit(r.data)).catch(() => {});
  }, []);

  const save = (body, msg) => async (e) => {
    e.preventDefault();
    try {
      setMerchant(await api('/v1/merchant', { method: 'PATCH', body }));
      toast(msg);
    } catch (err) {
      toast(err.message, 'bad');
    }
  };

  return (
    <div className="page narrow-lg">
      <h1 className="page-title">Réglages</h1>

      <section className="panel">
        <h2>Commerce</h2>
        <form className="stack" onSubmit={save(profile, 'Profil enregistré')}>
          <Field label="Nom affiché aux clients">
            <input required minLength={2} maxLength={60} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </Field>
          <Field label="Téléphone">
            <input type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
          </Field>
          <Field label="Identifiant & adresse Lightning" hint="L'identifiant ne peut pas être modifié.">
            <input disabled value={merchant.lightning_address} />
          </Field>
          <button className="btn primary sm">Enregistrer</button>
        </form>
      </section>

      <section className="panel">
        <h2>Compte de retrait par défaut</h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            await save({ payout, password: payoutPw }, 'Compte de retrait enregistré')(e);
            setPayoutPw('');
          }}
        >
          <div className="segmented">
            {[
              ['wave', 'Wave'],
              ['orange_money', 'Orange Money'],
              ['free_money', 'Free Money'],
              ['expresso', 'Expresso'],
            ].map(([v, l]) => (
              <button type="button" key={v} className={payout.network === v ? 'active' : ''} onClick={() => setPayout({ ...payout, network: v })}>
                {l}
              </button>
            ))}
          </div>
          <Field label="Numéro">
            <div className="input-prefix">
              <span>+221</span>
              <input type="tel" required value={payout.phone} onChange={(e) => setPayout({ ...payout, phone: e.target.value })} placeholder="77 123 45 67" />
            </div>
          </Field>
          <Field label="Titulaire">
            <input required value={payout.name} onChange={(e) => setPayout({ ...payout, name: e.target.value })} />
          </Field>
          <Field label="Votre mot de passe" hint="Les retraits automatiques partent vers ce compte : on vous le redemande par sécurité.">
            <input type="password" required autoComplete="current-password" value={payoutPw} onChange={(e) => setPayoutPw(e.target.value)} />
          </Field>
          <button className="btn primary sm">Enregistrer</button>
        </form>
      </section>

      <section className="panel">
        <h2>Code de retrait</h2>
        <p className="muted small">
          {merchant.has_payout_pin
            ? 'Un code est défini : il suffit pour confirmer un retrait ou débloquer l’épargne. Le mot de passe reste accepté.'
            : 'Confirmez vos retraits avec un code à 4-6 chiffres, plus rapide à taper que le mot de passe.'}
        </p>
        {!merchant.has_password && (
          <p className="callout warn">Compte Google : choisissez d'abord un mot de passe (section Sécurité). Il sert à définir le code de retrait.</p>
        )}
        <form
          className="stack"
          onSubmit={async (e) => {
            await save({ payout_pin: pin.pin, password: pin.password }, 'Code de retrait enregistré')(e);
            setPin({ pin: '', password: '' });
          }}
        >
          <Field label={merchant.has_payout_pin ? 'Nouveau code' : 'Code'} hint="4 à 6 chiffres, pas tous identiques.">
            <input type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{4,6}" maxLength={6} value={pin.pin} onChange={(e) => setPin({ ...pin, pin: e.target.value.replace(/\D/g, '') })} />
          </Field>
          <Field label="Votre mot de passe" hint="Le code se change uniquement avec le mot de passe du compte.">
            <input type="password" required autoComplete="current-password" value={pin.password} onChange={(e) => setPin({ ...pin, password: e.target.value })} />
          </Field>
          <div className="row wrap">
            <button className="btn primary sm">{merchant.has_payout_pin ? 'Changer le code' : 'Définir le code'}</button>
            {merchant.has_payout_pin && (
              <button
                type="button"
                className="btn ghost sm"
                disabled={!pin.password}
                onClick={async (e) => {
                  await save({ payout_pin: null, password: pin.password }, 'Code de retrait supprimé')(e);
                  setPin({ pin: '', password: '' });
                }}
              >
                Supprimer le code
              </button>
            )}
          </div>
        </form>
      </section>

      <Team />

      <section className="panel">
        <h2>
          <Icon name="lock" size={18} /> Sécurité
        </h2>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api('/v1/auth/password', { method: 'POST', body: pw });
              setPw({ current_password: '', new_password: '' });
              if (!merchant.has_password) setMerchant({ ...merchant, has_password: true });
              toast(merchant.has_password ? 'Mot de passe modifié. Vos autres appareils ont été déconnectés.' : 'Mot de passe enregistré.');
            } catch (err) {
              toast(err.message, 'bad');
            }
          }}
        >
          {merchant.has_password ? (
            <Field label="Mot de passe actuel">
              <input type="password" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            </Field>
          ) : (
            <p className="callout warn">
              Vous vous connectez avec Google. Choisissez un mot de passe : il est demandé pour retirer de l'argent et débloquer l'épargne.
            </p>
          )}
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, une lettre et un chiffre.">
            <input type="password" autoComplete="new-password" required minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </Field>
          <div className="row wrap">
            <button className="btn primary sm">{merchant.has_password ? 'Changer le mot de passe' : 'Choisir mon mot de passe'}</button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={async () => {
                if (!confirm('Déconnecter tous les appareils, y compris celui-ci ?')) return;
                await api('/v1/auth/logout-all', { method: 'POST' });
                await logout();
                navigate('/login');
              }}
            >
              Déconnecter tous les appareils
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Activité du compte</h2>
        <ul className="audit">
          {audit.map((a, i) => (
            <li key={i}>
              <span className={/failed/.test(a.action) ? 'bad' : ''}>
                {ACTIONS[a.action] || a.action}
                {a.meta?.name ? ` · ${a.meta.name}` : ''}
              </span>
              <span className="muted small">
                {dateTime(a.created_at)} · {a.ip}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Team() {
  const toast = useToast();
  const [staff, setStaff] = useState([]);
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const load = () => api('/v1/staff').then((r) => setStaff(r.data)).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="panel">
      <h2>
        <Icon name="user" size={18} /> Équipe
      </h2>
      <p className="muted small">
        Un caissier se connecte avec son propre compte : il encaisse avec la caisse et voit ses ventes, mais n'a accès ni au solde, ni aux retraits, ni aux réglages.
      </p>
      {staff.length > 0 && (
        <ul className="key-list">
          {staff.map((m) => (
            <li key={m.id} className={m.active ? '' : 'inactive'}>
              <Icon name="pos" size={18} />
              <div className="tx-main">
                <strong>{m.name}</strong>
                <span className="mono small muted">
                  {m.email}
                  {m.active ? '' : ' · désactivé'}
                </span>
              </div>
              {m.active && (
                <button
                  className="btn link sm danger"
                  onClick={async () => {
                    if (!confirm(`Désactiver ${m.name} ? Il sera déconnecté immédiatement.`)) return;
                    await api(`/v1/staff/${m.id}`, { method: 'DELETE' });
                    toast(`${m.name} désactivé`);
                    load();
                  }}
                >
                  Désactiver
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api('/v1/staff', { method: 'POST', body: f });
            toast(`${f.name} peut maintenant se connecter à la caisse`);
            setF({ name: '', email: '', password: '' });
            load();
          } catch (err) {
            toast(err.message, 'bad');
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-row">
          <Field label="Nom">
            <input required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Moussa" />
          </Field>
          <Field label="E-mail de connexion">
            <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
        </div>
        <Field label="Mot de passe initial" hint="8 caractères minimum, une lettre et un chiffre. Communiquez-le au caissier.">
          <input type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <button className="btn primary sm" disabled={busy}>
          <Icon name="plus" size={16} /> Ajouter un caissier
        </button>
      </form>
    </section>
  );
}
