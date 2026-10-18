import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api, live } from '../lib/api.js';
import { fcfa } from '../lib/format.js';
import { Icon, Logo, Spinner, playChaChing, useToast } from './ui.jsx';

// Bus d'événements temps réel partagé par les pages de l'espace marchand
const LiveContext = createContext({ on: () => () => {} });
export const useLive = (handler) => {
  const { on } = useContext(LiveContext);
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on((type, data) => ref.current(type, data)), [on]);
};

const NAV = [
  { to: '/app', label: 'Accueil', icon: 'home', end: true },
  { to: '/app/caisse', label: 'Caisse', icon: 'pos' },
  { to: '/app/paiements', label: 'Paiements', icon: 'list' },
  { to: '/app/portefeuille', label: 'Portefeuille', icon: 'wallet' },
  { to: '/app/epargne', label: 'Épargne', icon: 'lock' },
  { to: '/app/liens', label: 'Liens & QR', icon: 'link' },
  { to: '/app/developpeurs', label: 'Développeurs', icon: 'code' },
  { to: '/app/activation', label: 'Activation', icon: 'shield' },
  { to: '/app/reglages', label: 'Réglages', icon: 'settings' },
];
// Visible seulement des administrateurs YombalPay (ADMIN_EMAILS)
const ADMIN_NAV = { to: '/app/admin', label: 'Administration', icon: 'key' };
const ownerNav = (m) => (m.is_admin ? [...NAV, ADMIN_NAV] : NAV);
const MOBILE = ['/app', '/app/caisse', '/app/paiements', '/app/portefeuille'];

// Bandeau du compte : e-mail à confirmer, entreprise à faire vérifier quand l'argent est réel
function AccountBanner({ merchant }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  if (merchant.staff) return null;
  if (!merchant.email_verified)
    return (
      <div className="callout warn account-banner">
        <span>
          <strong>Confirmez votre adresse e-mail</strong> pour encaisser vos premiers paiements. Nous avons envoyé un lien à {merchant.email}.
        </span>
        <button
          className="btn ghost sm"
          disabled={sending}
          onClick={async () => {
            setSending(true);
            try {
              await api('/v1/auth/resend-confirmation', { method: 'POST' });
              toast(`Lien renvoyé à ${merchant.email}.`);
            } catch (err) {
              toast(err.message, 'bad');
            } finally {
              setSending(false);
            }
          }}
        >
          Renvoyer le lien
        </button>
      </div>
    );
  if (merchant.real_money && merchant.verification?.status !== 'verified')
    return (
      <div className="callout warn account-banner">
        <span>
          <strong>{merchant.verification?.status === 'pending' ? 'Vérification en cours.' : 'Faites vérifier votre entreprise'}</strong>{' '}
          {merchant.verification?.status === 'pending' ? 'Vous pourrez encaisser dès que votre entreprise sera vérifiée.' : 'pour recevoir de vrais paiements et retirer vers votre mobile money.'}
        </span>
        {merchant.verification?.status !== 'pending' && (
          <NavLink to="/app/activation" className="btn ghost sm">
            Activer mon compte
          </NavLink>
        )}
      </div>
    );
  return null;
}
// Un caissier n'accède qu'à la caisse et à ses propres ventes
const STAFF_NAV = [
  { to: '/app/caisse', label: 'Caisse', icon: 'pos' },
  { to: '/app/paiements', label: 'Mes ventes', icon: 'list' },
];

