-- Storico Notifiche (issue #12)
-- Additiva e idempotente: colonne nuove, nessun dato riscritto.
--
-- notifications.tipo        : tipo mostrato in tabella (Programmata/Urgente/...)
-- notification_recipients.* : snapshot anagrafico al momento dell'invio, perché
--                             le tabelle mirror del consorzio vengono sovrascritte
--                             a ogni sync e lo storico deve restare fedele.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'programmata';

ALTER TABLE notification_recipients
  ADD COLUMN IF NOT EXISTS keykey text,
  ADD COLUMN IF NOT EXISTS conduttore_descrizione text,
  ADD COLUMN IF NOT EXISTS keyroggia text,
  ADD COLUMN IF NOT EXISTS roggia_descrizione text;

-- Il filtro "Roggia" dello storico cerca per codice tratta.
CREATE INDEX IF NOT EXISTS notification_recipients_keyroggia_idx
  ON notification_recipients (keyroggia);
