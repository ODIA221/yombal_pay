import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import QRCode from "qrcode";
import { config, liveModeAvailable } from "./config.js";
import { BitnobError } from "./bitnob.js";
import { getBtcXofRate, xofToSats } from "./rates.js";
import { createCheckout, getFreshCheckout, markPaid, CheckoutError } from "./checkouts.js";
import { toApi, isTestInvoice } from "./api-format.js";
import { listCheckouts, getCheckout } from "./store.js";
import { verifyBitnobSignature, handleBitnobWebhook } from "./bitnob-webhooks.js";
import { shop } from "./demo-shop.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderPayPage } from "./views/pay.js";
import { renderAuth, renderKeyReveal } from "./views/auth.js";
import { setSession, clearSession, readSession, setSignedCookie, readSignedCookie, clearCookie, signToken, verifyToken } from "./auth.js";
import { sendMail } from "./mailer.js";
import { confirmEmail, welcomeEmail, verificationReceivedEmail, verificationResultEmail } from "./emails.js";
import { renderActivation, renderAdmin } from "./views/activation.js";
import { googleEnabled, googleAuthUrl, googleProfileFromCode, randomToken, GoogleAuthError } from "./google.js";
import {
  ensureDemoMerchant,
  signup,
  signupWithGoogle,
  login,
  loginWithGoogle,
  regenerateApiKey,
  merchantForApiKey,
  getMerchant,
  SignupError,
  DEMO_MERCHANT_ID,
  emailConfirmed,
  confirmMerchantEmail,
  submitVerification,
  pendingVerifications,
  reviewVerification,
  isAdmin,
} from "./merchants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set("trust proxy", true); // derrière ngrok ou cloudflared
// On garde le corps brut : les signatures de webhooks portent sur les octets reçus.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString("utf8"); } }));
app.use(express.static(path.join(__dirname, "..", "public"), { index: "index.html", extensions: ["html"] })); // /docs -> docs.html

const baseUrl = (req) => `${req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`;

function apiError(res, status, type, message) {
  res.status(status).json({ error: { type, message } });
}

function handleError(res, err) {
  if (err instanceof CheckoutError) return apiError(res, err.status, "invalid_request_error", err.message);
  if (err instanceof BitnobError) {
    console.error(err.message, err.data ?? "");
    return apiError(res, 502, "provider_error", err.message);
  }
  console.error(err);
  return apiError(res, 500, "api_error", "Erreur interne.");
}

// Clé secrète du marchand : "Authorization: Bearer sk_..." ou "curl -u sk_...:". Elle identifie le marchand.
async function requireSecretKey(req, res, next) {
  const header = req.get("authorization") || "";
  let key = "";
  if (header.startsWith("Bearer ")) key = header.slice(7).trim();
  else if (header.startsWith("Basic ")) key = Buffer.from(header.slice(6), "base64").toString().split(":")[0];

  const found = await merchantForApiKey(key);
  if (!found) return apiError(res, 401, "authentication_error", "Clé API invalide ou absente.");
  req.merchant = found.merchant;
  req.mode = found.mode; // "test" (sk_test_) ou "live" (sk_live_)
  next();
}

// Un marchand ne voit que ses propres paiements, et seulement ceux du mode de sa clé.
async function ownCheckout(req, fresh = false) {
  const checkout = fresh ? await getFreshCheckout(req.params.id) : await getCheckout(req.params.id);
  const sameMode = checkout && checkout.livemode === (req.mode === "live");
  return checkout && checkout.merchantId === req.merchant.id && sameMode ? checkout : null;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, bitnob: config.bitnob.baseUrl, signing: config.bitnob.signing });
});

app.get("/api/rate", async (_req, res) => {
  const { btcXof, source } = await getBtcXofRate();
  res.json({ btcXof, source, satsFor1000Xof: xofToSats(1000, btcXof) });
});

/* ---------- API développeurs ---------- */

app.post("/v1/checkouts", requireSecretKey, async (req, res) => {
  if (!emailConfirmed(req.merchant)) {
    return apiError(res, 403, "account_error", "Confirmez l'adresse email de votre compte YombalPay avant de créer des paiements.");
  }
  try {
    const checkout = await createCheckout(req.body ?? {}, baseUrl(req), req.merchant, req.mode);
    res.status(201).json(toApi(checkout, baseUrl(req)));
  } catch (err) {
    handleError(res, err);
  }
});

