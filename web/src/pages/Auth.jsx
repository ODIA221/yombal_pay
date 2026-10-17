import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { CopyButton, Field, Icon, Logo } from '../components/ui.jsx';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Link to="/" className="auth-logo">
          <Logo />
        </Link>
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

export function Login() {
  const { merchant, setMerchant } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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

const slugify = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);

export function Signup() {
  const { merchant, setMerchant } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ name: '', username: '', email: '', password: '', phone: '' });
  const [touchedUser, setTouchedUser] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [secretKey, setSecretKey] = useState(null);

  if (merchant && !secretKey) return <Navigate to="/app" replace />;
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => ({ ...x, [k]: v, ...(k === 'name' && !touchedUser ? { username: slugify(v) } : {}) }));
  };
  const host = window.location.hostname;

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
      <AuthShell title="Bienvenue sur YombalPay" subtitle="Votre compte est prêt. Vous pouvez encaisser dès maintenant.">
        <div className="stack">
          <div className="callout ok">
            <Icon name="check" /> Votre adresse Lightning : <strong className="mono">{merchant?.lightning_address}</strong>
          </div>
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
      <form className="stack" onSubmit={submit}>
        <Field label="Nom du commerce">
          <input required minLength={2} maxLength={60} value={f.name} onChange={set('name')} placeholder="Ex. Boutique Aïssatou" />
        </Field>
        <Field label="Identifiant" hint={`Adresse Lightning : ${f.username || 'identifiant'}@${host}`}>
          <div className="input-prefix">
            <span>@</span>
            <input
              required
              pattern="[a-z0-9][a-z0-9._\-]{1,28}[a-z0-9]"
              value={f.username}
              onChange={(e) => {
                setTouchedUser(true);
                setF((x) => ({ ...x, username: e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '') }));
              }}
            />
          </div>
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
