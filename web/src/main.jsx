import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Pay from './pages/Pay.jsx';
import PublicPay from './pages/PublicPay.jsx';
import Recu from './pages/Recu.jsx';
import Docs from './pages/Docs.jsx';
import { Login, Signup } from './pages/Auth.jsx';
import AppLayout, { MoreMenu } from './components/AppLayout.jsx';
import Overview from './pages/app/Overview.jsx';
import Caisse from './pages/app/Caisse.jsx';
import Payments from './pages/app/Payments.jsx';
import Wallet from './pages/app/Wallet.jsx';
import Epargne from './pages/app/Epargne.jsx';
import Links from './pages/app/Links.jsx';
import Developers from './pages/app/Developers.jsx';
import Settings from './pages/app/Settings.jsx';
import Activation from './pages/app/Activation.jsx';
import Admin from './pages/app/Admin.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { Logo, ToastProvider } from './components/ui.jsx';
import './styles.css';

function SiteNav() {
  const { merchant } = useAuth();
  return (
    <nav className="nav">
      <a href="/" className="nav-logo">
        <Logo />
      </a>
      <div className="nav-links">
        <NavLink to="/docs">Docs</NavLink>
        {merchant ? (
          <NavLink to="/app" className="nav-cta">
            Mon espace
          </NavLink>
        ) : (
          <>
            <NavLink to="/login">Connexion</NavLink>
            <NavLink to="/signup" className="nav-cta">
              Créer un compte
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const bare = pathname.startsWith('/pay/') || pathname.startsWith('/recu/') || pathname.startsWith('/@') || pathname.startsWith('/app') || pathname === '/login' || pathname === '/signup';
  return (
    <>
      {!bare && <SiteNav />}
      <Routes>
        <Route path="/" element={<ToLanding />} />
        <Route path="/pay/:id" element={<Pay />} />
        <Route path="/recu/:id" element={<Recu />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Overview />} />
          <Route path="caisse" element={<Caisse />} />
          <Route path="paiements" element={<Payments />} />
          <Route path="portefeuille" element={<Wallet />} />
          <Route path="epargne" element={<Epargne />} />
          <Route path="liens" element={<Links />} />
          <Route path="developpeurs" element={<Developers />} />
          <Route path="reglages" element={<Settings />} />
          <Route path="activation" element={<Activation />} />
          <Route path="admin" element={<Admin />} />
          <Route path="plus" element={<MoreMenu />} />
        </Route>
        <Route path="*" element={<AtOrHome />} />
      </Routes>
    </>
  );
}

// Les routes /@username ne peuvent pas être déclarées directement (le « @ » n'est pas un paramètre)
function AtOrHome() {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/@([a-z0-9._-]+)\/?$/i);
  return m ? <PublicPay key={m[1]} usernameOverride={m[1]} /> : <ToLanding />;
}

// L'accueil est une page statique servie par la passerelle (accueil.html), hors de l'application React
function ToLanding() {
  useEffect(() => window.location.replace('/'), []);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// Application installable (PWA) : service worker minimal, sans cache agressif
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
