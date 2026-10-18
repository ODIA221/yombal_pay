-- YombalPay : comptes marchands (à lancer après schema.sql, dans SQL Editor > New query > Run).
-- Le script peut être relancé sans risque.

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

-- Chaque paiement appartient à un marchand.
alter table public.checkouts add column if not exists merchant_id text references public.merchants (id);
create index if not exists checkouts_merchant_idx on public.checkouts (merchant_id, created_at desc);
