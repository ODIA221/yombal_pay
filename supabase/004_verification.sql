-- YombalPay : confirmation d'email et vérification des entreprises (KYB).
-- SQL Editor > New query > Run. Peut être relancé sans risque.

alter table public.merchants add column if not exists email_verified_at timestamptz;

alter table public.merchants add column if not exists verification_status text not null default 'none';
alter table public.merchants drop constraint if exists merchants_verification_status_check;
alter table public.merchants add constraint merchants_verification_status_check
  check (verification_status in ('none', 'pending', 'verified', 'rejected'));

alter table public.merchants add column if not exists legal_name text;
alter table public.merchants add column if not exists legal_form text;
alter table public.merchants add column if not exists sector text;
alter table public.merchants add column if not exists ninea text;
alter table public.merchants add column if not exists rccm text;
alter table public.merchants add column if not exists representative_name text;
alter table public.merchants add column if not exists address text;
alter table public.merchants add column if not exists city text;
alter table public.merchants add column if not exists payout_method text;
alter table public.merchants add column if not exists payout_account text;
alter table public.merchants add column if not exists verification_submitted_at timestamptz;
alter table public.merchants add column if not exists verification_note text;

-- Les comptes créés avec Google ont déjà un email vérifié par Google.
update public.merchants set email_verified_at = coalesce(email_verified_at, created_at) where google_sub is not null;
