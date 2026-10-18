const nf = new Intl.NumberFormat('fr-FR');

export const num = (n) => nf.format(Math.round(n || 0)).replace(/ | /g, ' ');
export const fcfa = (n) => `${num(n)} FCFA`;
export const usdt = (n) => `${Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ | /g, ' ')} USDT`;

export function timeAgo(iso) {
  if (!iso) return '-';
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.round(s / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export const dateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

export const STATUS = {
  pending: { label: 'En attente', tone: 'warn' },
  paid: { label: 'Payé', tone: 'ok' },
  expired: { label: 'Expiré', tone: 'muted' },
  processing: { label: 'En cours', tone: 'warn' },
  completed: { label: 'Reçu', tone: 'ok' },
  failed: { label: 'Échec', tone: 'bad' },
};

export const SOURCE = {
  api: 'Site web',
  pos: 'Caisse',
  dashboard: 'Tableau de bord',
  payment_link: 'Lien de paiement',
  public_page: 'Page publique',
  lightning_address: 'Adresse Lightning',
};

export const snPhone = (p) => String(p || '').replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4');
