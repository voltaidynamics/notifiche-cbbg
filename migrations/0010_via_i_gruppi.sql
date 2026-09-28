-- Issue #45: la gestione utenti non ha più i gruppi.
--
-- Un gruppo era un insieme di pagine concedibili (`groups.allowed_pages`, un
-- array JSON di slug) che si assegnava ai soli ruoli `user` e `osservatore`:
-- `resolveAllowedPages()` lo risolveva a ogni login e il client ne ricavava
-- quali voci mostrare in sidebar e quali rotte lasciare aprire.
--
-- Il consorzio ha deciso che quel livello non serve: chi entra vede
-- l'applicazione, e a limitare restano i ruoli sulle rotte (`requireAdmin`,
-- `requireRole("superadmin")`, la guardia globale che rifiuta ogni scrittura a
-- un osservatore). Quello che vede un utente ora è esattamente ciò che vedeva
-- un utente senza gruppo, cioè il caso di tutti: nel database di produzione
-- `groups` era vuota e `app_users.group_id` era NULL su ogni riga, quindi la
-- rimozione non toglie l'accesso a nessuno e non ha nulla da riassegnare.
--
-- L'ordine conta: prima la colonna che referenzia, poi la tabella referenziata.

ALTER TABLE app_users DROP COLUMN IF EXISTS group_id;

DROP TABLE IF EXISTS groups;
