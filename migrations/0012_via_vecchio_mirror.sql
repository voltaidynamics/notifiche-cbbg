-- Via il mirror a prefisso, sostituito da madri/tratte/legami (0011).
--
-- Nessuno storico da preservare: al 2026-09-10 in produzione ci sono zero
-- notifiche, zero target e zero destinatari. Le tabelle contengono solo la
-- copia del consorzio, che il primo sync riscrive per intero.
--
-- L'ordine rispetta le dipendenze: rogge_comuni prima di comuni.

DROP TABLE IF EXISTS rogge_comuni;
DROP TABLE IF EXISTS comuni;
DROP TABLE IF EXISTS associazioni;
DROP TABLE IF EXISTS rogge_figlie;
DROP TABLE IF EXISTS rogge_madri;
