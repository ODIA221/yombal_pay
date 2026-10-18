#!/usr/bin/env bash
# YombalPay : lance tout le projet en une commande (passerelle, boutique, application mobile).
#
#   ./run.sh            installe, construit le front, lance la passerelle (:3000) + la boutique (:4000)
#                       + l'application mobile Expo (QR à scanner avec Expo Go, même Wi-Fi)
#   ./run.sh --no-mobile  même chose sans l'application mobile
#   ./run.sh dev        mode développement : API en --watch (:3000) + Vite (:5173) + boutique (:4000)
#   ./run.sh test       lance les tests de bout en bout (ports 3100/4100, base PostgreSQL locale yombal_pay_test)
#   ./run.sh all        lance les tests puis la démo
#   ./run.sh check      diagnostic de la connexion Bitnob (clés requises dans .env)
#   ./run.sh reconcile  rapprochement comptable : registre ↔ opérations, puis plateforme ↔ compte Bitnob
#   ./run.sh rebuild    force la reconstruction du front puis lance la démo
set -euo pipefail

cd "$(dirname "$0")"
MODE="demo"
NO_MOBILE=0
for arg in "$@"; do
  case "$arg" in
    --no-mobile) NO_MOBILE=1 ;;
    --*) printf 'Option inconnue : %s\n' "$arg" >&2; exit 1 ;;
    *) MODE="$arg" ;;
  esac
done
# « ./run.sh mobile » : ancien nom, l'application mobile fait maintenant partie de la démo
[ "$MODE" = mobile ] && MODE=demo
LOG_DIR=".run-logs"

info() { printf '\033[1;34m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# 1. Node 18+ (charge nvm / Homebrew si node n'est pas dans le PATH)
if ! command -v node >/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi
command -v node >/dev/null || die "Node.js n'est pas installé (version 18+ requise)."
# Un ~/.zshrc qui charge nvm « à la demande » n'expose pas npx à ce script bash
if ! command -v npx >/dev/null; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && { set +u; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; set -u; } || true
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node $NODE_MAJOR détecté, version 18+ requise."
ok "Node $(node -v)"

# 2. Dépendances (seulement si absentes)
for dir in server web shop; do
  if [ ! -d "$dir/node_modules" ]; then
    info "Installation des dépendances de $dir/…"
    npm install --prefix "$dir" --no-audit --no-fund
  fi
done
ok "Dépendances installées"

# 3. Fichier .env (sans clés Bitnob → mode démo)
if [ ! -f .env ]; then
  cp .env.example .env
  ok ".env créé depuis .env.example (mode démo : pas de clés Bitnob)"
fi

# 3 bis. Base de données : Supabase si DATABASE_URL est renseigné, sinon PostgreSQL local
DB_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)}"
ensure_local_db() {
  command -v pg_isready >/dev/null || die "PostgreSQL introuvable. Installez-le (brew install postgresql@15) ou renseignez DATABASE_URL (Supabase) dans .env."
  pg_isready -q || die "PostgreSQL local ne répond pas. Lancez-le (brew services start postgresql@15) ou utilisez Supabase."
  local name="$1"
  psql -lqt | cut -d'|' -f1 | grep -qw "$name" || { createdb "$name" && ok "Base locale « $name » créée"; }
}
if [ -n "$DB_URL" ] && ! echo "$DB_URL" | grep -qE '@?(localhost|127\.0\.0\.1)'; then
  if echo "$DB_URL" | grep -q supabase; then ok "Base de données : Supabase"; else ok "Base de données : PostgreSQL distant"; fi
elif [ "$MODE" != check ]; then
  DB_NAME="${DB_URL##*/}"
  ensure_local_db "${DB_NAME:-yombal_pay}"
  ok "Base de données : PostgreSQL local"
fi

# 4. Libérer un port occupé par une ancienne instance
free_port() {
  local pids
  pids="$(lsof -ti tcp:"$1" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    info "Port $1 occupé, arrêt du processus ($pids)"
    kill $pids 2>/dev/null || true
    sleep 0.5
  fi
}

