#!/usr/bin/env bash
# YombalPay : lance tout le projet en une commande.
#
#   ./run.sh          installe, construit le front, lance la passerelle (:3000) + la boutique (:4000)
#   ./run.sh dev      mode développement : API en --watch (:3000) + Vite (:5173) + boutique (:4000)
#   ./run.sh test     lance les tests de bout en bout (ports 3100/4100, base PostgreSQL locale yombal_pay_test)
#   ./run.sh all      lance les tests puis la démo
#   ./run.sh check    diagnostic de la connexion Bitnob (clés requises dans .env)
#   ./run.sh rebuild  force la reconstruction du front puis lance la démo
set -euo pipefail

cd "$(dirname "$0")"
MODE="${1:-demo}"

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
trap cleanup EXIT INT TERM

build_web() {
  if [ "${1:-}" = force ] || [ ! -f web/dist/index.html ]; then
    info "Construction du front React…"
    npm run build --prefix web
  fi
}

banner() {
  echo
  ok "YombalPay est lancé. Ctrl+C pour tout arrêter."
  echo "   🛍  Boutique de démo  : http://localhost:4000"
  echo "   💼 Espace marchand   : http://localhost:3000/app   (compte démo : $(grep -E '^DEMO_MERCHANT_EMAIL=' .env | cut -d= -f2-))"
  echo "   🧾 Caisse            : http://localhost:3000/app/caisse"
  echo "   🌍 Page publique     : http://localhost:3000/@africancostume"
  echo "   📖 Documentation     : http://localhost:3000/docs"
  [ "$MODE" = dev ] && echo "   ⚡ Front Vite (HMR)  : http://localhost:5173"
  echo
}

run_demo() {
  free_port 3000; free_port 4000
  node server/src/index.js & PIDS+=($!)
  node shop/server.js     & PIDS+=($!)
  sleep 1; banner
  wait
}

case "$MODE" in
  demo)    build_web;       run_demo ;;
  rebuild) build_web force; run_demo ;;
  dev)
    free_port 3000; free_port 4000; free_port 5173
    node --watch server/src/index.js & PIDS+=($!)
    node shop/server.js              & PIDS+=($!)
    npm run dev --prefix web         & PIDS+=($!)
    sleep 2; banner
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
  *)
    sed -n '2,10p' "$0"; exit 1 ;;
esac
