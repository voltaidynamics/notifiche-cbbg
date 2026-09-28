-- Gestione Codici (issue #52): le madri che l'admin ha spento, per gerarchia.
--
-- Tabella dell'app, non del mirror: il sync riscrive madri e madri_rogge ogni
-- notte. Si scrivono solo i codici spenti, quindi alla creazione la tabella è
-- vuota e ogni codice è acceso — è il «al primo rilascio tutti accesi» della
-- issue, senza nessun backfill.
--
-- Additiva: si applica PRIMA del riavvio sul codice nuovo. Senza, ogni rotta
-- di Invia notifica e di Anagrafiche risponde 500 con
-- `relation "codici_spenti" does not exist`. Idempotente.

CREATE TABLE IF NOT EXISTS codici_spenti (
  gerarchia text NOT NULL,
  codice    text NOT NULL,
  spento_da text,
  spento_il timestamp NOT NULL DEFAULT now(),
  CONSTRAINT codici_spenti_gerarchia_codice_pk PRIMARY KEY (gerarchia, codice)
);
