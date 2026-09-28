# Notifiche Canali Irrigui

Applicazione web per avvisare i **conduttori** del consorzio, via email, PEC e SMS, degli
eventi sulle rogge, sulle tratte, sugli impianti e sui pozzi da cui prelevano: aperture,
chiusure, interventi straordinari, casi di inquinamento.

Le anagrafiche non si inseriscono a mano. Conduttori, rogge madri, tratte e legami
conduttore → tratta vengono letti ogni notte dal web service del consorzio, e l'applicazione
ne tiene una **copia in sola lettura**.

---

## Funzionalità

| Pagina | Cosa fa |
|---|---|
| **Dashboard** | Riepilogo delle comunicazioni e delle tratte attualmente chiuse |
| **Invia notifica** | Si scelgono le tratte, oppure le madri per i pozzi. Si compongono il testo email e il testo SMS e si inviano ai conduttori collegati |
| **Storico** | Ogni comunicazione inviata, con i destinatari, il canale usato e lo stato di consegna e di apertura |
| **Template** | Testi predefiniti per email e SMS, richiamabili in fase di invio |
| **Anagrafiche** | Consultazione della copia locale delle anagrafiche del consorzio |
| **Gestione Codici** | Disattiva singole madri, che così spariscono da invio e anagrafiche |
| **Impostazioni** | Credenziali email, PEC e SMS, web service del consorzio, Active Directory, utenti di test |
| **Gestione Utenti** | Utenti dell'applicazione, ruoli e richieste di accesso |

Le guide per l'utente finale sono pubblicate dall'applicazione stessa
(`/guida-utente.html` e `/guida-super-user.html`).

### Regole di invio

- **Un messaggio per conduttore.** Chi è collegato a più tratte selezionate riceve una sola
  comunicazione, che le elenca tutte.
- **I conduttori non attivi non ricevono mai nulla.** Nelle anagrafiche restano, perché
  servono a risolvere i legami.
- **Posta ordinaria e PEC partono da due caselle distinte**, scelte in base al tipo di
  indirizzo del destinatario. Se la selezione contiene indirizzi PEC e la PEC non è
  configurata, l'invio viene rifiutato per intero. Non si ripiega sulla casella ordinaria:
  una PEC spedita da una casella normale non ha valore legale.
- **Gli SMS partono solo con la spunta «Invia anche via SMS».** Il fornitore è
  Register.it (sfera.net).
- **Tipo** (apertura, chiusura, altro) e **classificazione** (ordinaria, straordinaria,
  inquinamento) sono obbligatori.
- **Lo stato aperta/chiusa di una tratta si ricava dalle comunicazioni inviate.** Non è
  un campo che si modifica. Chiudere una madre chiude anche tutte le sue tratte.
- **Gli utenti di test ricevono una copia di ogni comunicazione.** Si attivano uno per
  uno da Impostazioni. Le comunicazioni inviate soltanto a loro si possono eliminare
  dallo Storico.

### Ruoli

| Ruolo | Accesso |
|---|---|
| `superadmin` | Tutto, comprese le sezioni Active Directory e Utenti di test delle Impostazioni |
| `admin` | Tutto, tranne quelle due sezioni |
| `user` | Tutte le pagine tranne Gestione Utenti |
| `osservatore` | Può consultare tutto ma non modificare niente: il server rifiuta ogni scrittura |

L'autenticazione è **locale** (password nell'applicazione) oppure **Active Directory**
(simple bind LDAP sul domain controller del consorzio), scelta utente per utente. Deve
sempre esistere almeno un superadmin locale: è l'unico che riesce a entrare quando il domain
controller non risponde.

---

## Stack tecnico

- **Backend**: Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL
- **Frontend**: React, Vite, Tailwind CSS, shadcn/ui (Radix UI), TanStack Query, wouter
- **Email**: Nodemailer (Gmail o SMTP generico, più un secondo account per la PEC)
- **SMS**: Register.it / sfera.net
- **Job pianificati**: node-cron, dentro il processo dell'applicazione
- **Test**: Vitest

