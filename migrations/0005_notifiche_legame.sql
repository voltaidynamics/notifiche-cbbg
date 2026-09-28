-- Con quale dei due legami del consorzio è partita una comunicazione:
-- "live" oppure "stagione" (issue #27).
--
-- Il consorzio lega un conduttore a una tratta in due modi, esportati
-- separatamente dal web service e distinti nel mirror da `associazioni.metodo`.
-- Fino a qui l'invio non li distingueva: risolveva i destinatari senza mai
-- guardare il metodo, e raggiungeva l'unione dei due elenchi. Ora la scelta è
-- esplicita e va registrata, o a distanza di mesi non si saprebbe più a quale
-- dei due elenchi una comunicazione era indirizzata.
--
-- Nullable, e resta null sul percorso legacy (`/api/notifications/send`, lo
-- scheduler, l'API SCADA): quelle notifiche risolvono i destinatari dalle
-- tabelle con id numerici, dove i due legami non esistono.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS legame text;
