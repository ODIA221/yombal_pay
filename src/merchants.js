import crypto from "node:crypto";
import { config } from "./config.js";
import { hashPassword, verifyPassword, hashApiKey, newApiKey, newWebhookSecret, newMerchantId, keyHint } from "./auth.js";
import {
  createMerchant,
  saveMerchant,
  getMerchant,
  getMerchantByEmail,
  getMerchantByApiKeyHash,
  getMerchantByGoogleSub,
  adoptOrphanCheckouts,
  listMerchantsByStatus,
} from "./store.js";

export const DEMO_MERCHANT_ID = "mer_demo";
export const DEMO_EMAIL = "demo@yombalpay.sn";

export class SignupError extends Error {}

// Le compte de démo utilise les valeurs de .env, pour que la boutique de démo continue de fonctionner.
export async function ensureDemoMerchant() {
  if (!config.secretKey || !config.dashboardPassword) return;
  const existing = await getMerchant(DEMO_MERCHANT_ID);
  const demo = {
    id: DEMO_MERCHANT_ID,
    businessName: config.merchantName,
    email: DEMO_EMAIL,
    phone: null,
    passwordHash:
      existing && verifyPassword(config.dashboardPassword, existing.passwordHash) ? existing.passwordHash : hashPassword(config.dashboardPassword),
    apiKeyHash: hashApiKey(config.secretKey),
    apiKeyHint: keyHint(config.secretKey),
    webhookSecret: config.merchantWebhookSecret,
  };
  // Le compte de démo est considéré comme vérifié (une fois 004_verification.sql lancé).
  if (existing && existing.verificationStatus !== undefined) {
    demo.emailVerifiedAt = existing.emailVerifiedAt || new Date().toISOString();
    demo.verificationStatus = "verified";
    demo.legalName = existing.legalName || "Boutique de démo YombalPay";
  }
  await saveMerchant(demo);
  await adoptOrphanCheckouts(DEMO_MERCHANT_ID);
}

