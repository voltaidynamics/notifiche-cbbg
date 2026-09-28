#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Notifiche Canali Irrigui, script di deploy
#
# Porta app: 8610. La porta PostgreSQL NON è fissata qui: viene letta dal
# DATABASE_URL in .env. PG_PORT serve solo a generare il template di .env alla
# primissima installazione, e si può sovrascrivere:
#
#   PG_PORT=3221 ./deploy.sh
#
# Va lanciato da un terminale interattivo: il menu e i prompt di drizzle-kit
# leggono da stdin (vedi README.md).
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_PORT=8610
PG_PORT="${PG_PORT:-5432}"   # solo per il template .env iniziale
DB_NAME="notifichepozzi"
DB_USER="npozzi"
ENV_FILE="$APP_DIR/.env"
SERVICE_NAME="notifichepozzi"

# ---- colori ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
heading() { echo -e "\n${CYAN}--- $* ---${NC}"; }

# =============================================================================
# Funzioni
# =============================================================================

check_deps() {
  heading "Verifico dipendenze di sistema"
  command -v node  >/dev/null 2>&1 || error "Node.js non trovato. Installa Node.js 20+."
  command -v npm   >/dev/null 2>&1 || error "npm non trovato."
  command -v psql  >/dev/null 2>&1 || error "psql non trovato. Installa postgresql-client."
  command -v pg_isready >/dev/null 2>&1 || true

  # pg_dump serve al backup notturno: senza, l'installazione sembra riuscita ma
  # il backup delle 22:30 fallirebbe ogni sera in silenzio.
  command -v pg_dump >/dev/null 2>&1 || warn "pg_dump non trovato: il backup automatico non funzionerà. Installa postgresql-client."
  command -v crontab >/dev/null 2>&1 || warn "crontab non trovato: impossibile schedulare il backup. Installa cron."

  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  [[ "$NODE_VER" -ge 18 ]] || error "Node.js >= 18 richiesto (trovato: $NODE_VER)."
  info "Node.js $NODE_VER trovato."
}

setup_env() {
  heading "Verifico file .env"
  if [[ ! -f "$ENV_FILE" ]]; then
    warn "File .env non trovato. Creo un template in $ENV_FILE"
    cat > "$ENV_FILE" <<EOF
# --- Database ---
DATABASE_URL=postgresql://${DB_USER}:$(openssl rand -hex 24)@localhost:${PG_PORT}/${DB_NAME}

# --- Email (Gmail) ---
EMAIL_USER=
EMAIL_PASSWORD=

# --- Twilio SMS ---
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# --- App ---
PORT=${APP_PORT}
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "cambia_questo_secret_ora")
# URL pubblico: senza, i pixel di tracking delle email puntano nel vuoto.
APP_URL=
# true solo se il sito è servito in HTTPS (cookie di sessione secure).
SESSION_SECURE=false
EOF
    warn "Modifica $ENV_FILE con le credenziali reali, poi rilancia questo script."
    exit 0
  fi
  info "File .env trovato."

  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport

  [[ -n "${DATABASE_URL:-}" ]] || error "DATABASE_URL non impostata nel file .env"

  if ! grep -q "^PORT=" "$ENV_FILE"; then
    echo "PORT=${APP_PORT}" >> "$ENV_FILE"
    info "PORT=${APP_PORT} aggiunto a .env"
  fi

  if ! grep -q "^SESSION_SECRET=" "$ENV_FILE"; then
    echo "SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "cambia_questo_secret_ora")" >> "$ENV_FILE"
    info "SESSION_SECRET generato e aggiunto a .env"
    # Re-source so the variable is available
    set -o allexport; source "$ENV_FILE"; set +o allexport
  fi
}

parse_db_url() {
  DB_URL_REGEX='^postgresql://([^:]+):([^@]+)@([^:]+):([0-9]+)/(.+)$'
  if [[ "$DATABASE_URL" =~ $DB_URL_REGEX ]]; then
    _DB_USER="${BASH_REMATCH[1]}"
    _DB_PASS="${BASH_REMATCH[2]}"
    _DB_HOST="${BASH_REMATCH[3]}"
    _DB_PORT="${BASH_REMATCH[4]}"
    # Senza tagliare la query string un URL con ?sslmode=require creerebbe un
    # database chiamato "notifichepozzi?sslmode=require".
    _DB_NAME="${BASH_REMATCH[5]%%\?*}"
  else
    error "DATABASE_URL non ha il formato atteso: postgresql://user:password@host:port/dbname"
  fi
}

