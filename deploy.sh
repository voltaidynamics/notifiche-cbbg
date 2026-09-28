#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Notifiche Canali Irrigui
#
# Installazione e aggiornamento dell'applicazione su un server Debian/Ubuntu.
#
#   git clone <url-del-repository> notifiche-canali-irrigui
#   cd notifiche-canali-irrigui
#   ./deploy.sh
#
# Menu:
#   1) Prima installazione  — dipendenze di sistema, PostgreSQL, .env, build,
#                             schema del database, primo superadmin, pm2
#                             (con avvio automatico al boot), backup notturno
#   2) Aggiorna             — backup, git pull, build, migrazioni, riavvio pm2
#   3) Stato                — processo, porta, versione, ultimo backup
#   4) Crea superadmin      — solo se non ne esiste nessuno
#
# Va lanciato da un terminale interattivo, dall'utente di sistema che farà
# girare l'applicazione (non da root): pm2 e il backup appartengono a lui.
#
# Per provarlo accanto a un'installazione esistente senza toccarla:
#   NOME_PM2=prova DB_NAME=prova_db ./deploy.sh
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$APP_DIR/.env"
NOME_PM2="${NOME_PM2:-notifichepozzi}"
PORTA_DEFAULT=8610
DB_NAME="${DB_NAME:-notifichepozzi}"   # solo per generare il primo .env
DB_USER="${DB_USER:-npozzi}"           # idem
NODE_MIN=20        # versione minima accettata
NODE_INSTALLA=22   # versione installata da NodeSource se manca

# Registro delle migrazioni applicate. Sta in uno schema proprio e non in
# `public` perché drizzle-kit push gestisce tutto `public` e cancellerebbe
# ogni tabella non dichiarata in shared/schema.ts.
REGISTRO="deploy.migrazioni_applicate"

if [[ $EUID -eq 0 ]]; then SUDO=""; else SUDO="sudo"; fi

# ---- output ----
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[AVVISO]${NC} $*"; }
errore()  { echo -e "${RED}[ERRORE]${NC} $*" >&2; exit 1; }
titolo()  { echo -e "\n${CYAN}── $* ──${NC}"; }

# conferma "domanda" [S|N]  — il secondo argomento è la risposta di default
conferma() {
  local def="${2:-N}" risp suff
  if [[ "$def" == "S" ]]; then suff="[S/n]"; else suff="[s/N]"; fi
  printf "%s %s " "$1" "$suff"
  read -r risp
  risp="${risp:-$def}"
  [[ "$risp" =~ ^[sSyY] ]]
}

# chiedi "domanda" "default" → stampa la risposta su stdout
chiedi() {
  local risp
  if [[ -n "${2:-}" ]]; then printf "%s [%s]: " "$1" "$2" >&2; else printf "%s: " "$1" >&2; fi
  read -r risp
  echo "${risp:-${2:-}}"
}

come_postgres() {
  # cd / : l'utente postgres non può entrare nella cartella dell'app, e psql
  # stamperebbe un avviso a ogni comando.
  if [[ $EUID -eq 0 ]]; then (cd / && runuser -u postgres -- "$@"); else (cd / && sudo -u postgres "$@"); fi
}

sql() { psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
sql_valore() { psql "$DATABASE_URL" -X -tA -v ON_ERROR_STOP=1 -c "$1"; }

# =============================================================================
# Dipendenze di sistema
# =============================================================================

versione_node() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -e "process.stdout.write(process.versions.node.split('.')[0])"
}

serve_postgres_locale() {
  # Senza .env l'installazione crea un database locale; con un .env che punta
  # altrove il server PostgreSQL non va installato qui.
  [[ ! -f "$ENV_FILE" ]] && return 0
  local url
  url="$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '\047" \r')"
  [[ "$url" =~ @(localhost|127\.0\.0\.1)[:/] ]]
}

