-- Entità saltate nel sync consorzio (Correzione 2, revisione feature/anagrafiche-sync-consorzio)
-- Additiva e idempotente: colonna nuova, nessun dato riscritto.
--
-- sync_logs.skipped_entities : JSON (array di etichette) delle entità saltate
--                              perché non configurate in quel sync, distinte
--                              dagli errori veri in "errors". Nullable e senza
--                              default: i log già esistenti non hanno
--                              quell'informazione e null la rappresenta
--                              correttamente.

ALTER TABLE sync_logs
  ADD COLUMN IF NOT EXISTS skipped_entities text;
