import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { STATUS } from '../lib/format.js';

export function Bolt({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" />
    </svg>
  );
}

// Icônes au trait (24×24, style cohérent)
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5',
  pos: 'M5 3h14v18H5zM8 7h8M8 11h2M11 11h2M14 11h2M8 14h2M11 14h2M14 14h2M8 17h2M11 17h5',
  list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
  link: 'M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.4M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.3',
  wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2ZM16 14.5h.01',
  code: 'm8 7-5 5 5 5M16 7l5 5-5 5M13.5 4l-3 16',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5.9Z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  out: 'M7 17 17 7M8 7h9v9',
  in: 'M17 7 7 17M16 17H7V8',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-4',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M20 6 9 17l-5-5',
  share: 'M4 12v8h16v-8M16 6l-4-4-4 4M12 2v13',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  phone: 'M7 2h10v20H7zM11 18h2',
  swap: 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  back: 'M15 18l-6-6 6-6',
  external: 'M14 3h7v7M21 3l-9 9M19 14v6H4V5h6',
  key: 'M15 7a4 4 0 1 1-3.9 5H3v3h3v3h3v-3h2.1A4 4 0 0 1 15 7ZM16 10.5h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  backspace: 'M21 5H8l-6 7 6 7h13zM16 9l-5 6M11 9l5 6',
  sound: 'M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

// Logo officiel (brand/logo.png, déclinaisons générées par scripts/brand-assets.py).
// light : version d'origine pour fond clair (reçu, affiche) ; compact : symbole seul.
export function Logo({ compact = false, light = false }) {
  const src = compact ? (light ? '/logo-mark.png' : '/logo-mark-dark.png') : light ? '/logo.png' : '/logo-dark.png';
  return <img className={compact ? 'logo logo-compact' : 'logo'} src={src} alt="YombalPay" draggable="false" />;
}

export function Pill({ status, label }) {
  const s = STATUS[status] || { label: label || status, tone: 'muted' };
  return <span className={`pill ${s.tone}`}>{label || s.label}</span>;
}

export function QR({ value, size = 248, className = 'qr' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!value || !ref.current) return;
    QRCode.toCanvas(ref.current, value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0E0F13', light: '#FFFFFF' } });
  }, [value, size]);
  return <canvas ref={ref} className={className} width={size} height={size} role="img" aria-label="QR code de paiement Lightning" />;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
}

export function CopyButton({ text, label = 'Copier', className = 'btn ghost', icon = true }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await copyText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {icon && <Icon name={done ? 'check' : 'copy'} size={16} />}
      {done ? 'Copié' : label}
    </button>
  );
}

export function useCountdown(iso) {
  const [left, setLeft] = useState(() => (iso ? Date.parse(iso) - Date.now() : 0));
  useEffect(() => {
    if (!iso) return;
    setLeft(Date.parse(iso) - Date.now());
    const t = setInterval(() => setLeft(Date.parse(iso) - Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  const s = Math.max(0, Math.floor(left / 1000));
  return { seconds: s, label: `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` };
}

export function Code({ children, lang }) {
  return (
    <div className="code">
      {lang && <span className="code-lang">{lang}</span>}
      <CopyButton text={children} label="Copier" className="code-copy" icon={false} />
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function Spinner({ small }) {
  return <div className={`spinner ${small ? 'sm' : ''}`} role="status" aria-label="Chargement" />;
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Empty({ icon = 'list', title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

// ── Notifications éphémères ─────────────────────────────────────────────────
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.tone === 'ok' ? <Bolt /> : <Icon name="x" size={16} />} {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// Son « encaissé » généré (aucun fichier audio)
export function playChaChing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
    navigator.vibrate?.([60, 40, 60]);
  } catch {}
}