app.get("/v1/checkouts", requireSecretKey, async (req, res) => {
  const all = await listCheckouts(req.merchant.id, 100, req.mode === "live");
  res.json({ object: "list", data: all.map((c) => toApi(c, baseUrl(req))) });
});

app.get("/v1/checkouts/:id", requireSecretKey, async (req, res) => {
  try {
    const checkout = await ownCheckout(req, true);
    if (!checkout) return apiError(res, 404, "invalid_request_error", "Paiement introuvable.");
    res.json(toApi(checkout, baseUrl(req)));
  } catch (err) {
    handleError(res, err);
  }
});

// Outil de test (comme les « test helpers » de Stripe) : marque payée une facture testnet.
app.post("/v1/checkouts/:id/simulate_payment", requireSecretKey, async (req, res) => {
  const checkout = await ownCheckout(req);
  if (!checkout) return apiError(res, 404, "invalid_request_error", "Paiement introuvable.");
  if (!isTestInvoice(checkout)) return apiError(res, 400, "invalid_request_error", "Simulation réservée au mode test.");
  if (checkout.status !== "pending") {
    return apiError(res, 400, "invalid_request_error", checkout.status === "paid" ? "Ce paiement est déjà payé." : "Ce paiement a expiré.");
  }
  await markPaid(checkout, "test_helper");
  res.json(toApi(checkout, baseUrl(req)));
});

/* ---------- Webhooks Bitnob ---------- */

app.post("/webhooks/bitnob", async (req, res) => {
  if (!verifyBitnobSignature(req.rawBody, req.get("x-bitnob-signature"))) {
    const sigHeaders = Object.keys(req.headers).filter((h) => /sign|bitnob|hmac/i.test(h));
    console.warn(
      `[webhook bitnob] refusé : ${!config.bitnobWebhookSecret ? "BITNOB_WEBHOOK_SECRET absent" : "signature invalide"}` +
        ` (en-têtes reçus : ${sigHeaders.join(", ") || "aucun en-tête de signature"})`,
    );
    return res.status(401).json({ error: "Signature invalide" });
  }
  try {
    const result = await handleBitnobWebhook(req.rawBody, req.body);
    console.log(`[webhook bitnob] ${result.type} -> ${result.result}${result.checkout ? " (" + result.checkout + ")" : ""}`);
    res.json({ received: true });
  } catch (err) {
    console.error("[webhook bitnob]", err);
    res.status(500).json({ error: "Traitement impossible" }); // Bitnob réessaiera
  }
});

/* ---------- Page de paiement hébergée ---------- */

app.get("/pay/:id", async (req, res) => {
  try {
    const checkout = await getFreshCheckout(req.params.id);
    if (!checkout) return res.status(404).type("text").send("Paiement introuvable.");
    const qrSvg = await QRCode.toString(`lightning:${checkout.paymentRequest}`.toUpperCase(), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
      color: { dark: "#0A0F0C", light: "#FFFFFF" },
    });
    const showSimulate = config.testHelpers && isTestInvoice(checkout);
    res.set("Cache-Control", "no-store").type("html").send(renderPayPage({ checkout, qrSvg, merchantName: checkout.merchantName || config.merchantName, showSimulate }));
  } catch (err) {
    console.error(err);
    res.status(500).type("text").send("Erreur lors du chargement du paiement.");
  }
});

// Statut public, sans données sensibles, interrogé par la page de paiement.
app.get("/pay/:id/status", async (req, res) => {
  try {
    const checkout = await getFreshCheckout(req.params.id);
    if (!checkout) return res.status(404).json({ status: "not_found" });
    res.set("Cache-Control", "no-store").json({ status: checkout.status, paid_at: checkout.paidAt });
  } catch (err) {
    handleError(res, err);
  }
});

// Bouton « Simuler le paiement » de la page, actif seulement si YOMBAL_TEST_HELPERS=true.
app.post("/pay/:id/simulate", async (req, res) => {
  const checkout = await getCheckout(req.params.id);
  if (!config.testHelpers || !checkout || !isTestInvoice(checkout)) return res.status(404).json({ status: "not_found" });
  if (checkout.status === "pending") await markPaid(checkout, "test_helper");
  res.json({ status: checkout.status });
});

/* ---------- Comptes marchands ---------- */