setup_postgres() {
  heading "Configuro PostgreSQL"

  if command -v pg_isready >/dev/null 2>&1; then
    pg_isready -h "$_DB_HOST" -p "$_DB_PORT" -q || \
      warn "PostgreSQL non risponde su $_DB_HOST:$_DB_PORT — potrebbe essere normale se non ancora avviato."
  fi

  if sudo -u postgres psql -p "$_DB_PORT" -tAc "SELECT 1" >/dev/null 2>&1; then
    info "Connessione a PostgreSQL come superuser 'postgres' riuscita."

    USER_EXISTS=$(sudo -u postgres psql -p "$_DB_PORT" -tAc \
      "SELECT 1 FROM pg_roles WHERE rolname='${_DB_USER}'" 2>/dev/null || echo "")
    if [[ -z "$USER_EXISTS" ]]; then
      info "Creo l'utente PostgreSQL '${_DB_USER}'..."
      sudo -u postgres psql -p "$_DB_PORT" -c \
        "CREATE USER \"${_DB_USER}\" WITH PASSWORD '${_DB_PASS}';"
      info "Utente '${_DB_USER}' creato."
    else
      info "Utente '${_DB_USER}' già esistente."
      sudo -u postgres psql -p "$_DB_PORT" -c \
        "ALTER USER \"${_DB_USER}\" WITH PASSWORD '${_DB_PASS}';" >/dev/null
    fi

    DB_EXISTS=$(sudo -u postgres psql -p "$_DB_PORT" -tAc \
      "SELECT 1 FROM pg_database WHERE datname='${_DB_NAME}'" 2>/dev/null || echo "")
    if [[ -z "$DB_EXISTS" ]]; then
      info "Creo il database '${_DB_NAME}'..."
      sudo -u postgres psql -p "$_DB_PORT" -c \
        "CREATE DATABASE \"${_DB_NAME}\" OWNER \"${_DB_USER}\";"
      info "Database '${_DB_NAME}' creato."
    else
      info "Database '${_DB_NAME}' già esistente."
      sudo -u postgres psql -p "$_DB_PORT" -c \
        "ALTER DATABASE \"${_DB_NAME}\" OWNER TO \"${_DB_USER}\";" >/dev/null 2>&1 || true
    fi

    sudo -u postgres psql -p "$_DB_PORT" -c \
      "GRANT ALL PRIVILEGES ON DATABASE \"${_DB_NAME}\" TO \"${_DB_USER}\";" >/dev/null
  else
    warn "Impossibile connettersi come superuser 'postgres'. Salto la creazione del DB."
    warn "Assicurati che l'utente '${_DB_USER}' e il database '${_DB_NAME}' esistano manualmente."
  fi
}

npm_build() {
  heading "Installo dipendenze e build"
  cd "$APP_DIR"
  # Niente 2>/dev/null sul primo tentativo: se npm ci fallisce per un motivo
  # vero (lockfile disallineato, rete assente) l'errore va letto, non nascosto.
  if ! NODE_ENV=development npm ci --include=dev; then
    warn "npm ci fallito, ripiego su npm install."
    NODE_ENV=development npm install --include=dev
  fi
  info "Dipendenze installate."
  npm run build
  info "Build completata."
}