installa_dipendenze_sistema() {
  titolo "Dipendenze di sistema"
  local mancanti=() pacchetti=()

  command -v git      >/dev/null 2>&1 || { mancanti+=("git");      pacchetti+=(git); }
  command -v curl     >/dev/null 2>&1 || { mancanti+=("curl");     pacchetti+=(curl ca-certificates); }
  command -v openssl  >/dev/null 2>&1 || { mancanti+=("openssl");  pacchetti+=(openssl); }
  command -v crontab  >/dev/null 2>&1 || { mancanti+=("cron");     pacchetti+=(cron); }
  command -v psql     >/dev/null 2>&1 || { mancanti+=("psql");     pacchetti+=(postgresql-client); }
  command -v pg_dump  >/dev/null 2>&1 || { mancanti+=("pg_dump");  pacchetti+=(postgresql-client); }
  if serve_postgres_locale && ! command -v pg_lsclusters >/dev/null 2>&1; then
    mancanti+=("server PostgreSQL"); pacchetti+=(postgresql)
  fi

  local node_ver; node_ver="$(versione_node)"
  local serve_node=0
  if [[ "$node_ver" -lt "$NODE_MIN" ]]; then
    serve_node=1
    if [[ "$node_ver" -eq 0 ]]; then mancanti+=("Node.js"); else mancanti+=("Node.js $NODE_MIN+ (trovato $node_ver)"); fi
  fi

  if [[ ${#mancanti[@]} -eq 0 ]]; then
    info "Tutto presente (Node.js $node_ver)."
  else
    echo "Mancano: ${mancanti[*]}"
    command -v apt-get >/dev/null 2>&1 \
      || errore "Sistema senza apt-get: installa a mano ${mancanti[*]} e rilancia."
    conferma "Li installo con apt?" S || errore "Installazione annullata: servono ${mancanti[*]}."

    $SUDO apt-get update
    if [[ ${#pacchetti[@]} -gt 0 ]]; then
      # shellcheck disable=SC2046
      $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y $(printf '%s\n' "${pacchetti[@]}" | sort -u)
    fi
    if [[ $serve_node -eq 1 ]]; then
      info "Installo Node.js $NODE_INSTALLA da NodeSource."
      $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_INSTALLA}.x" | $SUDO -E bash -
      $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
      hash -r
    fi
    node_ver="$(versione_node)"
    # Un node più vecchio (es. da nvm) può restare davanti a quello appena
    # installato nel PATH: meglio fermarsi qui che fallire a metà build.
    [[ "$node_ver" -ge "$NODE_MIN" ]] \
      || errore "Node.js nel PATH è ancora la versione $node_ver ($(command -v node)). Serve la $NODE_MIN o superiore."
    info "Dipendenze installate (Node.js $node_ver)."
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    info "Installo pm2."
    # Con il prefix npm di sistema l'installazione globale richiede root; con
    # nvm no, e sudo userebbe un altro node.
    if [[ -w "$(npm prefix -g)/lib" || -w "$(npm prefix -g)" ]]; then
      npm install -g pm2
    else
      $SUDO npm install -g pm2
    fi
    hash -r
    command -v pm2 >/dev/null 2>&1 || errore "pm2 non risulta installato. Installalo a mano (npm install -g pm2) e rilancia."
  fi
  info "pm2 $(pm2 --version 2>/dev/null | tail -1) presente."
}

# =============================================================================
# Configurazione (.env)
# =============================================================================

porta_occupata() { ss -Hltn "sport = :$1" 2>/dev/null | grep -q .; }

porta_postgres_locale() {
  # La porta del cluster attivo: su Debian/Ubuntu non è detto che sia la 5432.
  local p=""
  command -v pg_lsclusters >/dev/null 2>&1 \
    && p="$(pg_lsclusters --no-header 2>/dev/null | awk '$4 == "online" { print $3; exit }')"
  echo "${p:-5432}"
}

crea_env() {
  titolo "Configurazione (.env)"
  if [[ -f "$ENV_FILE" ]]; then
    info ".env già presente: lo tengo così com'è."
    return 0
  fi

  local porta
  while true; do
    porta="$(chiedi "Porta su cui pubblicare l'applicazione" "$PORTA_DEFAULT")"
    if [[ ! "$porta" =~ ^[0-9]+$ ]] || (( porta < 1024 || porta > 65535 )); then
      warn "Serve un numero fra 1024 e 65535."
    elif porta_occupata "$porta"; then
      warn "La porta $porta è già in uso da un altro programma: scegline un'altra."
    else
      break
    fi
  done

  local app_url
  app_url="$(chiedi "Indirizzo pubblico dell'applicazione (es. https://notifiche.consorzio.it) — invio per saltare" "")"

  local pg_port; pg_port="$(porta_postgres_locale)"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Generato da deploy.sh il $(date '+%d/%m/%Y %H:%M').
# Dopo una modifica: ./deploy.sh → 2) Aggiorna, oppure pm2 restart ${NOME_PM2} --update-env

# --- Applicazione ---
PORT=${porta}
NODE_ENV=production
SESSION_SECRET=$(openssl rand -hex 32)
# Indirizzo pubblico: serve al pixel che registra l'apertura delle email.
APP_URL=${app_url}
# Lasciare false finché l'applicazione non è servita in HTTPS.
SESSION_SECURE=false

# --- Database ---
DATABASE_URL=postgresql://${DB_USER}:$(openssl rand -hex 24)@localhost:${pg_port}/${DB_NAME}

# --- Posta, PEC e SMS ---
# Facoltativi: si configurano anche da Impostazioni, che ha la precedenza.
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_PEC_USER=
EMAIL_PEC_PASSWORD=
SMTP_PEC_HOST=
SMTP_PEC_PORT=465
SMS_CLIENTID=
SMS_PASSWORD=
EOF
  umask 022
  info ".env creato (porta $porta, PostgreSQL locale sulla $pg_port)."
}

carica_env() {
  [[ -f "$ENV_FILE" ]] || errore "File .env non trovato: esegui prima «1) Prima installazione»."
  set -o allexport
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +o allexport
  [[ -n "${DATABASE_URL:-}" ]] || errore "DATABASE_URL mancante in $ENV_FILE."
  APP_PORT="${PORT:-$PORTA_DEFAULT}"

  local re='^postgres(ql)?://([^:]+):([^@]*)@([^:/]+):?([0-9]*)/([^?]+)'
  [[ "$DATABASE_URL" =~ $re ]] \
    || errore "DATABASE_URL non ha il formato postgresql://utente:password@host:porta/database"
  _DB_USER="${BASH_REMATCH[2]}"
  _DB_PASS="${BASH_REMATCH[3]}"
  _DB_HOST="${BASH_REMATCH[4]}"
  _DB_PORT="${BASH_REMATCH[5]:-5432}"
  _DB_NAME="${BASH_REMATCH[6]}"
}

# =============================================================================
# Database
# =============================================================================

prepara_postgres() {
  titolo "PostgreSQL"
  if [[ "$_DB_HOST" != "localhost" && "$_DB_HOST" != "127.0.0.1" ]]; then
    info "Database su un altro server ($_DB_HOST): utente e database devono già esistere."
  else
    if command -v systemctl >/dev/null 2>&1; then
      $SUDO systemctl enable --now postgresql >/dev/null 2>&1 || true
    fi
    local i
    for i in $(seq 1 15); do
      pg_isready -h "$_DB_HOST" -p "$_DB_PORT" -q 2>/dev/null && break
      sleep 1
    done
    pg_isready -h "$_DB_HOST" -p "$_DB_PORT" -q \
      || errore "PostgreSQL non risponde su $_DB_HOST:$_DB_PORT. Controlla la porta in DATABASE_URL (cluster attivi: pg_lsclusters)."

    come_postgres psql -p "$_DB_PORT" -tAc "SELECT 1" >/dev/null 2>&1 \
      || errore "Non riesco a collegarmi a PostgreSQL come utente 'postgres' (sudo -u postgres psql)."

    if [[ -z "$(come_postgres psql -p "$_DB_PORT" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${_DB_USER}'")" ]]; then
      come_postgres psql -p "$_DB_PORT" -q -c "CREATE ROLE \"${_DB_USER}\" LOGIN PASSWORD '${_DB_PASS}';"
      info "Utente PostgreSQL '${_DB_USER}' creato."
    else
      # La password di un utente esistente non si tocca: potrebbe usarlo
      # un'altra installazione, e la connessione sotto dice se .env è giusto.
      info "Utente PostgreSQL '${_DB_USER}' già esistente."
    fi

    if [[ -z "$(come_postgres psql -p "$_DB_PORT" -tAc "SELECT 1 FROM pg_database WHERE datname='${_DB_NAME}'")" ]]; then
      come_postgres psql -p "$_DB_PORT" -q -c "CREATE DATABASE \"${_DB_NAME}\" OWNER \"${_DB_USER}\";"
      info "Database '${_DB_NAME}' creato."
    else
      info "Database '${_DB_NAME}' già esistente."
    fi
  fi

  sql -c "SELECT 1" >/dev/null \
    || errore "L'applicazione non riesce a collegarsi al database con le credenziali di .env."
  info "Connessione al database riuscita."
}

tabelle_public() { sql_valore "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"; }
registro_esiste() { [[ "$(sql_valore "SELECT to_regclass('$REGISTRO') IS NOT NULL")" == "t" ]]; }

crea_registro() {
  sql -c "CREATE SCHEMA IF NOT EXISTS deploy;
          CREATE TABLE IF NOT EXISTS $REGISTRO (
            nome        text PRIMARY KEY,
            applicata_il timestamptz NOT NULL DEFAULT now()
          );"
}

file_migrazioni() { find "$APP_DIR/migrations" -maxdepth 1 -name '*.sql' -printf '%f\n' 2>/dev/null | sort; }

# Segna come applicate le migrazioni presenti su disco, senza eseguirle.
segna_migrazioni() {
  local f
  for f in $(file_migrazioni); do
    sql -c "INSERT INTO $REGISTRO (nome) VALUES ('$f') ON CONFLICT DO NOTHING;"
  done
}

migrazioni_pendenti() {
  local applicate f
  applicate="$(sql_valore "SELECT nome FROM $REGISTRO")"
  for f in $(file_migrazioni); do
    grep -qxF "$f" <<<"$applicate" || echo "$f"
  done
}

applica_migrazioni() {
  local pendenti f
  pendenti="$(migrazioni_pendenti)"
  if [[ -z "$pendenti" ]]; then
    info "Nessuna migrazione da applicare."
    return 0
  fi
  for f in $pendenti; do
    info "Applico migrations/$f"
    # Un file con BEGIN/COMMIT propri gestisce da sé la transazione; gli altri
    # vengono avvolti in una sola, così un errore non lascia il database a metà.
    if grep -qiE '^[[:space:]]*BEGIN' "$APP_DIR/migrations/$f"; then
      sql -f "$APP_DIR/migrations/$f" || { warn "Migrazione $f fallita."; return 1; }
    else
      sql -1 -f "$APP_DIR/migrations/$f" || { warn "Migrazione $f fallita: annullata per intero, il database è com'era."; return 1; }
    fi
    sql -c "INSERT INTO $REGISTRO (nome) VALUES ('$f');"
  done
}

# Tutte le tabelle dichiarate in shared/schema.ts devono esistere: drizzle-kit
# può uscire con codice 0 senza aver applicato niente.
verifica_tabelle() {
  local attese mancanti=() t
  attese="$(grep -oE 'pgTable\(\s*"[a-z_0-9]+"' "$APP_DIR/shared/schema.ts" | sed -E 's/.*"(.*)"/\1/')"
  [[ -n "$attese" ]] || errore "Non trovo le tabelle in shared/schema.ts."
  for t in $attese; do
    [[ "$(sql_valore "SELECT to_regclass('public.$t') IS NOT NULL")" == "t" ]] || mancanti+=("$t")
  done
  [[ ${#mancanti[@]} -eq 0 ]] || errore "Schema incompleto, mancano le tabelle: ${mancanti[*]}"
  info "Schema verificato: $(wc -w <<<"$attese") tabelle presenti."
}

schema_prima_installazione() {
  titolo "Schema del database"
  cd "$APP_DIR"
  local n; n="$(tabelle_public)"
  if [[ "$n" -eq 0 ]]; then
    # Su un database vuoto drizzle-kit non ha niente da rinominare né da
    # cancellare, quindi --force non può fare danni e non fa domande.
    npm run db:push -- --force
    crea_registro
    # Lo schema appena creato è già quello finale: le migrazioni servono solo
    # ai database nati con una versione precedente.
    segna_migrazioni
    info "Schema creato."
  else
    warn "Il database contiene già $n tabelle: lo aggiorno invece di ricrearlo."
    prepara_registro
    applica_migrazioni || errore "Installazione interrotta."
    allinea_schema
  fi
  verifica_tabelle
}

# Un database nato prima di questo script non ha il registro: non si può
# sapere quali migrazioni abbia già ricevuto, quindi lo decide chi aggiorna.
prepara_registro() {
  registro_esiste && return 0
  if [[ "$(tabelle_public)" -eq 0 ]]; then
    crea_registro
    return 0
  fi
  warn "Il database non ha ancora il registro delle migrazioni applicate."
  echo "  Se l'applicazione funziona correttamente con la versione attuale, tutte le"
  echo "  migrazioni presenti ORA in migrations/ ($(file_migrazioni | wc -l) file) sono già applicate."
  conferma "Le segno come già applicate?" S \
    || errore "Annullato. Applica a mano le migrazioni mancanti e segnale in $REGISTRO."
  crea_registro
  segna_migrazioni
  info "Registro delle migrazioni creato."
}

allinea_schema() {
  cd "$APP_DIR"
  # Senza --force: se drizzle-kit volesse cancellare o rinominare qualcosa lo
  # chiede, e la risposta prudente è sempre «No, abort».
  echo "Confronto lo schema del database con shared/schema.ts."
  echo "Se compare una domanda su tabelle da cancellare o rinominare, rispondi «No, abort» e contatta l'assistenza."
  npm run db:push
}

# =============================================================================
# Build, pm2, servizi
# =============================================================================

build() {
  titolo "Dipendenze npm e build"
  cd "$APP_DIR"
  # .env mette NODE_ENV=production nell'ambiente, e npm ci salterebbe le
  # dipendenze di sviluppo che servono alla build.
  # Controlli espliciti e non set -e: dentro `build || …` bash lo disattiva, e
  # un npm ci fallito passerebbe inosservato fino al riavvio.
  NODE_ENV=development npm ci --include=dev --no-audit --no-fund || { warn "npm ci fallito."; return 1; }
  npm run build || { warn "Build fallita."; return 1; }
  [[ -f "$APP_DIR/dist/index.js" ]] || { warn "Build terminata senza dist/index.js."; return 1; }
  info "Build completata."
}

conta_superadmin() {
  local n
  n="$(sql_valore "SELECT count(*) FROM app_users WHERE role = 'superadmin'" 2>/dev/null || echo 0)"
  [[ "$n" =~ ^[0-9]+$ ]] || n=0
  echo "$n"
}

crea_superadmin() {
  titolo "Primo superadmin"
  cd "$APP_DIR"
  if [[ "$(conta_superadmin)" -gt 0 ]]; then
    info "Esiste già un superadmin."
    return 0
  fi
  echo "Nessun superadmin: creo il primo account (entra sempre, anche senza Active Directory)."
  local u p p2
  while true; do
    u="$(chiedi "Username" "")"
    [[ ${#u} -ge 3 ]] && break
    warn "Almeno 3 caratteri."
  done
  while true; do
    printf "Password (almeno 8 caratteri): "; read -rs p; echo
    printf "Ripeti la password: "; read -rs p2; echo
    if [[ ${#p} -lt 8 ]]; then warn "Almeno 8 caratteri."
    elif [[ "$p" != "$p2" ]]; then warn "Le due password non coincidono."
    else break; fi
  done
  SEED_ADMIN_USERNAME="$u" SEED_ADMIN_PASSWORD="$p" npm run --silent seed:admin
  [[ "$(conta_superadmin)" -gt 0 ]] || errore "Superadmin non creato."
  info "Superadmin '$u' creato."
}

apri_firewall() {
  titolo "Firewall"
  if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
    if $SUDO ufw status | grep -qE "^${APP_PORT}(/tcp)?[[:space:]]+ALLOW"; then
      info "Porta ${APP_PORT}/tcp già aperta in ufw."
    elif conferma "ufw è attivo: apro la porta ${APP_PORT}/tcp verso l'esterno?" S; then
      $SUDO ufw allow "${APP_PORT}/tcp" comment "notifiche canali irrigui" >/dev/null
      info "Porta ${APP_PORT}/tcp aperta in ufw."
    else
      warn "Porta non aperta: l'applicazione sarà raggiungibile solo da questa macchina o da un reverse proxy locale."
    fi
  else
    info "ufw non attivo: nessuna regola da aggiungere. Se c'è un firewall esterno, la porta da aprire è ${APP_PORT}/tcp."
  fi
}

avvia_pm2() {
  titolo "Avvio con pm2"
  cd "$APP_DIR"
  if pm2 describe "$NOME_PM2" >/dev/null 2>&1; then
    # --update-env: le variabili appena rilette da .env sostituiscono quelle
    # fotografate da pm2 al primo avvio.
    pm2 restart "$NOME_PM2" --update-env
  else
    pm2 start "$APP_DIR/dist/index.js" --name "$NOME_PM2" --cwd "$APP_DIR" --time
  fi
  pm2 save
  info "Processo pm2 '$NOME_PM2' avviato e salvato."
}

avvio_al_boot() {
  local unita="pm2-$(id -un)"
  if systemctl is-enabled "$unita" >/dev/null 2>&1; then
    info "Avvio automatico al boot già attivo ($unita)."
    return 0
  fi
  info "Attivo l'avvio automatico di pm2 al boot."
  # È il comando che `pm2 startup` stampa, eseguito direttamente.
  $SUDO env PATH="$PATH:$(dirname "$(command -v node)")" "$(command -v pm2)" startup systemd -u "$(id -un)" --hp "$HOME" >/dev/null
  pm2 save
  systemctl is-enabled "$unita" >/dev/null 2>&1 \
    && info "Avvio automatico al boot attivo ($unita)." \
    || warn "Avvio automatico non attivato: esegui 'pm2 startup', poi il comando che stampa, poi 'pm2 save'."
}

installa_backup() {
  titolo "Backup automatico"
  local script="$APP_DIR/scripts/backup-db.sh"
  chmod +x "$script"
  if crontab -l 2>/dev/null | grep -qF "$script"; then
    info "Backup già in crontab."
  else
    ( crontab -l 2>/dev/null || true
      echo "# Notifiche Canali Irrigui: backup del database alle 22:30 (ora del server), ultime 30 copie"
      echo "30 22 * * * $script >> $APP_DIR/backups/cron.log 2>&1"
    ) | crontab -
    info "Backup programmato ogni giorno alle 22:30 (ora del server)."
  fi
}

backup_ora() {
  local script="$APP_DIR/scripts/backup-db.sh"
  chmod +x "$script"
  if "$script"; then
    info "Backup: $(ls -1t "$APP_DIR"/backups/*.sql.gz 2>/dev/null | head -1)"
  else
    warn "Backup fallito (dettagli in backups/backup.log)."
    return 1
  fi
}

# L'app risponde 200 sulla pagina iniziale anche senza login.
attendi_app() {
  local i codice=""
  for i in $(seq 1 30); do
    codice="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/" || true)"
    [[ "$codice" == "200" ]] && { info "L'applicazione risponde sulla porta ${APP_PORT}."; return 0; }
    sleep 1
  done
  warn "L'applicazione non risponde sulla porta ${APP_PORT} (ultimo codice: ${codice:-nessuno})."
  echo "  Ultime righe di log:"
  pm2 logs "$NOME_PM2" --lines 30 --nostream 2>/dev/null | tail -30
  return 1
}

riepilogo() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  echo ""
  echo -e "${BOLD}Applicazione:${NC}  http://${ip:-<ip-del-server>}:${APP_PORT}${APP_URL:+   (pubblica: $APP_URL)}"
  echo -e "${BOLD}Versione:${NC}      $(git -C "$APP_DIR" log -1 --format='%h del %cd' --date=format:'%d/%m/%Y' 2>/dev/null || echo '?')"
  echo -e "${BOLD}Database:${NC}      ${_DB_NAME} su ${_DB_HOST}:${_DB_PORT}"
  echo -e "${BOLD}Log:${NC}           pm2 logs ${NOME_PM2}"
  echo -e "${BOLD}Backup:${NC}        ${APP_DIR}/backups (ogni giorno alle 22:30)"
  echo ""
}

# =============================================================================
# Azioni del menu
# =============================================================================

prima_installazione() {
  installa_dipendenze_sistema
  crea_env
  carica_env
  if command -v pm2 >/dev/null 2>&1 && pm2 describe "$NOME_PM2" >/dev/null 2>&1; then
    warn "L'applicazione risulta già installata (processo pm2 '$NOME_PM2'): per portarla all'ultima versione si usa «2) Aggiorna»."
    conferma "Ripeto comunque la prima installazione? Non cancella dati." N || exit 0
  fi
  prepara_postgres
  build || errore "Installazione interrotta: dipendenze npm o build non riuscite (vedi sopra)."
  schema_prima_installazione
  crea_superadmin
  apri_firewall
  avvia_pm2
  avvio_al_boot
  installa_backup
  attendi_app || errore "Installazione completata ma l'applicazione non risponde: controlla i log qui sopra."
  titolo "Installazione completata"
  riepilogo
  echo "Passi successivi, dall'interfaccia (Impostazioni): WebService del consorzio, Email, PEC, SMS, Active Directory."
}

aggiorna() {
  carica_env
  cd "$APP_DIR"
  command -v pm2 >/dev/null 2>&1 || errore "pm2 non trovato: esegui prima «1) Prima installazione»."

  titolo "Controlli preliminari"
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || errore "$APP_DIR non è un repository git."
  # I file modificati a mano bloccherebbero il pull a metà, o peggio verrebbero
  # fusi in silenzio con quelli nuovi.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    git status --short --untracked-files=no
    errore "Ci sono file modificati a mano (elencati sopra). Annullali con 'git checkout -- <file>' e rilancia."
  fi
  git rev-parse --abbrev-ref '@{upstream}' >/dev/null 2>&1 \
    || errore "Il branch corrente non segue nessun branch remoto: impossibile fare git pull."
  sql -c "SELECT 1" >/dev/null || errore "Database non raggiungibile con le credenziali di .env."
  # Va deciso PRIMA del pull: le migrazioni già applicate sono quelle della
  # versione installata, non quelle che il pull sta per portare.
  prepara_registro

  titolo "Nuova versione"
  git fetch --quiet
  local prima nuovi
  prima="$(git rev-parse --short HEAD)"
  nuovi="$(git rev-list --count 'HEAD..@{upstream}')"
  if [[ "$nuovi" -eq 0 ]]; then
    info "Nessuna novità sul repository (versione $prima)."
    conferma "Ricompilo e riavvio comunque?" N || { info "Niente da fare."; return 0; }
  else
    echo "Modifiche in arrivo ($nuovi):"
    git log --format='  %h %s' 'HEAD..@{upstream}' | head -20
  fi

  titolo "Backup prima dell'aggiornamento"
  backup_ora || conferma "Il backup è fallito. Proseguo lo stesso?" N || errore "Aggiornamento annullato."

  if [[ "$nuovi" -gt 0 ]]; then
    git pull --ff-only || errore "git pull non riuscito: il repository locale e quello remoto hanno storie diverse."
    info "Codice aggiornato: $prima → $(git rev-parse --short HEAD)."
  fi

  # Da qui in poi un errore lascia il codice nuovo sul disco: si dice come
  # tornare a quello di prima invece di lasciare l'operatore a indovinarlo.
  build || fallito "$prima" "dipendenze npm o build non riuscite. L'applicazione in esecuzione non è stata riavviata."

  titolo "Database"
  applica_migrazioni || fallito "$prima" "una migrazione non è riuscita. L'applicazione in esecuzione non è stata riavviata."
  allinea_schema
  verifica_tabelle

  avvia_pm2
  attendi_app || fallito "$prima" "dopo il riavvio l'applicazione non risponde."
  titolo "Aggiornamento completato"
  riepilogo
}

fallito() {
  local prima="$1" motivo="$2" backup
  backup="$(ls -1t "$APP_DIR"/backups/*.sql.gz 2>/dev/null | head -1)"
  echo ""
  echo -e "${RED}Aggiornamento non riuscito:${NC} $motivo"
  echo ""
  echo "Per tornare alla versione precedente ($prima):"
  echo "  cd $APP_DIR"
  echo "  git reset --hard $prima"
  echo "  npm ci --include=dev && npm run build"
  echo "  pm2 restart $NOME_PM2 --update-env"
  echo "Il database è stato salvato prima dell'aggiornamento in:"
  echo "  ${backup:-<nessun backup trovato>}"
  echo "(ripristino: gunzip -c <file> | psql \"\$DATABASE_URL\" — solo se una migrazione ha modificato i dati)"
  exit 1
}

stato() {
  carica_env
  titolo "Stato"
  if command -v pm2 >/dev/null 2>&1 && pm2 describe "$NOME_PM2" >/dev/null 2>&1; then
    pm2 list | grep -E "name|$NOME_PM2" || true
  else
    warn "Nessun processo pm2 '$NOME_PM2'."
  fi
  attendi_app_una_volta
  if sql -c "SELECT 1" >/dev/null 2>&1; then
    info "Database raggiungibile."
    if registro_esiste; then
      local p; p="$(migrazioni_pendenti)"
      [[ -z "$p" ]] && info "Migrazioni: tutte applicate." || warn "Migrazioni non applicate: $(echo $p)"
    fi
  else
    warn "Database NON raggiungibile."
  fi
  local ultimo; ultimo="$(ls -1t "$APP_DIR"/backups/*.sql.gz 2>/dev/null | head -1)"
  [[ -n "$ultimo" ]] && info "Ultimo backup: $(basename "$ultimo")" || warn "Nessun backup in backups/."
  systemctl is-enabled "pm2-$(id -un)" >/dev/null 2>&1 \
    && info "Avvio automatico al boot attivo." \
    || warn "Avvio automatico al boot NON attivo."
  riepilogo
}

attendi_app_una_volta() {
  local codice
  codice="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${APP_PORT}/" || true)"
  [[ "$codice" == "200" ]] && info "L'applicazione risponde sulla porta ${APP_PORT}." \
    || warn "L'applicazione non risponde sulla porta ${APP_PORT} (codice: ${codice:-nessuno})."
}

# =============================================================================
# Menu
# =============================================================================

main() {
  # I prompt (menu, password, domande di drizzle-kit) leggono da tastiera: con
  # stdin rediretto drizzle-kit riceve EOF ed esce con 0 senza applicare niente.
  [[ -t 0 ]] || errore "deploy.sh va lanciato da un terminale interattivo."
  if [[ $EUID -eq 0 ]]; then
    warn "Stai usando root: pm2, i file dell'applicazione e il backup apparterranno a root."
    conferma "Continuo lo stesso?" N || exit 1
  fi

  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}  Notifiche Canali Irrigui — deploy${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo "  1) Prima installazione"
  echo "  2) Aggiorna (git pull + build + riavvio)"
  echo "  3) Stato"
  echo "  4) Crea superadmin"
  echo "  0) Esci"
  printf "Scelta: "
  local scelta; read -r scelta

  case "$scelta" in
    1) prima_installazione ;;
    2) aggiorna ;;
    3) stato ;;
    4) carica_env; crea_superadmin ;;
    0) exit 0 ;;
    *) errore "Scelta non valida: '$scelta'" ;;
  esac
}

# Tutto su una riga: `git pull` può sostituire questo file mentre gira, e bash
# non deve leggerne altro dopo il ritorno di main.
main "$@"; exit $?
