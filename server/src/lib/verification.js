// Comptes vérifiés : confirmation de l'e-mail, vérification de l'entreprise (KYB) par un administrateur,
// et règles d'accès qui en découlent (encaisser, retirer).
import { config, realMoney } from '../config.js';
import { many, one } from '../db/pool.js';
import { NETWORKS, normalizeSnPhone } from './payouts.js';
import { signToken, verifyToken } from './signed.js';
import { sendMail } from './mailer.js';
import { confirmEmail, verificationReceivedEmail, verificationRequestEmail, verificationResultEmail, welcomeEmail } from './emails.js';

const CONFIRM_TTL_MS = 24 * 3_600_000;

// Administrateur : adresse listée dans ADMIN_EMAILS ET confirmée. Sans la confirmation, n'importe qui pourrait
// s'inscrire avec l'adresse de l'admin avant lui et obtenir ses droits.
export const isAdmin = (m) => Boolean(m && !m.staff_id && m.email_verified_at && config.adminEmails.includes(String(m.email).toLowerCase()));
export const emailVerified = (m) => Boolean(m?.email_verified_at);

const err = (message, status, code) => Object.assign(new Error(message), { status, code });

// Appelé avant chaque encaissement (API, caisse, page publique, adresse Lightning, lien de paiement)
export function assertCanCollect(m) {
  if (!emailVerified(m)) throw err("Confirmez d'abord l'adresse e-mail du compte : cliquez sur le lien reçu par e-mail.", 403, 'email_unverified');
  if (realMoney() && m.verification_status !== 'verified')
    throw err("Les paiements réels sont réservés aux entreprises vérifiées. Faites vérifier votre entreprise dans l'espace marchand.", 403, 'merchant_unverified');
}

// ── Confirmation de l'e-mail ────────────────────────────────────────────────
export function sendConfirmation(m) {
  const token = signToken({ id: m.id, email: m.email, purpose: 'confirm' }, CONFIRM_TTL_MS);
  const link = `${config.publicUrl}/v1/auth/confirm-email?token=${encodeURIComponent(token)}`;
  return sendMail({ to: m.email, ...confirmEmail({ name: m.name, link }) });
}

// Renvoie { merchant, firstTime } ou null si le lien est invalide, expiré, ou si l'e-mail du compte a changé
export async function confirmEmailToken(token) {
  const data = verifyToken(token);
  if (!data || data.purpose !== 'confirm') return null;
  const before = await one('SELECT email_verified_at FROM merchants WHERE id = $1 AND email = $2', [data.id, data.email]);
  if (!before) return null;
  const m = await one('UPDATE merchants SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1 RETURNING *', [data.id]);
  if (!before.email_verified_at)
    sendMail({ to: m.email, ...welcomeEmail({ name: m.name, appUrl: `${config.publicUrl}/app`, activationUrl: `${config.publicUrl}/app/activation` }) });
  return { merchant: m, firstTime: !before.email_verified_at };
}

// ── Vérification de l'entreprise (KYB) ──────────────────────────────────────
export const LEGAL_FORMS = {
  ei: 'Entreprise individuelle',
  suarl: 'SUARL',
  sarl: 'SARL',
  sa: 'SA',
  sas: 'SAS',
  gie: 'GIE',
  association: 'Association',
};
export const SECTORS = {
  ecommerce: 'E-commerce, vente en ligne',
  commerce: 'Commerce, boutique',
  artisanat: 'Artisanat, couture',
  restauration: 'Restauration',
  tourisme: 'Hôtellerie, tourisme',
  services: 'Services aux entreprises',
  education: 'Éducation, formation',
  sante: 'Santé, beauté',
  transport: 'Transport, logistique',
  association: 'ONG, association',
  autre: 'Autre',
};

