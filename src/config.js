import "dotenv/config";

export const config = {
  port: Number(process.env.PORT) || 3000,
  bitnob: {
    clientId: process.env.BITNOB_CLIENT_ID || "",
    clientSecret: process.env.BITNOB_CLIENT_SECRET || "", // sandbox : paiements test
    // Production : paiements réels. Bitnob utilise le même Client ID, le secret choisit l'environnement.
    liveClientId: process.env.BITNOB_LIVE_CLIENT_ID || process.env.BITNOB_CLIENT_ID || "",
    liveClientSecret: process.env.BITNOB_LIVE_CLIENT_SECRET || "",
    baseUrl: (process.env.BITNOB_BASE_URL || "https://api.bitnob.com").replace(/\/+$/, ""),
    signing: process.env.BITNOB_SIGNING === "workshop" ? "workshop" : "v2",
  },
  btcXofFallback: Number(process.env.BTC_XOF_FALLBACK) || 60_000_000,
  secretKey: process.env.YOMBAL_SECRET_KEY || "",
  bitnobWebhookSecret: process.env.BITNOB_WEBHOOK_SECRET || "",
  merchantWebhookSecret: process.env.YOMBAL_WEBHOOK_SECRET || "",
  testHelpers: process.env.YOMBAL_TEST_HELPERS === "true",
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "",
  sessionSecret: process.env.SESSION_SECRET || "",
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 465,
    user: process.env.SMTP_USER || "",
    pass: (process.env.SMTP_PASS || "").replace(/\s+/g, ""), // Google affiche le mot de passe d'application par groupes de 4
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "",
  },
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  },
  supabase: {
    // NEXT_PUBLIC_SUPABASE_URL est accepté : c'est le nom que propose l'extrait « Next.js » de Supabase.
    url: (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, ""),
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  },
  merchantName: process.env.MERCHANT_NAME || "Boutique de démo",
  checkoutExpirySeconds: 15 * 60,
};

export const liveModeAvailable = () => Boolean(config.bitnob.liveClientId && config.bitnob.liveClientSecret);

export function assertBitnobConfigured(mode = "test") {
  if (mode === "live") {
    if (!liveModeAvailable()) throw new Error("Le mode production n'est pas encore ouvert : BITNOB_LIVE_CLIENT_SECRET est vide dans .env.");
    return;
  }
  const missing = ["clientId", "clientSecret"].filter((k) => !config.bitnob[k]);
  if (missing.length) {
    throw new Error(
      "Identifiants Bitnob manquants : remplissez BITNOB_CLIENT_ID et BITNOB_CLIENT_SECRET dans le fichier .env",
    );
  }
}