In produzione c'è un solo processo: Express serve sia le API sia il frontend compilato.

### Struttura

```
client/src/    frontend React (una pagina per file in pages/)
server/        backend Express: rotte, storage, invio, scheduler
server/sync/   sincronizzazione delle anagrafiche dal web service del consorzio
shared/        schema del database, tipi e regole condivise fra client e server
migrations/    SQL per aggiornare un database esistente (vedi «Aggiornamenti»)
scripts/       backup, creazione del primo superadmin, generazione delle guide
docs/          sorgenti Markdown delle guide utente
```

---

## Requisiti

| Componente | Versione |
|---|---|
| Node.js | 20 o superiore (se manca, `deploy.sh` installa la 22 da NodeSource) |
| PostgreSQL | 16 consigliato |
| `postgresql-client` (`psql`, `pg_dump`) | stessa major del server o superiore |
| pm2 | installato globalmente (`npm install -g pm2`) |
| git, openssl, cron | presenti sul sistema |

`pg_dump` deve essere almeno della stessa versione del server PostgreSQL. Se è più vecchio
si rifiuta di fare il dump, e il backup notturno smette di funzionare senza altri sintomi.

Su Debian/Ubuntu non serve installarli a mano: la prima installazione di `deploy.sh`
controlla cosa manca e, dopo conferma, lo installa con `apt` (Node.js da NodeSource, pm2
con npm). Su altre distribuzioni lo script elenca cosa manca e si ferma. Serve solo `git`
per il clone, e un utente con `sudo`.

---

## Installazione

### 1. Codice e dipendenze

```bash
git clone <url-del-repository> notifiche-canali-irrigui
cd notifiche-canali-irrigui
```

### 2. Prima installazione guidata

```bash
./deploy.sh      # → 1) Prima installazione
```

Va lanciato dall'utente di sistema che farà girare l'applicazione (non da root). Lo script
chiede **la porta** su cui pubblicarla (default `8610`, rifiuta una porta già occupata) e
l'**indirizzo pubblico** (facoltativo), poi esegue in sequenza:

1. installa le dipendenze di sistema mancanti: Node.js, PostgreSQL, `psql`/`pg_dump`, git,
   cron, pm2;
2. crea il file `.env` con la porta scelta, una password del database e un
   `SESSION_SECRET` casuali (permessi `600`);
3. crea l'utente e il database PostgreSQL sul cluster locale (via `sudo -u postgres`);
4. esegue `npm ci` e `npm run build`;
5. crea lo schema del database e controlla che esistano **tutte** le tabelle di
   `shared/schema.ts`;
6. chiede username e password del primo superadmin;
7. se `ufw` è attivo, chiede se aprire la porta;
8. avvia l'applicazione con pm2, esegue `pm2 save` e attiva l'avvio automatico al boot
   (`pm2 startup`);
9. programma il backup notturno del database;
10. controlla che l'applicazione risponda sulla porta scelta.

Rilanciarla è innocuo: non ricrea il `.env`, non tocca un database già esistente, non crea
un secondo superadmin.

**`deploy.sh` va lanciato da un terminale interattivo.** Con l'input rediretto
(`printf '1\n' | ./deploy.sh`) si rifiuta di partire: le domande di drizzle-kit
riceverebbero un input vuoto e lo schema non verrebbe applicato, senza errori visibili.

### 3. Pubblicazione

L'applicazione ascolta sulla porta scelta all'installazione (variabile `PORT` in `.env`).
Si può usare direttamente (`http://<ip-del-server>:<porta>`) oppure metterla dietro un reverse
proxy con HTTPS (nginx, Nginx Proxy Manager, Caddy…). In quel caso, in `.env`:

```
APP_URL=https://dominio-pubblico
```