const clean = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// Valide le dossier ; renvoie { value } ou { errors: { champ: message } }
export function validateVerification(input = {}) {
  const v = {
    legal_name: clean(input.legal_name),
    legal_form: clean(input.legal_form, 20),
    sector: clean(input.sector, 20),
    ninea: clean(input.ninea, 20).toUpperCase().replace(/\s+/g, ''),
    rccm: clean(input.rccm, 40).toUpperCase() || null,
    representative_name: clean(input.representative_name),
    address: clean(input.address, 200),
    city: clean(input.city, 60),
    payout_network: clean(input.payout_network, 20),
    payout_phone: normalizeSnPhone(input.payout_phone),
  };
  const errors = {};
  if (v.legal_name.length < 2) errors.legal_name = 'Indiquez la raison sociale.';
  if (!LEGAL_FORMS[v.legal_form]) errors.legal_form = 'Choisissez la forme juridique.';
  if (!SECTORS[v.sector]) errors.sector = "Choisissez votre secteur d'activité.";
  if (!/^\d{7,9}[A-Z0-9]{0,3}$/.test(v.ninea)) errors.ninea = 'Le NINEA contient 7 à 9 chiffres, suivis ou non du code de cotation (ex. 0012345 2G3).';
  if (v.rccm && !/^SN[A-Z0-9.\- ]{8,30}$/.test(v.rccm)) errors.rccm = 'Le RCCM commence par SN (ex. SN-DKR-2024-B-12345). Laissez vide si vous n’en avez pas.';
  if (v.representative_name.length < 3) errors.representative_name = 'Indiquez le nom du représentant légal.';
  if (v.address.length < 5) errors.address = "Indiquez l'adresse de l'entreprise.";
  if (v.city.length < 2) errors.city = 'Indiquez la ville.';
  if (!NETWORKS[v.payout_network]) errors.payout_network = 'Choisissez Wave, Orange Money, Free Money ou Expresso.';
  if (!v.payout_phone) errors.payout_phone = 'Indiquez un numéro mobile sénégalais (ex. 77 123 45 67).';
  return Object.keys(errors).length ? { errors } : { value: v };
}

export async function submitVerification(m, input) {
  if (m.verification_status === 'pending') throw err('Votre demande est déjà en cours de vérification.', 409, 'already_pending');
  if (m.verification_status === 'verified') throw err('Votre entreprise est déjà vérifiée.', 409, 'already_verified');
  const r = validateVerification(input);
  if (r.errors) return r;
  const updated = await one(
    `UPDATE merchants SET verification = $2, verification_status = 'pending', verification_submitted_at = now(), verification_note = NULL
     WHERE id = $1 AND verification_status IN ('none', 'rejected') RETURNING *`,
    [m.id, r.value],
  );
  if (!updated) throw err('Votre demande est déjà en cours de vérification.', 409, 'already_pending');
  sendMail({ to: updated.email, ...verificationReceivedEmail({ name: updated.name }) });
  for (const admin of config.adminEmails)
    sendMail({ to: admin, ...verificationRequestEmail({ legalName: r.value.legal_name, email: updated.email, adminUrl: `${config.publicUrl}/app/admin` }) });
  return { merchant: updated };
}

export const listVerifications = (status = 'pending') =>
  many(
    `SELECT id, name, username, email, verification, verification_status, verification_submitted_at, verification_note, created_at
     FROM merchants WHERE verification_status = $1 ORDER BY verification_submitted_at ASC NULLS LAST LIMIT 200`,
    [status],
  );

// Décision d'un administrateur ; null si la demande n'est plus en attente
export async function reviewVerification(id, approve, note) {
  const m = await one(
    `UPDATE merchants SET verification_status = $2, verification_note = $3 WHERE id = $1 AND verification_status = 'pending' RETURNING *`,
    [id, approve ? 'verified' : 'rejected', approve ? null : clean(note, 300) || 'Informations incomplètes ou incorrectes.'],
  );
  if (m)
    sendMail({
      to: m.email,
      ...verificationResultEmail({ name: m.name, approved: approve, note: m.verification_note, appUrl: `${config.publicUrl}/app`, activationUrl: `${config.publicUrl}/app/activation` }),
    });
  return m;
}

// Ce que le marchand voit de son dossier
export const verificationView = (m) => ({
  status: m.verification_status,
  submitted_at: m.verification_submitted_at,
  note: m.verification_note,
  details: m.verification,
  required_for_real_money: realMoney(),
});
