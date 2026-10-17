-- YombalPay : schéma PostgreSQL (idempotent : exécuté à chaque démarrage)

CREATE TABLE IF NOT EXISTS merchants (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  username         text NOT NULL UNIQUE,              -- adresse Lightning : username@domaine, page publique /@username
  email            text NOT NULL UNIQUE,              -- toujours en minuscules
  password_hash    text NOT NULL,                     -- scrypt
  phone            text,
  webhook_url      text,
  webhook_secret   text NOT NULL,
  publishable_key  text NOT NULL UNIQUE,              -- pk_… : publique par nature
  fee_bps          integer NOT NULL DEFAULT 100,      -- commission YombalPay (100 = 1 %)
  auto_convert_pct integer NOT NULL DEFAULT 0 CHECK (auto_convert_pct BETWEEN 0 AND 100),
  payout_network   text,                              -- wave | orange_money | free_money
  payout_phone     text,
  payout_name      text,
  is_demo          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Clés secrètes : seul le hash SHA-256 est stocké, la clé n'est affichée qu'une fois
CREATE TABLE IF NOT EXISTS api_keys (
  id           text PRIMARY KEY,
  merchant_id  text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  label        text NOT NULL DEFAULT 'Clé secrète',
  prefix       text NOT NULL,                         -- ex. sk_live_ab12… pour l'affichage
  key_hash     text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

-- Sessions du tableau de bord : seul le hash du jeton (cookie HttpOnly) est stocké
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_merchant_idx ON sessions(merchant_id);

CREATE TABLE IF NOT EXISTS checkouts (
  id               text PRIMARY KEY,
  merchant_id      text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  reference        text NOT NULL,
  bitnob_reference text NOT NULL UNIQUE,
  description      text NOT NULL,
  amount_xof       bigint NOT NULL CHECK (amount_xof > 0),
  amount_sats      bigint NOT NULL CHECK (amount_sats > 0),
  fee_sats         bigint NOT NULL DEFAULT 0,
  xof_per_btc      bigint NOT NULL,
  rate_source      text NOT NULL,
  rate_fixed       boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired')),
  invoice_id       text,
  invoice_request  text,
  payment_hash     text,
  expires_at       timestamptz NOT NULL,
  return_url       text,
  webhook_url      text,
  customer_email   text,
  payer_note       text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source           text NOT NULL DEFAULT 'api',       -- api | pos | payment_link | public_page | lightning_address
  demo             boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  confirmed_by     text,
  preimage         text,
  UNIQUE (merchant_id, reference)
);
CREATE INDEX IF NOT EXISTS checkouts_merchant_idx ON checkouts(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS checkouts_pending_idx ON checkouts(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS checkouts_invoice_idx ON checkouts(invoice_id);
CREATE INDEX IF NOT EXISTS checkouts_hash_idx ON checkouts(payment_hash);

CREATE TABLE IF NOT EXISTS payment_links (
  id          text PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  merchant_id text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  amount_xof  bigint NOT NULL,
  description text NOT NULL,
  uses        integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deliveries (
  id               text PRIMARY KEY,
  merchant_id      text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  checkout_id      text NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  type             text NOT NULL,
  url              text NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  attempts         integer NOT NULL DEFAULT 0,
  last_status_code integer,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz
);
CREATE INDEX IF NOT EXISTS deliveries_merchant_idx ON deliveries(merchant_id, created_at DESC);

-- Idempotence des webhooks Bitnob
CREATE TABLE IF NOT EXISTS processed_events (
  key        text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id              text PRIMARY KEY,
  merchant_id     text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  reference       text NOT NULL UNIQUE,
  amount_xof      bigint NOT NULL CHECK (amount_xof > 0),
  source_asset    text NOT NULL CHECK (source_asset IN ('BTC', 'USDT')),
  source_amount   bigint NOT NULL,                    -- sats (BTC) ou micro-USDT (USDT)
  network         text NOT NULL,
  phone           text NOT NULL,
  account_name    text NOT NULL,
  provider        text NOT NULL,                      -- bitnob | simulated
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  bitnob_quote_id text,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);
CREATE INDEX IF NOT EXISTS payouts_merchant_idx ON payouts(merchant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversions (
  id              text PRIMARY KEY,
  merchant_id     text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  sats            bigint NOT NULL CHECK (sats > 0),
  usdt_micro      bigint NOT NULL CHECK (usdt_micro > 0),
  price_usdt      double precision NOT NULL,          -- prix d'1 BTC en USDT
  provider        text NOT NULL,                      -- bitnob | simulated
  bitnob_order_id text,
  trigger         text NOT NULL DEFAULT 'manual',     -- manual | auto
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Registre comptable en partie simple : le solde = somme des écritures (jamais modifié, seulement ajouté)
-- asset BTC → montant en sats ; asset USDT → montant en micro-USDT (1e-6)
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            bigserial PRIMARY KEY,
  merchant_id   text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  asset         text NOT NULL CHECK (asset IN ('BTC', 'USDT')),
  amount        bigint NOT NULL,
  type          text NOT NULL,                        -- payment | fee | conversion_out | conversion_in | payout | payout_reversal
  checkout_id   text REFERENCES checkouts(id),
  payout_id     text REFERENCES payouts(id),
  conversion_id text REFERENCES conversions(id),
  description   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_merchant_idx ON ledger_entries(merchant_id, created_at DESC);
-- Une seule écriture de chaque type par paiement / retrait : impossible de créditer deux fois
CREATE UNIQUE INDEX IF NOT EXISTS ledger_once_checkout ON ledger_entries(type, checkout_id) WHERE checkout_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ledger_once_payout ON ledger_entries(type, payout_id) WHERE payout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  merchant_id text REFERENCES merchants(id) ON DELETE CASCADE,
  action      text NOT NULL,
  ip          text,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_merchant_idx ON audit_log(merchant_id, created_at DESC);

-- Supabase expose le schéma public via son API REST (clé anon) : on active le RLS sans aucune politique,
-- donc personne d'autre que le serveur YombalPay (propriétaire des tables) ne peut lire ou écrire.
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ── v2 : équipe (caissiers) et retraits automatiques ─────────────────────────
CREATE TABLE IF NOT EXISTS staff (
  id            text PRIMARY KEY,
  merchant_id   text NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'cashier' CHECK (role IN ('cashier')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);
CREATE INDEX IF NOT EXISTS staff_merchant_idx ON staff(merchant_id);
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS staff_id text REFERENCES staff(id) ON DELETE CASCADE;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS staff_id text REFERENCES staff(id) ON DELETE SET NULL;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS auto_payout_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS auto_payout_min_xof bigint NOT NULL DEFAULT 10000;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS trigger text NOT NULL DEFAULT 'manual';

-- ── v3 : argent de démo séparé de l'argent réel ─────────────────────────────
-- Les écritures nées en mode démo (paiements simulés, conversions et retraits simulés) sont marquées :
-- en mode réel, elles ne comptent pas dans le solde, donc impossible de retirer de vrais FCFA avec.
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS demo boolean NOT NULL DEFAULT false;
UPDATE ledger_entries l SET demo = true FROM checkouts c WHERE l.checkout_id = c.id AND c.demo AND NOT l.demo;
UPDATE ledger_entries l SET demo = true FROM conversions v WHERE l.conversion_id = v.id AND v.provider = 'simulated' AND NOT l.demo;
UPDATE ledger_entries l SET demo = true FROM payouts p WHERE l.payout_id = p.id AND p.provider = 'simulated' AND NOT l.demo;

-- ── v4 : paiement en stablecoins (USDT / USDC) via les adresses de dépôt Bitnob ───────────
-- Une adresse par paiement et par réseau : le dépôt est rattaché au paiement sans ambiguïté.
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS pay_asset text NOT NULL DEFAULT 'BTC';
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS usdt_amount_micro bigint;
ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS usdt_received_micro bigint;
CREATE TABLE IF NOT EXISTS checkout_addresses (
  address     text PRIMARY KEY,
  checkout_id text NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  chain       text NOT NULL,
  bitnob_id   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checkout_id, chain)
);
-- Dépôts reçus (idempotence par transaction Bitnob)
CREATE TABLE IF NOT EXISTS deposits (
  transaction_id text PRIMARY KEY,
  checkout_id    text NOT NULL REFERENCES checkouts(id) ON DELETE CASCADE,
  address        text NOT NULL,
  chain          text NOT NULL,
  currency       text NOT NULL,
  amount_micro   bigint NOT NULL CHECK (amount_micro > 0),
  hash           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deposits_checkout_idx ON deposits(checkout_id);
ALTER TABLE checkout_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
