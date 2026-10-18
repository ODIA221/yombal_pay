import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CopyButton, Field, Icon, Logo } from '../components/ui.jsx';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <a href="/" className="auth-logo">
          <Logo />
        </a>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </div>
      <p className="auth-foot">
        <Icon name="lock" size={14} /> Connexion chiffrée. Votre mot de passe n'est jamais stocké en clair.
      </p>
    </div>
  );
}

// « Continuer avec Google », affiché seulement si la passerelle a des identifiants Google
function GoogleButton() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    api('/v1/auth/options').then((o) => setEnabled(Boolean(o.google)), () => {});
  }, []);
  if (!enabled) return null;
  return (
    <>
      <a className="btn ghost lg wide google-btn" href="/v1/auth/google">
        <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
          <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
        </svg>
        Continuer avec Google
      </a>
      <p className="auth-or">
        <span>ou</span>
      </p>
    </>
  );
}

export function Login() {
  const { merchant, setMerchant } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Erreur renvoyée par la connexion Google, ou lien de confirmation d'e-mail expiré
  const [error, setError] = useState(
    params.get('erreur')?.slice(0, 200) || (params.get('email') === 'invalide' ? 'Ce lien de confirmation est invalide ou a expiré. Connectez-vous pour en recevoir un nouveau.' : ''),
  );
  const [busy, setBusy] = useState(false);
  const next = params.get('next')?.startsWith('/app') ? params.get('next') : '/app';

  if (merchant) return <Navigate to={next} replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/v1/auth/login', { method: 'POST', body: { email, password } });
      setMerchant(r.merchant);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Bon retour" subtitle="Connectez-vous à votre espace marchand.">
      <GoogleButton />
      <form className="stack" onSubmit={submit}>
        <Field label="E-mail">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Mot de passe">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary lg wide" disabled={busy}>
          {busy ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <p className="auth-switch">
        Pas encore de compte ? <Link to="/signup">Créer mon compte marchand</Link>
      </p>
    </AuthShell>
  );
}

export function Signup() {
  const { merchant, setMerchant } = useAuth();
  const navigate = useNavigate();
  // L'identifiant (adresse Lightning, page publique) est tiré du nom du commerce par le serveur
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [secretKey, setSecretKey] = useState(null);

  if (merchant && !secretKey) return <Navigate to="/app" replace />;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/v1/auth/signup', { method: 'POST', body: f });
      setSecretKey(r.secret_key);
      setMerchant(r.merchant);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (secretKey)
    return (
      <AuthShell
        title="Bienvenue sur YombalPay"
        subtitle={merchant?.email_verified ? 'Votre compte est prêt. Vous pouvez encaisser dès maintenant.' : 'Votre compte est créé. Confirmez votre e-mail pour encaisser.'}
      >
        <div className="stack">
          <div className="callout ok">
            <Icon name="check" /> Votre adresse Lightning : <strong className="mono">{merchant?.lightning_address}</strong>
          </div>
          {!merchant?.email_verified && (
            <div className="callout warn">
              <strong>Confirmez votre adresse e-mail</strong>
              <span className="small">Nous avons envoyé un lien à {merchant?.email}. Il est valable 24 heures.</span>
            </div>
          )}
          <div className="callout warn">
            <strong>Votre clé secrète API. Elle ne s'affichera qu'une fois, notez-la maintenant.</strong>
            <span className="small">Pour intégrer YombalPay à un site. Gardez-la côté serveur ; vous pourrez en créer d'autres.</span>
            <code className="secret">{secretKey}</code>
            <CopyButton text={secretKey} className="btn ghost sm" />
          </div>
          <button className="btn primary lg wide" onClick={() => navigate('/app', { replace: true })}>
            Ouvrir mon espace marchand
          </button>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="Créer mon compte marchand" subtitle="Encaissez en Bitcoin du monde entier, recevez sur Wave ou Orange Money.">
      <GoogleButton />
      <form className="stack" onSubmit={submit}>
        <Field label="Nom du commerce">
          <input required minLength={2} maxLength={60} value={f.name} onChange={set('name')} placeholder="Ex. Boutique Aïssatou" />
        </Field>
        <Field label="E-mail">
          <input type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Téléphone (facultatif)">
          <input type="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} placeholder="77 123 45 67" />
        </Field>
        <Field label="Mot de passe" hint="8 caractères minimum, avec au moins une lettre et un chiffre.">
          <input type="password" autoComplete="new-password" required minLength={8} value={f.password} onChange={set('password')} />
        </Field>
        {error && <p className="form-error">{error}</p>}
        <button className="btn primary lg wide" disabled={busy}>
          {busy ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>
      <p className="auth-switch">
        Déjà inscrit ? <Link to="/login">Se connecter</Link>
      </p>
    </AuthShell>
  );
}
