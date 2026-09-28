-- Modello vero del consorzio: madri / tratte / legami.
-- Le vecchie tabelle del mirror restano finché i lettori non sono spostati:
-- le elimina la 0012.
--
-- Ogni oggetto qui dentro è dichiarato anche in shared/schema.ts. Senza,
-- il prossimo `db:push` lo cancella senza avvisare.

CREATE TABLE IF NOT EXISTS madri (
  codice            text PRIMARY KEY,
  name              text NOT NULL DEFAULT '',
  categoria         text NOT NULL,
  tipo_irrigazione  text,
  origine           text NOT NULL,
  synced_at         timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tratte (
  keyroggia    text PRIMARY KEY,
  name         text NOT NULL DEFAULT '',
  codice_madre text NOT NULL REFERENCES madri(codice),
  synced_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tratte_madre_idx ON tratte (codice_madre);

CREATE TABLE IF NOT EXISTS legami (
  id         serial PRIMARY KEY,
  keykey     text NOT NULL,
  keyroggia  text NOT NULL,
  metodo     text NOT NULL,
  synced_at  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS legami_roggia_metodo_idx ON legami (keyroggia, metodo);
CREATE INDEX IF NOT EXISTS legami_keykey_idx ON legami (keykey);