export async function signup({ businessName, email, phone, password }) {
  businessName = String(businessName || "").trim().slice(0, 80);
  email = String(email || "").trim().toLowerCase();
  phone = String(phone || "").trim().slice(0, 30) || null;
  password = String(password || "");

  if (businessName.length < 2) throw new SignupError("Indiquez le nom de votre entreprise.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SignupError("Cette adresse email n'est pas valide.");
  if (password.length < 8) throw new SignupError("Le mot de passe doit contenir au moins 8 caractères.");

  const apiKey = newApiKey();
  const merchant = {
    id: newMerchantId(),
    businessName,
    email,
    phone,
    passwordHash: hashPassword(password),
    apiKeyHash: hashApiKey(apiKey),
    apiKeyHint: keyHint(apiKey),
    webhookSecret: newWebhookSecret(),
  };
  const created = await createMerchant(merchant);
  if (!created) throw new SignupError("Un compte existe déjà avec cette adresse email. Connectez-vous.");
  return { merchant, apiKey };
}

// Connexion Google : par identifiant Google, sinon par email (le compte existant est alors relié à Google).
export async function loginWithGoogle(profile) {
  const bySub = await getMerchantByGoogleSub(profile.sub);
  if (bySub) return bySub;
  const byEmail = await getMerchantByEmail(profile.email);
  if (!byEmail) return null;
  byEmail.googleSub = profile.sub;
  await saveMerchant(byEmail);
  return byEmail;
}

export async function signupWithGoogle(profile, { businessName, phone }) {
  businessName = String(businessName || "").trim().slice(0, 80);
  if (businessName.length < 2) throw new SignupError("Indiquez le nom de votre entreprise.");
  const apiKey = newApiKey();
  const merchant = {
    id: newMerchantId(),
    businessName,
    email: profile.email,
    phone: String(phone || "").trim().slice(0, 30) || null,
    passwordHash: null,
    apiKeyHash: hashApiKey(apiKey),
    apiKeyHint: keyHint(apiKey),
    webhookSecret: newWebhookSecret(),
    googleSub: profile.sub,
    emailVerifiedAt: new Date().toISOString(), // Google a déjà vérifié cette adresse
  };
  const created = await createMerchant(merchant);
  if (!created) throw new SignupError("Un compte existe déjà avec cette adresse email. Connectez-vous.");
  return { merchant, apiKey };
}

export async function login(email, password) {
  const merchant = await getMerchantByEmail(String(email || "").trim());
  if (!merchant || !verifyPassword(password, merchant.passwordHash)) return null;
  return merchant;
}

// La clé n'est jamais stockée en clair : on la montre une seule fois, à sa création.
// mode "test" : clé sk_test_ ; mode "live" : clé sk_live_, seulement pour une entreprise vérifiée.
export async function regenerateApiKey(merchant, mode = "test") {
  if (mode === "live") {
    if (merchant.verificationStatus !== "verified") {
      throw new SignupError("La clé de production est délivrée après la vérification de votre entreprise.");
    }
    if (merchant.liveApiKeyHint === undefined) throw new SignupError("Lancez d'abord supabase/005_modes.sql.");
    const apiKey = "sk_live_" + crypto.randomBytes(20).toString("hex");
    merchant.liveApiKeyHash = hashApiKey(apiKey);
    merchant.liveApiKeyHint = keyHint(apiKey);
    await saveMerchant(merchant);
    return apiKey;
  }
  if (merchant.id === DEMO_MERCHANT_ID) throw new SignupError("La clé du compte de démo se change dans le fichier .env.");
  const apiKey = newApiKey();
  merchant.apiKeyHash = hashApiKey(apiKey);
  merchant.apiKeyHint = keyHint(apiKey);
  await saveMerchant(merchant);
  return apiKey;
}

// Renvoie { merchant, mode } ou null.
export async function merchantForApiKey(key) {
  if (!key) return null;
  return getMerchantByApiKeyHash(hashApiKey(key));
}

export { getMerchant };

/* ---------- Confirmation d'email ---------- */

export const isAdmin = (m) => Boolean(m && config.adminEmails.includes(String(m.email).toLowerCase()));

// undefined = migration 004 pas encore lancée : on ne bloque rien.
export const emailConfirmed = (m) => m.emailVerifiedAt === undefined || Boolean(m.emailVerifiedAt);

export async function confirmMerchantEmail(id, email) {
  const m = await getMerchant(id);
  if (!m || m.email !== email) return null;
  const firstTime = !m.emailVerifiedAt;
  if (firstTime) {
    m.emailVerifiedAt = new Date().toISOString();
    await saveMerchant(m);
  }
  return { merchant: m, firstTime };
}

/* ---------- Vérification de l'entreprise (KYB) ---------- */

export const LEGAL_FORMS = {
  ei: "Entreprise individuelle",
  suarl: "SUARL",
  sarl: "SARL",
  sa: "SA",
  sas: "SAS",
  gie: "GIE",
  association: "Association",
};
export const SECTORS = {
  ecommerce: "E-commerce, vente en ligne",
  commerce: "Commerce, boutique",
  restauration: "Restauration",
  tourisme: "Hôtellerie, tourisme",
  services: "Services aux entreprises",
  education: "Éducation, formation",
  sante: "Santé, beauté",
  transport: "Transport, logistique",
  association: "ONG, association",
  autre: "Autre",
};
// Pour l'instant, YombalPay ne verse qu'au Sénégal, sur un compte mobile money.
export const PAYOUT_METHODS = { wave: "Wave", orange_money: "Orange Money" };

const clean = (v, max = 120) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// Numéro mobile sénégalais : 9 chiffres commençant par 7, avec ou sans l'indicatif +221.
export function normalizeSnPhone(phone) {
  const digits = String(phone).replace(/\D/g, "").replace(/^00/, "");
  const local = digits.startsWith("221") ? digits.slice(3) : digits;
  return /^7[05678]\d{7}$/.test(local) ? `+221${local}` : null;
}

export async function submitVerification(merchant, input) {
  const v = {
    legalName: clean(input.legalName),
    legalForm: clean(input.legalForm, 20),
    sector: clean(input.sector, 20),
    ninea: clean(input.ninea, 20).toUpperCase().replace(/\s+/g, ""),
    rccm: clean(input.rccm, 40).toUpperCase(),
    representativeName: clean(input.representativeName),
    address: clean(input.address, 200),
    city: clean(input.city, 60),
    payoutMethod: clean(input.payoutMethod, 20),
    payoutAccount: clean(input.payoutAccount, 40),
  };
  const errors = {};
  if (v.legalName.length < 2) errors.legalName = "Indiquez la raison sociale.";
  if (!LEGAL_FORMS[v.legalForm]) errors.legalForm = "Choisissez la forme juridique.";
  if (!SECTORS[v.sector]) errors.sector = "Choisissez votre secteur d'activité.";
  if (!/^\d{7,9}[A-Z0-9]{0,3}$/.test(v.ninea)) errors.ninea = "Le NINEA doit contenir 7 à 9 chiffres, suivis ou non du code de cotation (ex. 0012345 2G3).";
  if (v.rccm && !/^SN[A-Z0-9.\- ]{8,30}$/.test(v.rccm)) errors.rccm = "Le RCCM commence par SN (ex. SN-DKR-2024-B-12345). Laissez vide si vous n'en avez pas.";
  if (!v.rccm) v.rccm = null;
  if (v.representativeName.length < 3) errors.representativeName = "Indiquez le nom du représentant légal.";
  if (v.address.length < 5) errors.address = "Indiquez l'adresse de l'entreprise.";
  if (v.city.length < 2) errors.city = "Indiquez la ville.";
  if (!PAYOUT_METHODS[v.payoutMethod]) {
    errors.payoutMethod = "Choisissez Wave ou Orange Money.";
  } else {
    const phone = normalizeSnPhone(v.payoutAccount);
    if (!phone) errors.payoutAccount = "Indiquez un numéro mobile sénégalais (ex. 77 123 45 67).";
    else v.payoutAccount = phone;
  }
  if (Object.keys(errors).length) return { errors, values: v };

  Object.assign(merchant, v, {
    verificationStatus: "pending",
    verificationSubmittedAt: new Date().toISOString(),
    verificationNote: null,
  });
  await saveMerchant(merchant);
  return { merchant };
}

export const pendingVerifications = () => listMerchantsByStatus("pending");

export async function reviewVerification(id, approve, note) {
  const m = await getMerchant(id);
  if (!m || m.verificationStatus !== "pending") return null;
  m.verificationStatus = approve ? "verified" : "rejected";
  m.verificationNote = approve ? null : clean(note, 300) || "Informations incomplètes ou incorrectes.";
  await saveMerchant(m);
  return m;
}