export default function AppLayout() {
  const { merchant, logout, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const listeners = useRef(new Set());
  const busRef = useRef({ on: (fn) => (listeners.current.add(fn), () => listeners.current.delete(fn)) });

  useEffect(() => {
    if (!merchant || merchant.staff) return;
    return live('/v1/merchant/stream', (type, data) => {
      if (type === 'checkout' && data.status === 'paid') {
        playChaChing();
        toast(`${fcfa(data.amount)} reçus : ${data.description}`);
      }
      if (type === 'payout' && data.status === 'completed') toast(`Retrait de ${fcfa(data.amount)} envoyé sur ${data.network_label}`);
      if (type === 'payout' && data.status === 'failed') toast(`Retrait échoué et remboursé : ${data.error || ''}`, 'bad');
      listeners.current.forEach((fn) => fn(type, data));
    });
  }, [merchant, toast]);

  // Retour du lien de confirmation (/app?email=confirme)
  useEffect(() => {
    if (params.get('email') !== 'confirme') return;
    refresh();
    toast('Adresse e-mail confirmée. Vous pouvez encaisser vos premiers paiements.');
    setParams({}, { replace: true });
  }, [params, setParams, refresh, toast]);

  if (merchant === undefined) return <div className="center-screen"><Spinner /></div>;
  if (merchant === null) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;

  const isPos = pathname === '/app/caisse';
  const staff = merchant.staff;
  if (staff && !STAFF_NAV.some((n) => n.to === pathname)) return <Navigate to="/app/caisse" replace />;
  const nav = staff ? STAFF_NAV : ownerNav(merchant);
  const tabs = staff ? STAFF_NAV : NAV.filter((n) => MOBILE.includes(n.to));

  return (
    <LiveContext.Provider value={busRef.current}>
      <div className={`app ${isPos ? 'app-pos' : ''}`}>
        <aside className="sidebar">
          <NavLink to="/app" className="sidebar-logo">
            <Logo />
          </NavLink>
          <div className="sidebar-merchant">
            <span className="avatar">{merchant.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{merchant.name}</strong>
              <span className="mono">{staff ? `Caisse · ${staff.name}` : merchant.lightning_address}</span>
            </div>
          </div>
          <nav className="sidebar-nav">
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <Icon name={n.icon} /> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-foot">
            <span className={`mode-badge ${merchant.mode}`}>
              <span className="dot" /> {merchant.mode === 'live' ? 'Bitnob, mode réel' : 'Mode démo'}
            </span>
            <button
              className="btn link sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <Icon name="logout" size={16} /> Déconnexion
            </button>
          </div>
        </aside>

        <main className="app-main">
          <header className="topbar">
            <NavLink to="/app" className="topbar-logo">
              <Logo />
            </NavLink>
            <span className={`mode-badge ${merchant.mode}`}>
              <span className="dot" /> {merchant.mode === 'live' ? 'Réel' : 'Démo'}
            </span>
            {staff ? (
              <button
                className="icon-btn"
                aria-label="Déconnexion"
                onClick={async () => {
                  await logout();
                  navigate('/login');
                }}
              >
                <Icon name="logout" />
              </button>
            ) : (
              <NavLink to="/app/plus" className="icon-btn" aria-label="Menu">
                <Icon name="menu" />
              </NavLink>
            )}
          </header>
          <AccountBanner merchant={merchant} />
          <Outlet />
        </main>

        <nav className={`tabbar ${staff ? 'tabbar-staff' : ''}`} aria-label="Navigation principale">
          {tabs.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} size={22} />
              <span>{n.label}</span>
            </NavLink>
          ))}
          {!staff && (
            <NavLink to="/app/plus">
              <Icon name="menu" size={22} />
              <span>Plus</span>
            </NavLink>
          )}
        </nav>
      </div>
    </LiveContext.Provider>
  );
}

// Menu « Plus » (mobile)
export function MoreMenu() {
  const { merchant, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="page narrow">
      <h1 className="page-title">Menu</h1>
      <div className="menu-list">
        {ownerNav(merchant).filter((n) => !MOBILE.includes(n.to)).map((n) => (
          <NavLink key={n.to} to={n.to}>
            <Icon name={n.icon} /> {n.label}
          </NavLink>
        ))}
        <a href={`/@${merchant.username}`} target="_blank" rel="noreferrer">
          <Icon name="globe" /> Ma page de paiement publique
        </a>
        <a href="/docs" target="_blank" rel="noreferrer">
          <Icon name="external" /> Documentation
        </a>
        <button
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <Icon name="logout" /> Déconnexion
        </button>
      </div>
    </div>
  );
}
