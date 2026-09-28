-- Issue #18: una comunicazione ha tre tipi soli — Apertura, Chiusura, Altro —
-- e non esistono invii automatici.
--
-- Spariscono tre cose, decise nella coda della issue:
--
-- 1. `notifications.event_type`, che ammetteva cinque tipologie (chiusura,
--    manutenzione, riduzione portata, apertura, straordinario) accanto ai tre
--    di `tipo`. Due classificazioni dello stesso fatto, di cui una che nessuna
--    schermata mostrava più: quello che una comunicazione è lo dicono `tipo` e
--    `classificazione` (issue #12).
--
-- 2. `event_type_channel_config`, la tabella dietro la scheda Impostazioni →
--    Tipologie: diceva "questo evento va per mail, quest'altro per SMS" e
--    nessun percorso di invio la leggeva. Scheda e tabella se ne vanno insieme.
--
-- 3. `api_keys`, le chiavi dell'API SCADA `/api/v1`. La rotta permetteva a un
--    sistema esterno di far partire una comunicazione da solo: il consorzio ha
--    deciso che quella possibilità non deve esistere. Nessuna chiave era mai
--    stata emessa.
--
-- Il DB è ancora in fase di test e non contiene notifiche registrate: non c'è
-- nulla da riclassificare prima di droppare la colonna.

ALTER TABLE notifications DROP COLUMN IF EXISTS event_type;

DROP TABLE IF EXISTS event_type_channel_config;

DROP TABLE IF EXISTS api_keys;

-- La pagina "Chiavi API" non esiste più: toglierla dai permessi dei gruppi,
-- altrimenti resta uno slug che non corrisponde a nulla e che il pannello
-- admin riscriverebbe alla prima modifica del gruppo.
UPDATE groups
SET allowed_pages = (
  SELECT COALESCE(jsonb_agg(p)::text, '[]')
  FROM jsonb_array_elements_text(allowed_pages::jsonb) AS p
  WHERE p <> 'api-keys'
)
WHERE allowed_pages::jsonb @> '["api-keys"]'::jsonb;
