# YombalPay

**Encaissez le monde entier en Bitcoin.** YombalPay est une passerelle de paiement Bitcoin Lightning pour les marchands du Sénégal. Le marchand fixe ses prix en FCFA, le client paie en sats depuis n'importe quel pays, et le site du marchand est prévenu par un webhook signé.

Projet réalisé pour le hackathon **Code & Chain Dakar 2026**, sur l'infrastructure [Bitnob](https://bitnob.dev).

## Le problème

- Un client à Paris, Milan ou New York n'a ni Wave ni Orange Money sénégalais, et les cartes internationales coûtent cher.
- Les passerelles Bitcoin existantes sont étrangères et ne parlent pas en FCFA.
- Intégrer directement l'API Bitnob demande de gérer la signature HMAC, la conversion FCFA → sats, les webhooks et les doublons.

YombalPay s'en charge : un appel d'API, une page de paiement hébergée, un webhook.

## Démo en 90 secondes

1. Le client ouvre la **boutique de démo** (`/boutique`) et clique sur « Payer en Bitcoin » pour un article à 5 000 FCFA.
2. La boutique appelle `POST /v1/checkouts`. YombalPay convertit 5 000 FCFA en sats au cours du moment et crée une facture Lightning chez Bitnob.
3. Le client arrive sur la **page de paiement** (`/pay/:id`) : montant en FCFA et en sats, QR Lightning, compte à rebours.
4. Il paie. Bitnob envoie un webhook, YombalPay **confirme le statut auprès de l'API Bitnob**, puis envoie `checkout.paid` signé à la boutique.
5. La commande passe à « Payée » et le paiement apparaît en direct dans le **tableau de bord** (`/dashboard`).

## Démarrage

Prérequis : Node.js 18 ou plus, un compte Bitnob (sandbox) avec l'IP de votre machine autorisée.

```bash
git clone <ce dépôt> yombalpay && cd yombalpay
npm install
cp .env.example .env    # puis remplissez les valeurs (voir ci-dessous)
npm run check:bitnob    # doit afficher « OK, Bitnob accepte la signature »
npm run check:db        # doit afficher les 4 tables Supabase
npm run dev             # http://localhost:3000
```