const form = express.urlencoded({ extended: false, limit: "10kb" });

// Renvoie le marchand de la session, ou null. Si le compte n'existe plus, la session est effacée.
async function sessionMerchant(req, res) {
  const id = readSession(req);
  if (!id) return null;
  const merchant = await getMerchant(id);
  if (!merchant) clearSession(res);
  return merchant;
}

async function requireSession(req, res, next) {
  const merchant = await sessionMerchant(req, res);
  if (!merchant) {
    if (req.path.endsWith(".json")) return res.status(401).json({ error: "Session expirée" });
    return res.redirect(303, "/connexion");
  }
  req.merchant = merchant;
  next();
}

// Qui est connecté ? Utilisé par la page d'accueil pour afficher l'avatar dans la barre de navigation.
app.get("/api/me", async (req, res) => {
  const m = await sessionMerchant(req, res);
  res.set("Cache-Control", "no-store").json(m ? { loggedIn: true, businessName: m.businessName, email: m.email } : { loggedIn: false });
});

/* ---------- Emails de compte ---------- */

const CONFIRM_TTL_MS = 24 * 3_600_000;
const lastResend = new Map(); // anti-abus : un renvoi par minute et par compte

function sendConfirmation(req, merchant) {
  const token = signToken({ id: merchant.id, email: merchant.email, purpose: "confirm" }, CONFIRM_TTL_MS);
  const link = `${baseUrl(req)}/confirmer-email?token=${encodeURIComponent(token)}`;
  return sendMail({ to: merchant.email, ...confirmEmail({ businessName: merchant.businessName, link }) });
}

function sendWelcome(req, merchant) {
  return sendMail({
    to: merchant.email,
    ...welcomeEmail({ businessName: merchant.businessName, dashboardUrl: `${baseUrl(req)}/dashboard`, activationUrl: `${baseUrl(req)}/activation` }),
  });
}

app.get("/confirmer-email", async (req, res) => {
  const data = verifyToken(req.query.token);
  if (!data || data.purpose !== "confirm") {
    return res.status(400).type("html").send(renderAuth({ mode: "login", error: "Ce lien de confirmation est invalide ou a expiré. Connectez-vous pour en recevoir un nouveau.", googleEnabled: googleEnabled() }));
  }
  const result = await confirmMerchantEmail(data.id, data.email);
  if (!result) return res.redirect(303, "/connexion");
  if (result.firstTime) sendWelcome(req, result.merchant);
  setSession(req, res, result.merchant.id);
  res.redirect(303, `/dashboard?ok=${encodeURIComponent("Adresse email confirmée. Vous pouvez créer vos premiers paiements.")}`);
});

app.post("/dashboard/renvoyer-email", requireSession, async (req, res) => {
  const m = req.merchant;
  if (emailConfirmed(m)) return res.redirect(303, "/dashboard");
  if (Date.now() - (lastResend.get(m.id) || 0) < 60_000) {
    return res.redirect(303, `/dashboard?erreur=${encodeURIComponent("Un email vient d'être envoyé. Patientez une minute avant d'en demander un autre.")}`);
  }
  lastResend.set(m.id, Date.now());
  await sendConfirmation(req, m);
  res.redirect(303, `/dashboard?ok=${encodeURIComponent(`Email de confirmation renvoyé à ${m.email}.`)}`);
});

/* ---------- Activation du compte (vérification de l'entreprise) ---------- */

app.get("/activation", requireSession, (req, res) => {
  res.set("Cache-Control", "no-store").type("html").send(renderActivation({ merchant: req.merchant }));
});

app.post("/activation", requireSession, form, async (req, res) => {
  const m = req.merchant;
  if (m.verificationStatus === undefined) {
    return res.status(503).type("text").send("La vérification des entreprises n'est pas encore installée : lancez supabase/004_verification.sql.");
  }
  if (m.verificationStatus === "pending" || m.verificationStatus === "verified") return res.redirect(303, "/activation");
  const result = await submitVerification(m, req.body ?? {});
  if (result.errors) {
    return res.status(400).type("html").send(renderActivation({ merchant: m, errors: result.errors, values: result.values }));
  }
  console.log(`[vérification] demande d'activation de ${m.id} (${m.legalName})`);
  sendMail({ to: m.email, ...verificationReceivedEmail({ businessName: m.businessName }) });
  for (const admin of config.adminEmails) {
    sendMail({
      to: admin,
      subject: `Nouvelle demande d'activation : ${m.legalName}`,
      html: `<p>${m.legalName} (${m.email}) demande l'activation. <a href="${baseUrl(req)}/admin">Vérifier la demande</a></p>`,
      text: `${m.legalName} (${m.email}) demande l'activation : ${baseUrl(req)}/admin`,
      link: `${baseUrl(req)}/admin`,
    });
  }
  res.redirect(303, "/activation");
});

