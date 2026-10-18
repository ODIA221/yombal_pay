import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, realMoney } from './config.js';
import { mailConfigured } from './lib/mailer.js';
import { googleEnabled } from './lib/google.js';
import { migrate, one, pool } from './db/pool.js';
import { api } from './routes/api.js';
import { authRouter } from './routes/auth.js';
import { lnurlRouter } from './routes/lnurl.js';
import { webhookRouter } from './routes/webhooks.js';
import { createCheckout, startPoller } from './lib/payments.js';
import { bitnob } from './lib/bitnob.js';
import { watchLanIp } from './lib/lan.js';
import { seedDemo } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(here, '../../web/dist');
const sdkDir = path.resolve(here, '../../sdk');

const app = express();
app.disable('x-powered-by');
// Seuls les proxys locaux (cloudflared / ngrok) sont dignes de confiance pour X-Forwarded-For
// Derrière un hébergeur (Render, Railway…) : TRUST_PROXY=1 (nombre de proxys), pour lire la vraie IP du client
const trustProxy = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        manifestSrc: ["'self'"],
        workerSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.security.cookieSecure ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // SDK navigateur chargé par les sites marchands
    hsts: config.security.cookieSecure,
  }),
);

// API publique appelable depuis les sites marchands (clé pk_…), jamais avec cookies
app.use('/v1', cors({ origin: true, credentials: false }));

// Webhooks Bitnob : corps brut requis pour vérifier la signature → monté avant tout parseur JSON
app.use('/webhooks', webhookRouter);
app.use('/v1/auth', authRouter);
app.use('/v1', api);
app.use(lnurlRouter);

// Lien de paiement partageable : crée un paiement à la volée puis redirige vers la page hébergée
app.get('/l/:slug', async (req, res) => {
  try {
    const link = await one(
      `UPDATE payment_links SET uses = uses + 1 WHERE slug = $1 AND active RETURNING *, (SELECT row_to_json(m) FROM merchants m WHERE m.id = merchant_id) AS merchant`,
      [req.params.slug],
    );
    if (!link) return res.status(404).send('Lien de paiement introuvable ou désactivé.');
    const { checkout } = await createCheckout(link.merchant, {
      amount: link.amount_xof,
      description: link.description,
      reference: `${link.slug}-${link.uses}`,
      source: 'payment_link',
    });
    res.redirect(302, `/pay/${checkout.id}`);
  } catch (e) {
    if (e.status === 403) return res.status(403).send('Ce marchand ne peut pas encore recevoir de paiements.');
    res.status(502).send('Impossible de créer le paiement pour le moment. Réessayez dans un instant.');
    console.error('Lien de paiement :', e.message);
  }
});

// SDK navigateur : <script src="https://…/sdk/yombalpay.js"></script>
app.get('/sdk/yombalpay.js', (_req, res) => res.type('application/javascript').sendFile(path.join(sdkDir, 'browser.js')));

app.get('/dashboard', (_req, res) => res.redirect(301, '/app'));

// Front React (site, tableau de bord, caisse, pages de paiement) servi par la même origine
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  const spa = (_req, res) => res.sendFile(path.join(webDist, 'index.html'));
  app.get(['/', '/pay/:id', '/recu/:id', '/login', '/signup', '/docs', '/app', '/app/*'], spa);
  app.get(/^\/@[a-z0-9._-]+\/?$/i, spa);
} else {
  app.get('/', (_req, res) =>
    res.send('YombalPay API en marche. Lancez <code>npm run build</code> pour servir le front React, ou <code>npm run dev:web</code>.'),
  );
}

app.use('/v1', (_req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue.' } }));

app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: { code: status >= 500 ? 'server_error' : 'invalid_request', message: status >= 500 && config.isProduction ? 'Erreur interne.' : err.message },
  });
});

process.on('unhandledRejection', (err) => console.error('Promesse rejetée non gérée :', err));

try {
  await migrate();
} catch (err) {
  console.error(`\n❌ PostgreSQL injoignable (${config.databaseUrl.replace(/\/\/[^@]*@/, '//***@')}) : ${err.message}`);
  console.error('   Supabase : vérifiez DATABASE_URL (chaîne « Session pooler », mot de passe de la base).');
  console.error('   Postgres local : lancez Postgres puis  createdb yombal_pay   (ou utilisez ./run.sh)\n');
  process.exit(1);
}
const demo = config.seedDemo ? await seedDemo() : null;

// Adresse qui suit le réseau local : les liens (paiement, reçu, adresse Lightning) restent valides
// quand l'ordinateur change de Wi-Fi pendant la démo
if (config.publicUrlAuto)
  watchLanIp((ip) => {
    const before = config.publicUrl;
    config.publicUrl = `http://${ip}:${config.port}`;
    config.publicHost = new URL(config.publicUrl).host;
    if (before !== config.publicUrl) console.log(`🌐 Adresse locale : ${config.publicUrl}`);
  });

const server = app.listen(config.port, () => {
  console.log(`\n⚡ YombalPay sur ${config.publicUrl}  (port ${config.port})`);
  console.log(`   Mode : ${config.demoMode ? 'DÉMO (factures simulées)' : 'RÉEL, Bitnob ' + config.bitnob.baseUrl}  ·  retraits : ${config.payouts.mode}`);
  console.log(`   Webhook Bitnob à déclarer : ${config.publicUrl}/webhooks/bitnob`);
  // Environnement réel de la clé, tel que Bitnob le déclare (sandbox ou production). Il décide aussi si les
  // entreprises doivent être vérifiées pour encaisser (realMoney) ; sans réponse, on réessaie chaque minute.
  const learnBitnobEnvironment = () =>
    bitnob
      .whoami()
      .then((w) => {
        config.bitnob.environment = w?.environment ?? 'unknown';
        if (w?.environment === 'production') console.warn(`⚠️  Bitnob : clé de PRODUCTION (${w.client_name}) : paiements et retraits réels.`);
        else console.log(`   Bitnob : environnement ${w?.environment ?? 'inconnu'} (${w?.client_name ?? 'compte'}), aucun argent réel en sandbox`);
        if (realMoney()) console.log('   Argent réel : encaissements et retraits réservés aux entreprises vérifiées.');
      })
      .catch((e) => {
        console.warn(`⚠️  Bitnob injoignable : ${e.message} (nouvel essai dans 1 min ; d'ici là, seules les entreprises vérifiées encaissent)`);
        setTimeout(learnBitnobEnvironment, 60_000).unref();
      });
  if (!config.demoMode) learnBitnobEnvironment();
  if (demo) console.log(`   Compte démo : ${demo.email}${demo.password ? ` / mot de passe généré : ${demo.password}` : ' (mot de passe du .env)'}  ·  clé API ${demo.apiKey}`);
  console.log(
    `   E-mails : ${mailConfigured() ? `SMTP ${config.smtp.host}` : 'non envoyés (liens affichés ici)'}  ·  Google : ${googleEnabled() ? 'activé' : 'désactivé'}  ·  administrateurs : ${config.adminEmails.length}`,
  );
  if (!config.demoMode && !config.bitnob.webhookSecret)
    console.warn(
      '⚠️  BITNOB_WEBHOOK_SECRET absent : les paiements seront reconfirmés via l’API Bitnob, mais les événements de retrait non signés seront ignorés.',
    );
  console.log('');
  startPoller();
});

const shutdown = () => server.close(() => pool.end().finally(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