| Page | Adresse |
|---|---|
| Site vitrine | http://localhost:3000/ |
| Boutique de démo | http://localhost:3000/boutique |
| Créer un compte marchand | http://localhost:3000/inscription |
| Tableau de bord | http://localhost:3000/dashboard (après connexion) |

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `BITNOB_CLIENT_ID`, `BITNOB_CLIENT_SECRET` | Identifiants API Bitnob |
| `BITNOB_BASE_URL` | `https://api.bitnob.com` (le secret choisit sandbox ou production) |
| `BITNOB_SIGNING` | `v2` (doc actuelle) ou `workshop` (guide de l'atelier) |
| `BITNOB_WEBHOOK_SECRET` | Secret des webhooks Bitnob |
| `YOMBAL_SECRET_KEY` | Clé secrète donnée au site marchand (`sk_test_…`) |
| `YOMBAL_WEBHOOK_SECRET` | Secret qui signe les webhooks envoyés aux marchands (`whsec_…`) |
| `YOMBAL_TEST_HELPERS` | `true` affiche « Simuler le paiement » sur les factures testnet |
| `DASHBOARD_PASSWORD` | Mot de passe du compte de démo |
| `SESSION_SECRET` | Signe les cookies de session des marchands |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Projet Supabase et clé secrète (serveur uniquement) |
| `MERCHANT_NAME` | Nom affiché sur la page de paiement |
| `BTC_XOF_FALLBACK` | Taux de secours si le cours en direct est indisponible |

### Recevoir les webhooks Bitnob en local

```bash
npm run tunnel   # cloudflared, donne une adresse https://….trycloudflare.com
```

Dans le tableau de bord Bitnob, déclarez `https://….trycloudflare.com/webhooks/bitnob` comme URL de webhook. L'adresse change à chaque lancement du tunnel.

## Comptes marchands

- **Inscription** (`/inscription`) : nom de l'entreprise, email, mot de passe. Le compte reçoit sa propre clé API (affichée une seule fois) et son secret de webhooks.
- **Connexion** (`/connexion`) : session par cookie signé (HttpOnly, 7 jours). Mots de passe hachés avec scrypt, clés API stockées hachées (SHA-256).
- **Tableau de bord** : chaque marchand ne voit que ses paiements, peut générer une nouvelle clé et afficher son secret de webhooks.
- **Compte de démo** : `demo@yombalpay.sn`, mot de passe `DASHBOARD_PASSWORD`. Il utilise `YOMBAL_SECRET_KEY` et `YOMBAL_WEBHOOK_SECRET`, ce qui fait fonctionner la boutique de démo.

## API

Authentification : `Authorization: Bearer <YOMBAL_SECRET_KEY>` (ou `curl -u <clé>:`).

### Créer un paiement

```bash
curl http://localhost:3000/v1/checkouts \
  -u "$YOMBAL_SECRET_KEY:" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000,
    "currency": "XOF",
    "reference": "commande-1042",
    "description": "Tissu wax, 6 yards",
    "return_url": "https://maboutique.sn/merci",
    "webhook_url": "https://maboutique.sn/hooks/yombalpay"
  }'
```

Réponse :

```json
{
  "id": "chk_f81125f2a800b3ad",
  "object": "checkout",
  "status": "pending",
  "amount": 5000,
  "currency": "XOF",
  "amount_sats": 10513,
  "url": "http://localhost:3000/pay/chk_f81125f2a800b3ad",
  "lightning_invoice": "lntb105130n1p4…",
  "expires_at": "2026-10-17T15:21:05Z",
  "livemode": false
}
```

Redirigez le client vers `url`. La même `reference` renvoie le même paiement tant qu'il n'a pas expiré : un site qui renvoie sa requête ne crée pas de doublon.

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/v1/checkouts` | Créer un paiement en FCFA |
| `GET` | `/v1/checkouts/:id` | Lire un paiement (statut vérifié auprès de Bitnob) |
| `GET` | `/v1/checkouts` | Lister les 100 derniers paiements |
| `POST` | `/v1/checkouts/:id/simulate_payment` | Mode test : marquer payée une facture testnet |
| `GET` | `/pay/:id` | Page de paiement hébergée |
| `POST` | `/webhooks/bitnob` | Réception des événements Bitnob |
| `GET` | `/api/rate` | Cours BTC/FCFA utilisé |

### Webhooks envoyés au marchand

Quand un paiement est confirmé, YombalPay envoie un `POST` à `webhook_url` :

```json
{ "id": "evt_…", "type": "checkout.paid", "data": { "id": "chk_…", "status": "paid", "reference": "commande-1042", "amount": 5000, … } }
```

En-tête `Yombal-Signature: t=<horodatage>,v1=<signature>`, où `signature = HMAC-SHA256(YOMBAL_WEBHOOK_SECRET, t + "." + corps_brut)` en hexadécimal. Vérification en Node.js :

```js
import { verifySignature } from "./src/merchant-webhooks.js";

app.post("/hooks/yombalpay", express.raw({ type: "application/json" }), (req, res) => {
  if (!verifySignature(req.body.toString(), req.get("yombal-signature"), process.env.YOMBAL_WEBHOOK_SECRET)) {
    return res.status(400).end();
  }
  const event = JSON.parse(req.body);
  if (event.type === "checkout.paid") {
    // marquer la commande event.data.reference comme payée
  }
  res.json({ received: true });
});
```

En cas d'échec, l'envoi est retenté 3 fois (après 2 s, 10 s et 30 s).

## Sécurité

- **Requêtes Bitnob signées** en HMAC-SHA256 (`x-auth-client`, `x-auth-timestamp`, `x-auth-nonce`, `x-auth-signature`). Le secret reste côté serveur, `.env` est ignoré par git.
- **Webhooks Bitnob vérifiés** (HMAC-SHA512 du corps brut, `x-bitnob-signature`), puis le statut est **toujours reconfirmé auprès de l'API Bitnob** : un faux webhook ne peut pas marquer un paiement payé.
- **Idempotence** : chaque événement Bitnob n'est traité qu'une fois ; `markPaid` ne s'applique qu'une fois par paiement.
- **Le navigateur ne décide jamais** du statut : la page de paiement interroge le serveur, qui interroge Bitnob.
- **Webhooks marchands signés** avec horodatage (fenêtre de 5 minutes contre le rejeu).

## Base de données

[Supabase](https://supabase.com) (PostgreSQL), via `@supabase/supabase-js` côté serveur.

1. Créez un projet Supabase.
2. Dans **SQL Editor**, collez le contenu de [`supabase/schema.sql`](supabase/schema.sql) et lancez-le (il contient aussi la table `merchants`).
3. Dans **Project Settings > API**, copiez l'URL du projet et la clé `service_role` dans `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
4. `npm run check:db` doit afficher les 5 tables.

| Table | Contenu |
|---|---|
| `checkouts` | Les paiements : montant FCFA et sats, cours utilisé, facture Lightning, statut, dates |
| `webhook_deliveries` | Chaque envoi de webhook au marchand, avec sa tentative et son code HTTP |
| `bitnob_events` | Les événements Bitnob déjà traités, pour ignorer les doublons |
| `orders` | Les commandes de la boutique de démo |
| `merchants` | Les comptes marchands : entreprise, email, mot de passe haché, clé API hachée, secret de webhooks |

La RLS est activée sur toutes les tables sans règle publique : seul le serveur, avec la clé `service_role`, peut lire et écrire. Cette clé ne quitte jamais le serveur.

## Conversion FCFA → sats

Le franc CFA est arrimé à l'euro (1 € = 655,957 FCFA). YombalPay prend le cours BTC/EUR en direct (CoinGecko, mis en cache 60 s), applique la parité fixe, puis arrondit au sat supérieur pour ne jamais sous-facturer. Si le cours est indisponible, `BTC_XOF_FALLBACK` est utilisé.

## Structure

```
src/
  server.js            Routes Express : API, page de paiement, webhooks, tableau de bord
  bitnob.js            Client Bitnob signé (whoami, factures Lightning)
  checkouts.js         Création, statut, idempotence, markPaid
  bitnob-webhooks.js   Vérification et traitement des webhooks Bitnob
  merchant-webhooks.js Envoi et signature des webhooks marchands
  rates.js             Cours BTC/FCFA et conversion en sats
  store.js             Accès à la base Supabase
  demo-shop.js         Boutique de démo, cliente de l'API comme un site externe
  views/               Page de paiement, boutique, tableau de bord
public/                Site vitrine
supabase/schema.sql    Tables à créer dans Supabase
scripts/               check-bitnob, create-invoice
```

## Feuille de route

- Conversion automatique en USDT et retrait vers Wave et Orange Money (payouts Bitnob)
- Liens de paiement partageables sur WhatsApp
- Plugins WooCommerce et Shopify
- Comptes marchands multiples et inscription
- Disponible au Sénégal, bientôt dans tout l'espace UEMOA et dans le reste du monde

## Licence

MIT