# 5. Arrêt propre de tous les processus lancés avec Ctrl+C
PIDS=()
cleanup() { [ ${#PIDS[@]} -gt 0 ] && kill "${PIDS[@]}" 2>/dev/null || true; }
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

build_web() {
  if [ "${1:-}" = force ] || [ ! -f web/dist/index.html ]; then
    info "Construction du front React…"
    npm run build --prefix web
  fi
}

# Adresse de l'ordinateur sur le Wi-Fi : c'est par elle que le téléphone joint la passerelle
lan_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || { hostname -I 2>/dev/null | awk '{print $1}'; } || true
}
env_value() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true; }

# Liens vus par le téléphone : si .env pointe vers localhost, la passerelle et la boutique annoncent l'IP du réseau
# local (pages de paiement, reçus, adresse Lightning, retour boutique). Écrit aussi l'adresse dans l'app mobile.
configure_lan() {
  LAN_IP="$(lan_ip)"
  if [ -z "$LAN_IP" ]; then
    printf '\033[1;33m⚠ Aucune adresse IP locale (Wi-Fi / Ethernet) : le test sur téléphone ne fonctionnera pas.\033[0m\n'
    LAN_IP="localhost"
  fi
  local public_url shop_url
  public_url="$(env_value PUBLIC_URL)"
  shop_url="$(env_value SHOP_URL)"
  if [ -z "$public_url" ] || echo "$public_url" | grep -qE '//(localhost|127\.0\.0\.1)'; then export PUBLIC_URL="http://$LAN_IP:3000"; else export PUBLIC_URL="$public_url"; fi
  if [ -z "$shop_url" ] || echo "$shop_url" | grep -qE '//(localhost|127\.0\.0\.1)'; then export SHOP_URL="http://$LAN_IP:4000"; else export SHOP_URL="$shop_url"; fi
  printf '# Écrit par ./run.sh (adresse de la passerelle vue par le téléphone)\nEXPO_PUBLIC_API_URL=http://%s:3000\n' "$LAN_IP" > mobile/.env.local
  ok "Adresse locale : $LAN_IP (écrite dans mobile/.env.local)"
}

# Passerelle et boutique en arrière-plan, journaux dans .run-logs/ (l'écran reste libre pour le QR d'Expo)
start_servers() {
  mkdir -p "$LOG_DIR"
  free_port 3000; free_port 4000
  node server/src/index.js >"$LOG_DIR/server.log" 2>&1 & PIDS+=($!)
  node shop/server.js     >"$LOG_DIR/shop.log"   2>&1 & PIDS+=($!)
  for _ in $(seq 1 40); do
    curl -s -o /dev/null --max-time 1 http://localhost:3000/v1/health && break
    sleep 0.5
  done
  if ! curl -s -o /dev/null --max-time 2 http://localhost:3000/v1/health; then
    tail -20 "$LOG_DIR/server.log" >&2
    die "La passerelle n'a pas démarré (journal : $LOG_DIR/server.log)."
  fi
  ok "Passerelle et boutique démarrées (journaux : $LOG_DIR/server.log, $LOG_DIR/shop.log)"
}

banner() {
  local mode email password key
  mode="$(curl -s --max-time 2 http://localhost:3000/v1/health | grep -q '"mode":"demo"' && echo 'DÉMO (paiements simulés)' || echo 'RÉEL (Bitnob)')"
  email="$(env_value DEMO_MERCHANT_EMAIL)"; password="$(env_value DEMO_MERCHANT_PASSWORD)"; key="$(env_value DEMO_MERCHANT_KEY)"
  cat <<SUMMARY

────────────────────────────────────────────────────────────────
 ⚡ YombalPay est lancé · mode $mode

 Sur cet ordinateur
   Espace marchand : http://localhost:3000/app
   Boutique        : http://localhost:4000
   Documentation   : http://localhost:3000/docs

 Depuis le téléphone (même Wi-Fi)
   Espace marchand : http://${LAN_IP:-localhost}:3000/app
   Page publique   : http://${LAN_IP:-localhost}:3000/@africancostume
   Boutique        : http://${LAN_IP:-localhost}:4000

 Compte marchand de démo
   E-mail          : ${email:-demo@yombalpay.sn}
   Mot de passe    : ${password:-voir le journal $LOG_DIR/server.log}
   Clé API         : ${key:-sk_test_acs_demo_2026}

 Journaux : $LOG_DIR/server.log · $LOG_DIR/shop.log
SUMMARY
  if [ "$NO_MOBILE" = 1 ]; then
    printf ' Ctrl+C arrête tout.\n────────────────────────────────────────────────────────────────\n\n'
  else
    cat <<MOBILE

 📱 Application mobile : ouvrez Expo Go sur le même Wi-Fi et scannez
    le QR ci-dessous (appareil photo sur iPhone). « w » ouvre la version web.
    « Serveur injoignable » ? Autorisez Node dans le pare-feu de macOS.

 Ctrl+C arrête Expo, la passerelle et la boutique.
────────────────────────────────────────────────────────────────

MOBILE
  fi
}

# Expo au premier plan (pas d'exec : le trap arrête la passerelle et la boutique à la sortie)
start_expo() {
  if [ ! -d mobile/node_modules ]; then
    info "Installation des dépendances de mobile/…"
    npm install --prefix mobile --no-audit --no-fund
  fi
  free_port 8081
  (cd mobile && npx expo start --lan)
}

run_demo() {
  configure_lan
  start_servers
  banner
  if [ "$NO_MOBILE" = 1 ]; then
    tail -n 0 -f "$LOG_DIR/server.log" "$LOG_DIR/shop.log" & PIDS+=($!)
    wait
  else
    start_expo
  fi
}

case "$MODE" in
  demo)    build_web;       run_demo ;;
  rebuild) build_web force; run_demo ;;
  dev)
    free_port 3000; free_port 4000; free_port 5173
    node --watch server/src/index.js & PIDS+=($!)
    node shop/server.js              & PIDS+=($!)
    npm run dev --prefix web         & PIDS+=($!)
    sleep 2
    echo; ok "Mode développement : API http://localhost:3000 · Vite http://localhost:5173 · boutique http://localhost:4000"
    wait ;;
  test)
    build_web
    info "Tests de bout en bout…"
    node scripts/e2e.mjs ;;
  all)
    build_web
    info "Tests de bout en bout…"
    node scripts/e2e.mjs || die "Des tests ont échoué."
    run_demo ;;
  check)
    node scripts/bitnob-check.mjs ;;
  reconcile)
    node scripts/reconcile.mjs ;;
  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