Senza `APP_URL` le email partono lo stesso, ma senza il pixel che registra l'apertura
(nei log compare un avviso).

### 4. Aggiornare a una nuova versione

```bash
./deploy.sh      # → 2) Aggiorna
```

1. rifiuta di partire se qualche file del repository è stato modificato a mano;
2. mostra le modifiche in arrivo (se non ce ne sono, chiede se ricompilare comunque);
3. fa un backup del database;
4. `git pull`, `npm ci`, `npm run build`;
5. applica le migrazioni nuove di `migrations/`, ciascuna in una transazione;
6. allinea lo schema con `db:push` (senza `--force`: se drizzle-kit propone di cancellare o
   rinominare qualcosa, rispondere **No, abort**);
7. riavvia pm2 e controlla che l'applicazione risponda.

Se un passo fallisce, lo script stampa i comandi esatti per tornare alla versione
precedente e il percorso del backup appena fatto. Una migrazione fallita viene annullata per
intero, e l'applicazione in esecuzione non viene riavviata.

`./deploy.sh` → `3) Stato` mostra processo, porta, migrazioni in sospeso, ultimo backup e
avvio automatico. `4) Crea superadmin` serve solo se non ne esiste nessuno.

### 5. Configurazione dall'interfaccia

Con il superadmin creato al passo 2, da **Impostazioni**:

- **WebService**: l'indirizzo base del web service del consorzio e le credenziali. Si può
  provare la connessione e lanciare subito un caricamento con *Aggiorna ora*. In
  alternativa ogni anagrafica si può caricare da un file JSON.
- **Email** e **PEC**: le due caselle mittenti, ciascuna con il suo pulsante di prova.
- **SMS**: client ID e password di Register.it. Il pulsante di prova legge il credito
  residuo e non consuma SMS.
- **Active Directory** (solo superadmin): host, porta, suffisso di dominio e certificato
  della CA del domain controller. Sono i dati che forniscono i sistemisti del consorzio.

Le impostazioni salvate dall'interfaccia sono memorizzate nel database e **hanno la
precedenza** sulle variabili d'ambiente corrispondenti. Le password salvate non vengono
mai rimostrate. Se si salva un campo password vuoto, resta quella già memorizzata.

---

## Variabili d'ambiente (`.env`)

| Variabile | Descrizione |
|---|---|
| `DATABASE_URL` | Stringa di connessione PostgreSQL. **Necessaria**: senza, i dati restano in memoria e si perdono a ogni riavvio |
| `SESSION_SECRET` | Stringa casuale di almeno 32 caratteri. Obbligatoria in produzione |
| `PORT` | Porta dell'applicazione (default `8610`) |
| `NODE_ENV` | `production` in produzione, `development` per lo sviluppo |
| `APP_URL` | URL pubblico, usato dal pixel di apertura delle email |
| `SESSION_SECURE` | `true` se l'applicazione è servita in HTTPS |
| `EMAIL_SERVICE` | Servizio Nodemailer (default `gmail`), oppure `smtp` |
| `EMAIL_USER`, `EMAIL_PASSWORD` | Casella mittente della posta ordinaria |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Solo con `EMAIL_SERVICE=smtp` |
| `EMAIL_PEC_USER`, `EMAIL_PEC_PASSWORD` | Casella PEC mittente |
| `EMAIL_PEC_SERVICE` | Default `smtp` |
| `SMTP_PEC_HOST`, `SMTP_PEC_PORT`, `SMTP_PEC_SECURE` | Server del gestore PEC (es. `smtps.pec.aruba.it`, `465`, `true`) |
| `SMS_CLIENTID`, `SMS_PASSWORD` | Credenziali Register.it (sfera.net) |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | Solo per `npm run seed:admin`. Se mancano, lo script le chiede |

Le credenziali email, PEC e SMS in `.env` valgono solo come punto di partenza: quelle
salvate da Impostazioni hanno la precedenza. Web service e Active Directory si configurano
**solo** dall'interfaccia.

