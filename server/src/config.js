import 'dotenv/config';

const port = Number(process.env.PORT) || 3000;
const clientId = process.env.BITNOB_CLIENT_ID || '';
const clientSecret = process.env.BITNOB_CLIENT_SECRET || '';
const publicUrl = (process.env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');
const demoMode = process.env.DEMO_MODE === 'true' || !clientId || !clientSecret;
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  port,
  // URL publique de la passerelle (ngrok / cloudflared en démo). Sert aux liens /pay/:id et à l'adresse Lightning.
  publicUrl,
  publicHost: new URL(publicUrl).host,
  // true : l'adresse publique suit l'IP du réseau local (démo sur téléphone, connexion qui change)
  publicUrlAuto: process.env.PUBLIC_URL_AUTO === 'true',
  isProduction,
  // PostgreSQL local ou Supabase (Project Settings → Database → Connection string, mode « Session pooler »)
  databaseUrl: process.env.DATABASE_URL || 'postgres://localhost:5432/yombal_pay',
  // SSL obligatoire pour Supabase et toute base distante ; désactivé pour une base locale
  databaseSsl: process.env.DATABASE_SSL
    ? process.env.DATABASE_SSL === 'true'
    : !/@?(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || 'postgres://localhost:5432/'),

  bitnob: {
    baseUrl: (process.env.BITNOB_BASE_URL || 'https://api.bitnob.com').replace(/\/$/, ''),
    clientId,
    clientSecret,
    // Secret utilisé par Bitnob pour signer les webhooks (HMAC-SHA512, en-tête x-bitnob-signature)
    webhookSecret: process.env.BITNOB_WEBHOOK_SECRET || '',
    // Même ID client en sandbox et en production : c'est le secret qui choisit l'environnement.
    // Un secret de production commence par « prd: » ; tout autre secret est traité comme sandbox.
    keyEnv: !clientSecret ? 'none' : clientSecret.startsWith('prd:') ? 'production' : 'sandbox',
  },

  // Mode démo : actif si DEMO_MODE=true OU si aucune clé Bitnob n'est fournie.
  // Les factures sont simulées et un bouton « Simuler le paiement » apparaît.
  demoMode,

  security: {
    // Cookie de session « Secure » dès que la passerelle est servie en HTTPS (tunnel, production)
    cookieSecure: publicUrl.startsWith('https://'),
    sessionDays: Number(process.env.SESSION_DAYS) || 7,
    // Webhooks marchands vers localhost / réseau privé : autorisés hors production (boutique de démo locale)
    allowPrivateWebhooks: process.env.ALLOW_PRIVATE_WEBHOOKS ? process.env.ALLOW_PRIVATE_WEBHOOKS === 'true' : !isProduction,
  },

  rates: {
    // 1 USD (≈ 1 USDT) en FCFA, utilisé si Bitnob ne cote pas directement BTC/XOF
    usdToXof: Number(process.env.USD_XOF) || 600,
    // Taux fixe de secours (1 BTC en FCFA), affiché comme tel sur la page de paiement
    fixedXofPerBtc: Number(process.env.FIXED_XOF_PER_BTC) || 48_500_000,
    cacheSeconds: Number(process.env.RATE_CACHE_SECONDS) || 60,
    // Interroger CoinGecko (BTC/EUR × 655,957) si Bitnob ne répond pas
    allowPublicFallback: process.env.RATE_PUBLIC_FALLBACK !== 'false',
  },

  // Commission YombalPay par défaut sur chaque paiement (points de base : 100 = 1 %)
  feeBps: Number(process.env.YOMBALPAY_FEE_BPS ?? 100),
  // Coût d'un envoi d'argent classique vers le Sénégal (points de base), pour le compteur « frais évités ».
  // Banque mondiale, Remittance Prices Worldwide : ≈ 3,5 à 5 % pour 200 € France → Sénégal (8,8 % en moyenne
  // vers l'Afrique subsaharienne). On retient 5 %, prudent pour le couloir sénégalais.
  savingsBenchmarkBps: Number(process.env.SAVINGS_BENCHMARK_BPS) || 500,

  payouts: {
    // auto : simulé en mode démo, Bitnob en mode réel. Forcer « simulated » si le corridor SN n'est pas ouvert.
    mode: (process.env.PAYOUT_MODE || 'auto') === 'auto' ? (demoMode ? 'simulated' : 'bitnob') : process.env.PAYOUT_MODE,
    country: process.env.PAYOUT_COUNTRY || 'SN',
    currency: process.env.PAYOUT_CURRENCY || 'XOF',
    reason: process.env.PAYOUT_REASON || 'vendor_payment',
    minXof: Number(process.env.PAYOUT_MIN_XOF) || 500,
    // Plafond par retrait du corridor SN mobile money chez Bitnob (limits.max_amount)
    maxXof: Number(process.env.PAYOUT_MAX_XOF) || 200_000,
    dailyMaxXof: Number(process.env.PAYOUT_DAILY_MAX_XOF) || 2_000_000,
  },

  // Paiement en stablecoins (USDT / USDC) : réseaux proposés au client (GET /api/stablecoins/supported-chains chez Bitnob)
  usdt: {
    chains: (process.env.USDT_CHAINS || 'tron,bsc,polygon').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    // Bitnob refuse les dépôts de moins de 1 $ : on exige au moins 2 USDT
    minUsdt: Number(process.env.USDT_MIN) || 2,
    // Écart toléré entre le montant attendu et le montant reçu (frais de retrait de certaines plateformes)
    tolerancePct: Number(process.env.USDT_TOLERANCE_PCT ?? 1),
  },

  // Durée de validité d'une facture Lightning (secondes). Le taux est garanti pendant ce temps.
  invoiceExpirySeconds: Number(process.env.INVOICE_EXPIRY_SECONDS) || 900,
  // Vérification serveur des factures en attente (filet de sécurité si un webhook se perd)
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS) || 4000,

  // Marchand de démonstration pré-rempli (boutique de démo + tableau de bord)
  seedDemo: process.env.SEED_DEMO !== 'false',
  demoMerchant: {
    name: process.env.DEMO_MERCHANT_NAME || 'African Costume Shop',
    username: 'africancostume',
    // Identifiants du compte démo : uniquement dans .env (jamais dans le code, le dépôt est public)
    email: process.env.DEMO_MERCHANT_EMAIL || 'demo@yombalpay.sn',
    password: process.env.DEMO_MERCHANT_PASSWORD || '',
    // Code de retrait du compte démo (numéro Wave +221 77 000 00 00)
    payoutPin: process.env.DEMO_MERCHANT_PIN || '2026',
    // Une valeur générée par l'hébergeur (sans préfixe) reçoit « sk_ », comme dans shop/server.js
    apiKey: process.env.DEMO_MERCHANT_KEY ? process.env.DEMO_MERCHANT_KEY.replace(/^(?!sk_)/, 'sk_') : 'sk_test_acs_demo_2026',
    publishableKey: process.env.DEMO_MERCHANT_PK || 'pk_test_acs_demo_2026',
    webhookSecret: process.env.DEMO_MERCHANT_WEBHOOK_SECRET || 'whsec_acs_demo_2026',
    webhookUrl: process.env.DEMO_MERCHANT_WEBHOOK_URL || 'http://localhost:4000/webhooks/yombalpay',
  },
};

// Taux de change officiel et fixe EUR → XOF (garanti par l'accord monétaire UEMOA)
export const EUR_TO_XOF = 655.957;
