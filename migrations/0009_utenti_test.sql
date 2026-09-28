-- Utenti di test degli invii (issue #36).
--
-- Da applicare a mano: `npm run db:push` e' interattivo e in questo repository
-- le migrazioni non sono generate da drizzle-kit. Tabella e colonna sono
-- dichiarate anche in shared/schema.ts, o il primo push le cancellerebbe.

CREATE TABLE IF NOT EXISTS utenti_test (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  email       TEXT,
  tipo_email  TEXT NOT NULL DEFAULT 'normale',
  telefono    TEXT,
  attivo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Falso su tutto lo storico: prima di adesso ogni destinatario era un
-- conduttore vero.
ALTER TABLE notification_recipients
  ADD COLUMN IF NOT EXISTS utente_test BOOLEAN NOT NULL DEFAULT FALSE;
