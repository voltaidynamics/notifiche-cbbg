-- Seconda gerarchia: le rogge madri R e le loro figlie (issue #49).
--
-- Additiva: il codice vecchio non legge queste tabelle, quindi si applica
-- PRIMA del riavvio sul codice nuovo — come la 0011. Senza, le rotte
-- /api/consorzio/rogge-* rispondono 500 con «relation "madri_rogge" does not exist».
--
-- I nomi non sono rogge_madri/rogge_figlie: quelli li ha cancellati la 0012.

CREATE TABLE IF NOT EXISTS madri_rogge (
  codice     text PRIMARY KEY,
  name       text NOT NULL DEFAULT '',
  synced_at  timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tratte_rogge (
  keyroggia    text PRIMARY KEY,
  name         text NOT NULL DEFAULT '',
  codice_madre text NOT NULL REFERENCES madri_rogge(codice),
  synced_at    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tratte_rogge_madre_idx ON tratte_rogge (codice_madre);
