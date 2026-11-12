-- Issue #129: se chi ha spedito ha acceso «Invia anche via SMS».
--
-- Additiva, nullable e senza default: per le notifiche già in tabella la
-- scelta non è mai stata registrata, e un default (false o true) la
-- inventerebbe. Per quelle lo Storico la ricava dagli esiti SMS dei
-- destinatari (`invioSmsAttivo()` in shared/storico-notifiche.ts).
-- Dichiarata anche in shared/schema.ts, o il prossimo db:push la cancella.
-- Va applicata prima di riavviare sul codice nuovo: senza, ogni lettura di
-- `notifications` risponde 500 (la colonna è nel select).

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS invio_sms boolean;
