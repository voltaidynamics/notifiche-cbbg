-- Issue #126: lettura dei bounce dalla casella Microsoft 365 delle notifiche.
-- Additiva: nessun codice vecchio legge queste colonne o questa tabella.
-- Dichiarate anche in shared/schema.ts, o il prossimo db:push le cancella.

ALTER TABLE notification_recipients
  ADD COLUMN IF NOT EXISTS email_bounce_codice text,
  ADD COLUMN IF NOT EXISTS email_bounce_tipo text,
  ADD COLUMN IF NOT EXISTS email_bounce_at timestamp;

CREATE INDEX IF NOT EXISTS notification_recipients_email_message_id_idx
  ON notification_recipients (email_message_id);

CREATE TABLE IF NOT EXISTS bounce_messaggi (
  id serial PRIMARY KEY,
  chiave text NOT NULL,
  ricevuto_at timestamp NOT NULL,
  mittente text,
  oggetto text,
  e_bounce boolean NOT NULL,
  codice text,
  tipo text,
  diagnostica text,
  destinatario text,
  message_id_originale text,
  recipient_id integer,
  abbinamento text,
  esaminato_at timestamp NOT NULL DEFAULT now(),
  notificato_at timestamp,
  -- Nomi espliciti, quelli che genera drizzle-kit: con i nomi predefiniti di
  -- PostgreSQL (`_key`, `_fkey`) db:push li vedrebbe diversi e li ricreerebbe.
  CONSTRAINT bounce_messaggi_chiave_unique UNIQUE (chiave),
  CONSTRAINT bounce_messaggi_recipient_id_notification_recipients_id_fk
    FOREIGN KEY (recipient_id) REFERENCES notification_recipients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bounce_messaggi_ricevuto_at_idx ON bounce_messaggi (ricevuto_at);
