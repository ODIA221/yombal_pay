-- YombalPay : séparation du mode test et du mode réel (SQL Editor > New query > Run). Peut être relancé.

-- Chaque marchand a une clé de production, délivrée après vérification de l'entreprise.
alter table public.merchants add column if not exists live_api_key_hash text unique;
alter table public.merchants add column if not exists live_api_key_hint text;

-- Chaque paiement est soit test (Bitcoin testnet), soit réel.
alter table public.checkouts add column if not exists livemode boolean not null default false;
update public.checkouts set livemode = (payment_request not like 'lntb%');
create index if not exists checkouts_merchant_mode_idx on public.checkouts (merchant_id, livemode, created_at desc);
