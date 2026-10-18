-- YombalPay : tables à créer dans Supabase (SQL Editor > New query > coller > Run).
-- Le script peut être relancé sans risque.

-- Paiements créés par les marchands
create table if not exists public.checkouts (
  id              text primary key,
  status          text not null check (status in ('pending', 'paid', 'expired')),
  amount          integer not null check (amount > 0),
  currency        text not null default 'XOF',
  amount_sats     integer not null check (amount_sats > 0),
  rate_btc_xof    bigint not null,
  rate_source     text,
  reference       text,
  description     text,
  return_url      text,
  webhook_url     text,
  base_url        text,
  invoice_id      text not null,
  payment_request text not null,
  payment_hash    text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  paid_at         timestamptz,
  paid_via        text,
  last_checked_at bigint not null default 0
);
create index if not exists checkouts_reference_idx on public.checkouts (reference);
create index if not exists checkouts_invoice_idx on public.checkouts (invoice_id);
create index if not exists checkouts_hash_idx on public.checkouts (payment_hash);
create index if not exists checkouts_created_idx on public.checkouts (created_at desc);

-- Chaque envoi de webhook vers le site du marchand
create table if not exists public.webhook_deliveries (
  id          bigint generated always as identity primary key,
  checkout_id text not null references public.checkouts (id) on delete cascade,
  event_id    text not null,
  type        text not null,
  attempt     integer not null,
  status      integer not null,
  at          timestamptz not null default now()
);
create index if not exists webhook_deliveries_checkout_idx on public.webhook_deliveries (checkout_id);

-- Événements Bitnob déjà traités (anti-doublon)
create table if not exists public.bitnob_events (
  key         text primary key,
  type        text,
  reference   text,
  status      text,
  received_at timestamptz not null default now()
);

-- Commandes de la boutique de démo
create table if not exists public.orders (
  id          text primary key,
  product     text not null,
  name        text not null,
  amount      integer not null,
  status      text not null,
  checkout_id text,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);

-- Sécurité : RLS activée sans aucune règle publique.
-- Seul le serveur YombalPay, avec la clé secrète (service_role), peut lire et écrire.
alter table public.checkouts enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.bitnob_events enable row level security;
alter table public.orders enable row level security;

-- Comptes marchands
create table if not exists public.merchants (
  id             text primary key,
  business_name  text not null,
  email          text not null unique,
  phone          text,
  password_hash  text not null,
  api_key_hash   text not null unique,
  api_key_hint   text not null,
  webhook_secret text not null,
  created_at     timestamptz not null default now()
);
alter table public.merchants enable row level security;

-- Comptes marchands : chaque paiement appartient à un marchand.
alter table public.checkouts add column if not exists merchant_id text references public.merchants (id);
create index if not exists checkouts_merchant_idx on public.checkouts (merchant_id, created_at desc);

-- Connexion avec Google
alter table public.merchants alter column password_hash drop not null;
alter table public.merchants add column if not exists google_sub text unique;

-- Confirmation d'email et vérification des entreprises : voir 004_verification.sql
-- Séparation test / réel : voir 005_modes.sql