/* ---------- Administration YombalPay ---------- */

function requireAdmin(req, res, next) {
  if (!isAdmin(req.merchant)) return res.status(403).type("text").send("Accès réservé aux administrateurs YombalPay.");
  next();
}

app.get("/admin", requireSession, requireAdmin, async (req, res) => {
  const notice = typeof req.query.ok === "string" ? req.query.ok.slice(0, 200) : "";
  res.set("Cache-Control", "no-store").type("html").send(renderAdmin({ pending: await pendingVerifications(), notice }));
});

app.post("/admin/verifications/:id", requireSession, requireAdmin, form, async (req, res) => {
  const approve = req.body?.decision === "approve";
  const m = await reviewVerification(req.params.id, approve, req.body?.note);
  if (!m) return res.redirect(303, "/admin");
  console.log(`[vérification] ${m.id} ${approve ? "approuvé" : "refusé"} par ${req.merchant.email}`);
  sendMail({
    to: m.email,
    ...verificationResultEmail({
      businessName: m.businessName,
      approved: approve,
      note: m.verificationNote,
      dashboardUrl: `${baseUrl(req)}/dashboard`,
      activationUrl: `${baseUrl(req)}/activation`,
    }),
  });
  res.redirect(303, `/admin?ok=${encodeURIComponent(`${m.legalName} : ${approve ? "approuvé" : "refusé"}. Le marchand a été prévenu par email.`)}`);
});

app.get("/inscription", async (req, res) => {
  if (await sessionMerchant(req, res)) return res.redirect(303, "/dashboard");
  res.type("html").send(renderAuth({ mode: "signup", googleEnabled: googleEnabled() }));
});

app.post("/inscription", form, async (req, res) => {
  try {
    const { merchant, apiKey } = await signup(req.body ?? {});
    setSession(req, res, merchant.id);
    console.log(`[compte] nouveau marchand ${merchant.id} (${merchant.businessName})`);
    lastResend.set(merchant.id, Date.now());
    sendConfirmation(req, merchant);
    res.set("Cache-Control", "no-store").type("html").send(
      renderKeyReveal({
        merchant,
        apiKey,
        title: `Bienvenue, ${merchant.businessName}`,
        intro: "Votre compte marchand est créé. Voici vos identifiants pour intégrer YombalPay à votre site.",
        emailSentTo: merchant.email,
      }),
    );
  } catch (err) {
    if (!(err instanceof SignupError)) throw err;
    const { businessName, email, phone } = req.body ?? {};
    res.status(400).type("html").send(renderAuth({ mode: "signup", error: err.message, values: { businessName, email, phone }, googleEnabled: googleEnabled() }));
  }
});

app.get("/connexion", async (req, res) => {
  if (await sessionMerchant(req, res)) return res.redirect(303, "/dashboard");
  res.type("html").send(renderAuth({ mode: "login", googleEnabled: googleEnabled() }));
});

app.post("/connexion", form, async (req, res) => {
  const merchant = await login(req.body?.email, req.body?.password);
  if (!merchant) {
    return res
      .status(401)
      .type("html")
      .send(renderAuth({ mode: "login", error: "Email ou mot de passe incorrect.", values: { email: req.body?.email }, googleEnabled: googleEnabled() }));
  }
  setSession(req, res, merchant.id);
  res.redirect(303, "/dashboard");
});

/* ---------- Connexion avec Google ---------- */

const googleRedirectUri = (req) => `${baseUrl(req)}/auth/google/callback`;
const loginError = (req, res, message) =>
  res.status(400).type("html").send(renderAuth({ mode: "login", error: message, googleEnabled: googleEnabled() }));

app.get("/auth/google", (req, res) => {
  if (!googleEnabled()) return loginError(req, res, "La connexion avec Google n'est pas encore configurée.");
  const state = randomToken();
  const nonce = randomToken();
  setSignedCookie(req, res, "yp_oauth", { state, nonce }, 10 * 60_000);
  res.redirect(303, googleAuthUrl({ redirectUri: googleRedirectUri(req), state, nonce }));
});

