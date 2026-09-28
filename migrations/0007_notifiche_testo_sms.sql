-- Issue #28: il testo SMS della comunicazione, scritto in «Invia notifica»
-- accanto al testo della mail.
--
-- Nullable e senza default: le notifiche già in tabella non hanno mai avuto un
-- testo SMS, e una stringa vuota le farebbe sembrare invii a cui l'SMS è stato
-- scritto e non è partito. Nessun SMS viene ancora spedito da nessun percorso.

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_sms text;
