-- Cancella le sei righe ws.roggeMadri.*/ws.roggeFiglie.* rimaste in app_settings
-- dal vecchio mirror a prefisso, lasciate INERTI dalla 0012 invece che cancellate.
--
-- Il problema: le due entità nuove della gerarchia rogge madri R (issue #49,
-- migrazione 0013) si chiamano, per coincidenza di nome col vecchio modello,
-- esattamente "roggeMadri" e "roggeFiglie" (shared/wsEntities.ts). Le chiavi
-- app_settings che il codice legge sono "ws.<entita>.<campo>" (chiaveSetting()
-- in server/sync/config.ts): quindi "ws.roggeMadri.mode"/"ws.roggeMadri.path"
-- e "ws.roggeFiglie.mode"/"ws.roggeFiglie.path" (mai .url, mai scritte) sono
-- le stesse identiche righe che la vecchia entità roggeMadri/roggeFiglie del
-- mirror a prefisso usava prima della 0011/0012 — non cancellate apposta,
-- perché all'epoca nessun codice le avrebbe più lette.
--
-- Verificato sul database di produzione (sola lettura) il 2026-09-22:
--
--   ws.roggeMadri.mode  = file
--   ws.roggeMadri.path  = /home/ubuntu/apps/notifiche-canali-irrigui/dati-ws/rogge-madri.json
--   ws.roggeFiglie.mode = file
--   ws.roggeFiglie.path = /home/ubuntu/apps/notifiche-canali-irrigui/dati-ws/rogge-figlie.json
--
-- e i due file esistono ancora su disco, con la forma del vecchio mirror.
-- Senza questa migrazione, il primo sync dopo il deploy leggerebbe quei file
-- come se fossero le due entità nuove, con due esiti entrambi silenziosi:
--
--   - dati-ws/rogge-madri.json ha la forma {"codicemadre":"R01","name":"R01 -
--     Roggia bolgare e derivate"} — identica a quella di ANAGRAFICA_R.
--     parseRoggiaMadre() la accetta senza errori: la gerarchia si popola con
--     l'elenco di luglio 2026, vecchio ma plausibile, e nessun errore lo segnala.
--   - dati-ws/rogge-figlie.json contiene codici S (S02D00000...), che
--     parseRoggiaFiglia() scarta tutti perché non iniziano per "R". Risultato:
--     26 rogge madri e ZERO figlie, scritte comunque con esito "success" — il
--     quarto bottone «Rogge madri» in Invia notifica si aprirebbe pieno di
--     rogge senza nessuna tratta sotto.
--
-- Una riga app_settings con questi nomi non può essere una configurazione
-- legittima delle due entità nuove: il codice che le definisce (shared/
-- wsEntities.ts con roggeMadri/roggeFiglie sui nuovi endpoint) non esisteva
-- quando queste righe sono state scritte. La cancellazione è quindi
-- incondizionata e sicura — non "se vuote", non "se puntano a un percorso
-- sospetto": qualunque valore ci sia dentro è un residuo dell'epoca sbagliata.
--
-- Applicare A MANO, PRIMA del riavvio sul codice nuovo, insieme alla 0013
-- (vedi noteDeploy.md §13): il codice vecchio non legge mai queste chiavi con
-- questo significato, quindi non c'è nessun momento in cui sia rischioso
-- cancellarle. Non tocca i file dati-ws/rogge-madri.json e dati-ws/rogge-
-- figlie.json: restano sul disco, sono dati dell'utente, non codice.

DELETE FROM app_settings WHERE key IN (
  'ws.roggeMadri.mode',
  'ws.roggeMadri.url',
  'ws.roggeMadri.path',
  'ws.roggeFiglie.mode',
  'ws.roggeFiglie.url',
  'ws.roggeFiglie.path'
);
