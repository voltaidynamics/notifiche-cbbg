#!/usr/bin/env bash
#
# Backup giornaliero del database NotifichePozzi.
#
# Esegue un dump SQL compresso in backups/, verifica che sia integro e
# ripristinabile, poi tiene solo le ultime RETENTION copie.
#
# Uso:  ./scripts/backup-db.sh
# Cron: 30 22 * * * /home/ubuntu/apps/notifiche-canali-irrigui/scripts/backup-db.sh
#
# Ripristino di un backup:
#   gunzip -c backups/notifichepozzi_20260727_223000.sql.gz | psql "$DATABASE_URL"

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
RETENTION=30
LOG_MAX_LINES=500

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE"
}

# Qualsiasi uscita non prevista (set -e, segnale, errore di pg_dump) finisce
# comunque a log: senza questo un cron fallito resterebbe del tutto silenzioso.
FINISHED=0
on_exit() {
  local code=$?
  if [[ $FINISHED -eq 0 ]]; then
    log "ERRORE: backup interrotto (exit code $code)"
  fi
  rm -f "${TMP_FILE:-}"
  exit "$code"
}
trap on_exit EXIT

mkdir -p "$BACKUP_DIR"
touch "$LOG_FILE"

# --- Credenziali -------------------------------------------------------------
# Letta da .env invece che duplicata qui: un solo posto da aggiornare se la
# password del DB cambia.
ENV_FILE="$PROJECT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "ERRORE: file .env non trovato in $ENV_FILE"
  exit 1
fi

# Rimuove eventuali apici, spazi e CR (file salvato su Windows) attorno al valore.
DATABASE_URL="$(grep -m1 '^DATABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '\047" \r')"
if [[ -z "$DATABASE_URL" ]]; then
  log "ERRORE: DATABASE_URL assente o vuota in .env"
  exit 1
fi

DB_NAME="$(basename "${DATABASE_URL%%\?*}")"
[[ -n "$DB_NAME" ]] || DB_NAME="database"

# --- Dump --------------------------------------------------------------------
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
TARGET="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql.gz"
TMP_FILE="$TARGET.tmp"

# Si scrive su .tmp e si rinomina solo a verifica superata: nella cartella non
# compare mai un dump troncato con l'aria di essere valido.
if ! pg_dump --no-password "$DATABASE_URL" 2>>"$LOG_FILE" | gzip -c >"$TMP_FILE"; then
  log "ERRORE: pg_dump fallito per $DB_NAME"
  exit 1
fi

# --- Verifica ----------------------------------------------------------------
if [[ ! -s "$TMP_FILE" ]]; then
  log "ERRORE: dump vuoto, backup annullato"
  exit 1
fi

if ! gzip -t "$TMP_FILE" 2>>"$LOG_FILE"; then
  log "ERRORE: archivio gzip corrotto, backup annullato"
  exit 1
fi

# pg_dump chiude sempre con questa riga: se manca, il dump si e' interrotto a
# meta' pur avendo prodotto un gzip formalmente valido.
if ! gunzip -c "$TMP_FILE" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
  log "ERRORE: dump incompleto (marcatore finale assente), backup annullato"
  exit 1
fi

mv "$TMP_FILE" "$TARGET"
TMP_FILE=""
SIZE="$(du -h "$TARGET" | cut -f1)"
log "OK: creato $(basename "$TARGET") ($SIZE)"

# --- Rotazione ---------------------------------------------------------------
# Solo dopo che il nuovo backup e' stato validato: se il dump fallisce, le
# copie vecchie restano tutte al loro posto.
mapfile -t OLD < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" -printf '%f\n' |
    sort -r | tail -n "+$((RETENTION + 1))"
)
for f in "${OLD[@]:-}"; do
  [[ -n "$f" ]] || continue
  rm -f "$BACKUP_DIR/$f"
  log "rimosso backup obsoleto: $f"
done

REMAINING="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_*.sql.gz" | wc -l)"
log "backup presenti: $REMAINING/$RETENTION"

# --- Log rotation ------------------------------------------------------------
if [[ "$(wc -l <"$LOG_FILE")" -gt "$LOG_MAX_LINES" ]]; then
  tail -n "$LOG_MAX_LINES" "$LOG_FILE" >"$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
fi

FINISHED=1
