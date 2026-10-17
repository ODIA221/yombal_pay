const nf = new Intl.NumberFormat('fr-FR');

export const num = (n) => nf.format(Math.round(n || 0)).replace(/ | /g, ' ');
export const fcfa = (n) => `${num(n)} FCFA`;
export const sats = (n) => `${num(n)} sats`;
export const usdt = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;

export function timeAgo(iso) {
  if (!iso) return '—';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `il y a ${Math.max(s, 1)} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.round(s / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const dayLabel = (yyyyMmDd) => {
  const d = new Date(`${yyyyMmDd}T12:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);
  if (yyyyMmDd === today) return "Auj.";
  return d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
};

export const STATUS = {
  pending: { label: 'En attente', tone: 'warn' },
  paid: { label: 'Payé', tone: 'ok' },
  expired: { label: 'Expiré', tone: 'muted' },
  delivered: { label: 'Livré', tone: 'ok' },
  retrying: { label: 'Nouvel essai', tone: 'warn' },
  failed: { label: 'Échec', tone: 'bad' },
  processing: { label: 'En cours', tone: 'warn' },
  completed: { label: 'Reçu', tone: 'ok' },
};

export const SOURCE = {
  api: 'Site web (API)',
  pos: 'Caisse',
  dashboard: 'Tableau de bord',
  payment_link: 'Lien de paiement',
  public_page: 'Page publique',
  lightning_address: 'Adresse Lightning',
};

// Numéro sénégalais à 9 chiffres → « 77 123 45 67 »
export const snPhone = (p) => String(p || '').replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