app.get("/auth/google/callback", async (req, res) => {
  const pending = readSignedCookie(req, "yp_oauth");
  clearCookie(res, "yp_oauth");
  if (req.query.error) return loginError(req, res, "Connexion Google annulée.");
  if (!pending || !req.query.code || req.query.state !== pending.state) {
    return loginError(req, res, "La connexion Google a expiré. Réessayez.");
  }
  try {
    const profile = await googleProfileFromCode({ code: String(req.query.code), redirectUri: googleRedirectUri(req), nonce: pending.nonce });
    const merchant = await loginWithGoogle(profile);
    if (merchant) {
      setSession(req, res, merchant.id);
      return res.redirect(303, "/dashboard");
    }
    // Nouveau marchand : on garde son profil Google 15 minutes, le temps qu'il nomme son entreprise.
    setSignedCookie(req, res, "yp_google", profile, 15 * 60_000);
    res.redirect(303, "/inscription/google");
  } catch (err) {
    if (!(err instanceof GoogleAuthError)) throw err;
    loginError(req, res, err.message);
  }
});

app.get("/inscription/google", (req, res) => {
  const profile = readSignedCookie(req, "yp_google");
  if (!profile) return res.redirect(303, "/inscription");
  res.type("html").send(renderAuth({ mode: "google", values: { email: profile.email } }));
});

app.post("/inscription/google", form, async (req, res) => {
  const profile = readSignedCookie(req, "yp_google");
  if (!profile) return res.redirect(303, "/inscription");
  try {
    const { merchant, apiKey } = await signupWithGoogle(profile, req.body ?? {});
    clearCookie(res, "yp_google");
    setSession(req, res, merchant.id);
    console.log(`[compte] nouveau marchand ${merchant.id} (${merchant.businessName}, via Google)`);
    sendWelcome(req, merchant);
    res.set("Cache-Control", "no-store").type("html").send(
      renderKeyReveal({
        merchant,
        apiKey,
        title: `Bienvenue, ${merchant.businessName}`,
        intro: "Votre compte marchand est prêt. Voici vos identifiants pour intégrer YombalPay à votre site.",
        googleEmail: merchant.email,
      }),
    );
  } catch (err) {
    if (!(err instanceof SignupError)) throw err;
    const { businessName, phone } = req.body ?? {};
    res.status(400).type("html").send(renderAuth({ mode: "google", error: err.message, values: { email: profile.email, businessName, phone } }));
  }
});

app.post("/deconnexion", (_req, res) => {
  clearSession(res);
  res.redirect(303, "/connexion");
});

/* ---------- Tableau de bord marchand ---------- */

const dashMode = (req) => (req.query.mode === "live" || req.body?.mode === "live" ? "live" : "test");
const dashUrl = (mode, params = "") => `/dashboard${mode === "live" ? "?mode=live" + (params ? "&" + params : "") : params ? "?" + params : ""}`;

app.get("/dashboard", requireSession, (req, res) => {
  const m = req.merchant;
  res.set("Cache-Control", "no-store").type("html").send(
    renderDashboard({
      merchant: m,
      mode: dashMode(req),
      liveAvailable: liveModeAvailable(),
      apiBase: baseUrl(req),
      isDemo: m.id === DEMO_MERCHANT_ID,
      emailOk: emailConfirmed(m),
      admin: isAdmin(m),
      notice: typeof req.query.ok === "string" ? req.query.ok.slice(0, 200) : "",
      error: typeof req.query.erreur === "string" ? req.query.erreur.slice(0, 200) : "",
    }),
  );
});