Dopo una modifica a `.env`:

```bash
pm2 restart notifichepozzi --update-env
```

---

## Web service del consorzio

La sincronizzazione legge dieci elenchi dal percorso `/RestTabelle/RestTabelle.svc` del web
service:

| Elenco | Endpoint |
|---|---|
| Conduttori | `getconduttoriconemailetelefono/-` |
| Impianti (madri) | `getimpianti/-` |
| Madri dei gruppi di consegna | `getroggemadri/orarigruppiconsegna` |
| Tratte degli impianti | `getimpiantirogge/all` |
| Tratte dei gruppi di consegna | `getroggeorari/S` |
| Legami live (impianti) | `getconduttoriroggelive/I` |
| Legami live (gruppi di consegna) | `getconduttoriroggelive/S` |
| Legami di stagione | `getconduttoriroggecartoline/R` |
| Rogge madri | `getroggemadri/orarirogge` |
| Rogge figlie | `getroggeorari/R` |

- Parte **ogni notte alle 03:00** e si può lanciare a mano da Impostazioni → WebService.
  Al termine arriva un'email di riepilogo.
- **I conduttori si scrivono a parte, le anagrafiche in blocco.** Madri, tratte e legami si
  aggiornano solo se tutti e sette i loro elenchi sono stati letti. Se ne manca anche uno
  resta la copia della notte precedente e il caricamento risulta *parziale*. Rogge madri e
  rogge figlie formano un secondo blocco, indipendente dal primo.
- Le righe non utilizzabili si scartano e si contano: codici `N`, aggregazioni `NM`/`ZM`,
  legami senza tratta. I conteggi compaiono nell'email di riepilogo e in Impostazioni.
- Le tabelle delle anagrafiche vengono **riscritte per intero** a ogni caricamento. Non
  vanno modificate a mano: le modifiche andrebbero perse la notte successiva.

---

## Gestione ordinaria

```bash
./deploy.sh                    # menu:
                               #   1) Prima installazione
                               #   2) Aggiorna (git pull + build + riavvio)
                               #   3) Stato
                               #   4) Crea superadmin
pm2 logs notifichepozzi        # log in tempo reale
pm2 restart notifichepozzi     # riavvio
./scripts/backup-db.sh         # backup manuale
```

### Job automatici

| Job | Dove gira | Quando | Cosa fa |
|---|---|---|---|
| Notifiche programmate | nel processo dell'applicazione | ogni minuto | invia le comunicazioni in coda |
| Sincronizzazione anagrafiche | nel processo dell'applicazione | 03:00 | rilegge il web service del consorzio |
| Backup del database | crontab dell'utente di sistema | 22:30 | dump e rotazione delle copie |

I primi due girano solo se l'applicazione è avviata. Gli orari di cron sono **ora del
server**: se il server è in UTC, le 22:30 corrispondono alle 00:30 italiane d'estate.

---

## Backup del database

`scripts/backup-db.sh` scrive un dump SQL compresso in `backups/`. Prima di toccare le copie
esistenti controlla che il nuovo dump sia integro, poi tiene le **ultime 30 copie**. Se il
dump fallisce esce con errore e **non cancella nulla**. Le credenziali le legge da `.env`.

La riga di crontab la installa `./deploy.sh` (opzione 1). A mano:

```bash
P=/percorso/di/notifiche-canali-irrigui
( crontab -l 2>/dev/null | grep -v 'backup-db.sh'
  echo "30 22 * * * $P/scripts/backup-db.sh >> $P/backups/cron.log 2>&1"
) | crontab -
```

L'esito di ogni esecuzione è registrato in `backups/backup.log`.

Ripristino:

```bash
gunzip -c backups/notifichepozzi_AAAAMMGG_HHMMSS.sql.gz | psql "$DATABASE_URL"
pm2 restart notifichepozzi
```

