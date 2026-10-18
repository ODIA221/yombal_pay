-- YombalPay : connexion avec Google (SQL Editor > New query > Run). Peut être relancé sans risque.

-- Un compte créé avec Google n'a pas de mot de passe.
alter table public.merchants alter column password_hash drop not null;

-- Identifiant Google stable du compte (champ "sub" de Google).
alter table public.merchants add column if not exists google_sub text unique;
