-- Il canale con cui è partita ogni comunicazione: "normale" oppure "pec" (issue #23).
--
-- L'anagrafica distingue i conduttori con `tipo_email` e le mail partono da due
-- account distinti. Il canale va fotografato sul destinatario come il resto
-- dello snapshot: il `tipo_email` del mirror è riscritto a ogni sync, e a
-- distanza di mesi «questa comunicazione è andata per PEC?» — che per una PEC è
-- la domanda che conta — non avrebbe più risposta.
--
-- Resta null sulle notifiche precedenti ai due canali: erano tutte partite
-- dall'unica casella configurata, ma dichiararlo a posteriori sarebbe inventare
-- un dato che nessuno ha registrato.

ALTER TABLE notification_recipients
  ADD COLUMN IF NOT EXISTS canale text;