Il dump contiene anche le impostazioni salvate dall'interfaccia: web service, credenziali e
Active Directory. Ripristinandolo su un server nuovo non serve reinserirle.

**I backup restano sullo stesso disco del database.** Proteggono da cancellazioni e da errori
sui dati, non da un guasto del server. Si consiglia di copiarli periodicamente altrove.

---

## Aggiornamenti e schema del database

- **Installazione nuova**: lo schema viene creato interamente da `npm run db:push`, e le
  migrazioni presenti in `migrations/` vengono segnate come già applicate.
- **Aggiornamento**: `deploy.sh` → `2) Aggiorna` applica in ordine i file di `migrations/`
  non ancora applicati e li registra nella tabella `deploy.migrazioni_applicate` (in uno
  schema a parte, perché `db:push` cancellerebbe una tabella non dichiarata in
  `shared/schema.ts`).
- **Database creato prima di questo script**: al primo aggiornamento il registro non esiste,
  e lo script chiede se segnare come applicate le migrazioni presenti *prima* del pull. La
  risposta giusta è sì, se l'applicazione funziona con la versione installata.
- Una migrazione che va eseguita in un momento diverso dal rilascio (come `0012`, che elimina
  tabelle solo dopo una sincronizzazione riuscita) non va messa in `migrations/` finché quel
  momento non è arrivato: lo script applica tutto ciò che trova.

Tre cose da sapere su `db:push`:

1. **È interattivo.** Per ogni tabella nuova chiede se è nuova o se è una tabella esistente
   rinominata. Va eseguito in un terminale vero. Con l'output o l'input rediretto non
   applica niente, e non lo segnala.
2. **Elimina tutto ciò che non è dichiarato in `shared/schema.ts`.** Un indice o una tabella
   creati solo da un file SQL vengono cancellati al push successivo. Ogni oggetto del
   database va dichiarato anche nello schema.
3. **La tabella `session` è esclusa apposta** (`tablesFilter` in `drizzle.config.ts`). La
   gestisce la libreria delle sessioni, che la crea da sola. Se si toglie l'esclusione,
   `db:push` la elimina e tutti gli utenti vengono disconnessi.

`deploy.sh` controlla da sé che esistano tutte le tabelle dello schema. A mano:

```bash
psql "$DATABASE_URL" -c "\dt"
```

---

## Sviluppo

```bash
npm install
npm run dev          # Express + Vite in modalità sviluppo, porta 8610
npm test             # test unitari (Vitest)
npm run check        # controllo dei tipi TypeScript
npm run build        # build di produzione (guide, frontend e server in dist/)
npm start            # avvia la build di produzione
npm run guide:build  # rigenera le guide HTML da docs/guida-*.md
npm run seed:admin   # crea il primo superadmin
```

- Gli alias di import sono `@/` per `client/src/` e `@shared/` per `shared/`.
- **Aggiungere una funzionalità** richiede tre passi:
  1. schema in `shared/schema.ts`, poi `npm run db:push`;
  2. metodo nell'interfaccia `IStorage` e nelle **due** implementazioni di
     `server/storage.ts`, poi la rotta in `server/routes.ts`;
  3. funzione in `client/src/lib/api.ts` e pagina con TanStack Query.
- **Ogni rotta `/api/` è protetta per default.** Il controllo dell'autenticazione è globale,
  in `server/index.ts`, e blocca per l'`osservatore` ogni richiesta che non sia una lettura.
- **`npm run build` scrive in `dist/`, che è la cartella servita in produzione.** Su un server
  di produzione, qualunque riavvio mette in linea l'ultima build fatta, anche quella di un
  branch di sviluppo.
- **Avviare senza database** si fa con `DATABASE_URL= npm run dev`, cioè con la variabile
  presente ma vuota. `env -u DATABASE_URL` non basta, perché la variabile viene riletta da
  `.env`. In questa modalità il login non funziona.
- Tutti i testi dell'interfaccia sono in italiano. Le icone vengono solo da Lucide.