// « Encaisser maintenant » : le marchand crée un paiement sans site web et montre le QR à son client.
app.post("/dashboard/paiements", requireSession, form, async (req, res) => {
  const mode = dashMode(req);
  if (!emailConfirmed(req.merchant)) {
    return res.redirect(303, dashUrl(mode, `erreur=${encodeURIComponent("Confirmez d'abord votre adresse email : cliquez sur le lien que nous vous avons envoyé.")}`));
  }
  try {
    const amount = Number(String(req.body?.amount ?? "").replace(/\D/g, ""));
    const checkout = await createCheckout(
      { amount, currency: "XOF", description: req.body?.description || "Paiement en boutique" },
      baseUrl(req),
      req.merchant,
      mode,
    );
    res.redirect(303, `/pay/${checkout.id}`);
  } catch (err) {
    if (!(err instanceof CheckoutError) && !(err instanceof BitnobError)) throw err;
    let message = err.message;
    if (err instanceof BitnobError) {
      console.error(`[encaisser] ${err.message}`);
      message =
        err.status === 503 && mode === "live"
          ? "Le mode production n'est pas encore ouvert sur YombalPay. Utilisez le mode test en attendant."
          : "Le service de paiement Lightning ne répond pas pour l'instant. Réessayez dans un moment.";
    } else if (/^amount/.test(message)) {
      message = "Indiquez un montant d'au moins 50 FCFA.";
    }
    res.redirect(303, dashUrl(mode, `erreur=${encodeURIComponent(message)}`) + "#encaisser");
  }
});

app.post("/dashboard/cle", requireSession, form, async (req, res) => {
  const mode = dashMode(req);
  const hadLiveKey = Boolean(req.merchant.liveApiKeyHint);
  try {
    const apiKey = await regenerateApiKey(req.merchant, mode);
    res.set("Cache-Control", "no-store").type("html").send(
      renderKeyReveal({
        merchant: req.merchant,
        apiKey,
        live: mode === "live",
        title: mode === "live" ? (hadLiveKey ? "Nouvelle clé de production" : "Votre clé de production") : "Nouvelle clé API de test",
        intro:
          mode === "live"
            ? "Avec cette clé, les paiements sont réels : de vrais sats, versés sur votre compte. Gardez-la uniquement sur votre serveur." +
              (hadLiveKey ? " Votre ancienne clé de production ne fonctionne plus." : "")
            : "Votre ancienne clé de test ne fonctionne plus. Remplacez-la par celle-ci sur votre serveur.",
      }),
    );
  } catch (err) {
    if (!(err instanceof SignupError)) throw err;
    res.redirect(303, dashUrl(mode, `erreur=${encodeURIComponent(err.message)}`) + "#developpeurs");
  }
});

app.get("/dashboard/data.json", requireSession, async (req, res) => {
  const now = Date.now();
  const checkouts = (await listCheckouts(req.merchant.id, 200, dashMode(req) === "live")).map((c) => ({
    ...toApi(c, baseUrl(req)),
    // Un paiement en attente dont la facture a expiré s'affiche comme expiré, sans appel à Bitnob.
    status: c.status === "pending" && Date.parse(c.expiresAt) < now ? "expired" : c.status,
    paid_via: c.paidVia ?? null,
    deliveries: c.deliveries ?? [],
  }));
  const paid = checkouts.filter((c) => c.status === "paid");
  res.set("Cache-Control", "no-store").json({
    summary: {
      count: checkouts.length,
      paidCount: paid.length,
      pendingCount: checkouts.filter((c) => c.status === "pending").length,
      totalXof: paid.reduce((t, c) => t + c.amount, 0),
      totalSats: paid.reduce((t, c) => t + c.amount_sats, 0),
    },
    checkouts: checkouts.slice(0, 200),
  });
});

/* ---------- Boutique de démo (site marchand) ---------- */

app.use("/boutique", shop);

// Dernier filet : Express 5 transmet ici les erreurs des routes async, le serveur ne s'arrête pas.
app.use((err, req, res, _next) => {
  console.error(`[erreur] ${req.method} ${req.path} : ${err.message}`);
  if (res.headersSent) return;
  if (req.path.startsWith("/v1/") || req.path.startsWith("/webhooks/") || req.accepts(["html", "json"]) === "json") {
    return apiError(res, 500, "api_error", "Service momentanément indisponible. Réessayez dans un instant.");
  }
  res.status(500).type("text").send("Service momentanément indisponible. Réessayez dans un instant.");
});

if (!config.sessionSecret) throw new Error("SESSION_SECRET n'est pas défini dans .env.");

try {
  await ensureDemoMerchant();
} catch (err) {
  console.error(`[compte] compte de démo non créé : ${err.message}`);
  console.error("         Avez-vous lancé supabase/002_merchants.sql dans Supabase ?");
}

app.listen(config.port, () => {
  console.log(`YombalPay écoute sur http://localhost:${config.port}`);
});