db_push() {
  heading "Applico schema Drizzle"
  cd "$APP_DIR"
  npm run db:push -- --force

  # drizzle-kit puo' uscire con codice 0 senza aver applicato nulla (prompt
  # create-vs-rename che riceve EOF): il conteggio tabelle e' l'unica prova.
  local tabelle
  tabelle=$(PGPASSWORD="$_DB_PASS" psql -h "$_DB_HOST" -p "$_DB_PORT" -U "$_DB_USER" -d "$_DB_NAME" \
    -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public';" 2>/dev/null || echo "0")
  if [[ "$tabelle" -lt 1 ]]; then
    error "Schema NON applicato: il database non ha tabelle. Rilancia da un terminale interattivo."
  fi
  info "Schema applicato ($tabelle tabelle nello schema public)."
}

setup_backup() {
  heading "Configuro il backup automatico del database"
  local script="$APP_DIR/scripts/backup-db.sh"

  if [[ ! -x "$script" ]]; then
    warn "$script non trovato o non eseguibile — salto."
    return 0
  fi
  if ! command -v crontab >/dev/null 2>&1; then
    warn "crontab non disponibile — backup automatico non schedulato."
    return 0
  fi

  if crontab -l 2>/dev/null | grep -q 'backup-db.sh'; then
    info "Backup gia' schedulato in crontab."
  else
    ( crontab -l 2>/dev/null
      echo "# Backup giornaliero DB - ore 22:30 (ora del server), tiene le ultime 30 copie"
      echo "30 22 * * * $script >> $APP_DIR/backups/cron.log 2>&1"
    ) | crontab -
    info "Backup schedulato ogni giorno alle 22:30 (ora del server)."
  fi

  if "$script"; then
    info "Backup di prova riuscito: $(ls -1 "$APP_DIR"/backups/*.sql.gz 2>/dev/null | wc -l) copie in backups/"
  else
    warn "Il backup di prova e' fallito — controlla $APP_DIR/backups/backup.log"
  fi
}

setup_firewall() {
  heading "Configuro firewall"
  if command -v ufw >/dev/null 2>&1 && sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    if ! sudo ufw status | grep -qE "^${APP_PORT}(/tcp)?\s+ALLOW"; then
      info "Apro porta ${APP_PORT}/tcp nel firewall (ufw)..."
      sudo ufw allow "${APP_PORT}/tcp" >/dev/null
      info "Porta ${APP_PORT}/tcp aperta."
    else
      info "Porta ${APP_PORT}/tcp già aperta nel firewall."
    fi
  else
    warn "ufw non attivo o non installato — salto configurazione firewall."
  fi
}

seed_admin() {
  heading "Seed primo superadmin"
  cd "$APP_DIR"
  # Check if any superadmin already exists
  SUPERADMIN_COUNT=$(PGPASSWORD="$_DB_PASS" psql -h "$_DB_HOST" -p "$_DB_PORT" -U "$_DB_USER" -d "$_DB_NAME" \
    -tAc "SELECT COUNT(*) FROM app_users WHERE role='superadmin';" 2>/dev/null || echo "0")
  # Un output non numerico (errore di connessione) manderebbe in errore il test
  # aritmetico sotto, e con set -e l'intero deploy.
  [[ "$SUPERADMIN_COUNT" =~ ^[0-9]+$ ]] || SUPERADMIN_COUNT=0

  if [[ "$SUPERADMIN_COUNT" -gt 0 ]]; then
    info "Superadmin già presente — skip seed."
    return 0
  fi

  warn "Nessun superadmin trovato. Creo il primo account."
  if [[ -n "${SEED_ADMIN_USERNAME:-}" ]] && [[ -n "${SEED_ADMIN_PASSWORD:-}" ]]; then
    npm run seed:admin
  else
    printf "Username superadmin: "; read -r _SEED_USER
    printf "Password superadmin (min 8 caratteri): "; read -rs _SEED_PASS; echo ""
    SEED_ADMIN_USERNAME="$_SEED_USER" SEED_ADMIN_PASSWORD="$_SEED_PASS" npm run seed:admin
  fi
}

ensure_pm2() {
  command -v pm2 >/dev/null 2>&1 && return 0
  info "pm2 non trovato, lo installo."
  # Con il prefix npm di default (/usr/lib/node_modules) l'installazione globale
  # richiede root: senza il ripiego su sudo, su un server pulito si ferma con EACCES.
  if npm install -g pm2; then
    return 0
  fi
  warn "Installazione globale senza permessi fallita, riprovo con sudo."
  sudo npm install -g pm2 || error "Impossibile installare pm2. Installalo a mano e rilancia."
}

pm2_start() {
  heading "Avvio con pm2"
  ensure_pm2
  pm2 delete "$SERVICE_NAME" 2>/dev/null || true
  PORT="$APP_PORT" pm2 start dist/index.js \
    --name "$SERVICE_NAME" \
    --env production \
    --update-env
  pm2 save
  info "App avviata con pm2 sulla porta $APP_PORT"
  check_pm2_startup
}

check_pm2_startup() {
  # pm2 save da solo non basta: senza l'unita' systemd l'app non riparte dopo
  # un reboot, e non c'e' nessun errore che lo segnali finche' non succede.
  if systemctl is-enabled "pm2-$(id -un)" >/dev/null 2>&1; then
    info "Avvio automatico al boot: configurato."
  else
    warn "Avvio automatico al boot NON configurato: dopo un riavvio della macchina l'app resterebbe spenta."
    warn "Esegui 'pm2 startup', poi il comando sudo che stampa, infine 'pm2 save'."
  fi
}

pm2_restart() {
  heading "Riavvio pm2"
  ensure_pm2
  if pm2 describe "$SERVICE_NAME" >/dev/null 2>&1; then
    pm2 restart "$SERVICE_NAME" --update-env
    pm2 save
    info "App riavviata."
  else
    warn "Processo pm2 '$SERVICE_NAME' non trovato — eseguo start."
    pm2_start
  fi
}

git_pull() {
  heading "Git pull"
  cd "$APP_DIR"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  git fetch origin
  git pull origin "$BRANCH"
  info "Repository aggiornato (branch: $BRANCH)."
}

git_push() {
  heading "Git push"
  cd "$APP_DIR"
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  git push origin "$BRANCH"
  info "Push completato (branch: $BRANCH)."
}

print_summary() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  Operazione completata!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo -e "  App:        http://localhost:${APP_PORT}"
  # Valori realmente in uso, presi dal DATABASE_URL: la vecchia riga stampava
  # una porta hardcoded che non corrispondeva a quella vera.
  echo -e "  PostgreSQL: ${_DB_HOST:-?}:${_DB_PORT:-?}  db=${_DB_NAME:-?}"
  echo -e "  Log (pm2):  pm2 logs ${SERVICE_NAME}"
  echo -e "  Backup:     ${APP_DIR}/backups (ogni giorno alle 22:30)"
  echo ""
}

