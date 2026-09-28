-- Cosa è stato selezionato in una comunicazione: i codici, non i destinatari
-- (issue #22).
--
-- Lo stato aperta/chiusa di una roggia si ricava da qui, e non dagli snapshot
-- dei destinatari: una tratta chiusa senza conduttori legati non comparirebbe
-- in nessuna riga di notification_recipients, ed è una di quelle che la
-- Dashboard deve contare.
--
-- ON DELETE CASCADE non è un dettaglio: cancellare una notifica deve rimettere
-- lo stato com'era prima, senza codice di compensazione da nessuna parte.

CREATE TABLE IF NOT EXISTS notification_targets (
  id              serial PRIMARY KEY,
  notification_id integer NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  codice          text NOT NULL,
  livello         text NOT NULL,
  descrizione     text
);

CREATE INDEX IF NOT EXISTS notification_targets_codice_idx ON notification_targets (codice);
CREATE INDEX IF NOT EXISTS notification_targets_notifica_idx ON notification_targets (notification_id);