# =============================================================================
# Menu
# =============================================================================

show_menu() {
  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  NotifichePozzi — Gestione Deploy${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo -e "  1) Prima installazione"
  echo -e "  2) Rebuild + riavvio pm2"
  echo -e "  3) Ripara database"
  echo -e "  4) Git pull"
  echo -e "  5) Git push"
  echo -e "  6) Crea primo superadmin"
  echo -e "  7) Installa/verifica backup automatico"
  echo -e "  0) Esci"
  echo -e "${CYAN}----------------------------------------${NC}"
  printf "Scelta: "
}

main() {
  # Il menu e i prompt di drizzle-kit leggono da stdin. Con stdin rediretto la
  # scelta viene consumata dal menu, drizzle riceve EOF e db:push esce con
  # codice 0 senza applicare nulla: un deploy "riuscito" che non ha fatto niente.
  if [[ ! -t 0 ]]; then
    error "deploy.sh va lanciato da un terminale interattivo, non con stdin rediretto (vedi README.md)."
  fi

  show_menu
  read -r CHOICE
  echo ""

  case "$CHOICE" in
    1)
      check_deps
      setup_env
      parse_db_url
      setup_postgres
      npm_build
      db_push
      seed_admin
      setup_firewall
      pm2_start
      setup_backup
      print_summary
      ;;
    2)
      setup_env
      parse_db_url
      npm_build
      db_push
      pm2_restart
      print_summary
      ;;
    3)
      setup_env
      parse_db_url
      setup_postgres
      db_push
      print_summary
      ;;
    4)
      git_pull
      ;;
    5)
      git_push
      ;;
    6)
      setup_env
      parse_db_url
      seed_admin
      print_summary
      ;;
    7)
      setup_env
      parse_db_url
      setup_backup
      check_pm2_startup
      ;;
    0)
      info "Uscita."
      exit 0
      ;;
    *)
      error "Scelta non valida: '$CHOICE'"
      ;;
  esac
}

main
