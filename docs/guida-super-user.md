# Guida super user — Notifiche Impianti

Guida per **Admin** e **Super Admin**: le sezioni di configurazione, la gestione
degli accessi, l'integrazione con il consorzio e le regole operative da
rispettare.

Le sezioni operative quotidiane (Dashboard, Invia notifica, Storico,
Anagrafiche, Template) sono descritte in dettaglio nella
[Guida utente](guida-utente.md), che vale anche per gli amministratori: qui non
si ripetono, se ne richiamano solo le implicazioni amministrative.

---

## Indice

1. [Il modello dei permessi](#1-il-modello-dei-permessi)
2. [Gestione Utenti](#2-gestione-utenti)
3. [Gestione Codici](#3-gestione-codici)
4. [Le due sorgenti di credenziali](#4-le-due-sorgenti-di-credenziali)
5. [Impostazioni → Email](#5-impostazioni--email)
6. [Impostazioni → PEC](#6-impostazioni--pec)
7. [Impostazioni → SMS](#7-impostazioni--sms)
8. [Impostazioni → WebService (le anagrafiche del consorzio)](#8-impostazioni--webservice-le-anagrafiche-del-consorzio)
9. [Impostazioni → Active Directory](#9-impostazioni--active-directory)
10. [Impostazioni → Utenti di test](#10-impostazioni--utenti-di-test)
11. [Cosa deve sapere un amministratore sull'invio](#11-cosa-deve-sapere-un-amministratore-sullinvio)
12. [Manutenzione ordinaria](#12-manutenzione-ordinaria)
13. [Limiti noti e cose da decidere](#13-limiti-noti-e-cose-da-decidere)
14. [Diagnosi rapida](#14-diagnosi-rapida)

---

## 1. Il modello dei permessi

### I quattro ruoli

| Ruolo | Accesso | Note |
|---|---|---|
| **Super Admin** | Tutto, comprese le schede **Active Directory** e **Utenti di test** | Unico che può creare altri Super Admin (al massimo due) |
| **Admin** | Tutto tranne le schede Active Directory e Utenti di test | Non può assegnare il ruolo Super Admin, né modificare o eliminare un Super Admin |
| **Utente** | Tutte le pagine tranne **Gestione Utenti**, **Gestione Codici** e **Impostazioni**, in scrittura | |
| **Osservatore** | Solo **Dashboard**, **Storico Notifiche** e **Anagrafiche**, in sola lettura | Esce col pulsante *Esci* come tutti: il logout è l'unica scrittura che gli è concessa |

### Come funziona davvero il blocco

Due regole valgono a livello centrale, non pagina per pagina — è utile saperlo
per non cercare permessi che non esistono:

- **Ogni chiamata all'API è protetta per impostazione predefinita.** Una
  funzione nuova nasce già chiusa a chi non ha fatto l'accesso.
- **L'Osservatore è bloccato in scrittura da un unico controllo centrale**: ogni
  operazione che non sia una lettura viene rifiutata con un 403, qualunque
  pagina la generi. Nascondere i pulsanti è comodità; il blocco vero è dietro.

Allo stesso modo, nascondere agli Admin le schede Active Directory e Utenti di
test è comodità: le rotte che le servono accettano solo il Super Admin.

### Che cosa vede un Utente

Non esiste un elenco di pagine da concedere: chi ha un'utenza vede
l'applicazione. **Le pagine riservate sono tre, Gestione Utenti, Gestione
Codici e Impostazioni**, e le vedono solo Admin e Super Admin. L'Osservatore
vede in più solo Dashboard, Storico Notifiche e Anagrafiche: Invia Notifica e
Template gli sono nascoste, perché non potrebbe usarle.

Fino alla versione precedente c'erano i *gruppi*, insiemi di pagine da assegnare
a Utenti e Osservatori. Sono stati tolti: nessun gruppo era mai stato creato, e
quello che un Utente vede oggi è esattamente ciò che vedeva prima. A limitare
restano il **ruolo** e i due blocchi centrali descritti qui sopra.

> **Impostazioni è solo degli amministratori.** Un Utente la vedeva, ma le
> schede email, PEC, SMS e web service richiedono il ruolo Admin per **leggere**
> la configurazione salvata, provarla e salvarla: le apriva vuote e il
> salvataggio falliva. Con lei l'Utente ha perso il pulsante *Aggiorna ora*:
> l'anagrafica si ricarica comunque ogni notte, e in giornata la ricarica un
> amministratore.

> Per dare la **sola consultazione** dello Storico si usa il ruolo
> **Osservatore**, che guarda, filtra ed esporta ma non può spedire.

Per sospendere qualcuno senza cancellarne l'utenza si usa **Account attivo**
nella scheda Utenti.

---

## 2. Gestione Utenti

Menù *Strumenti → Gestione Utenti*. Due schede.

### Scheda Utenti

Tabella con *Username*, *Ruolo*, *Sorgente*, *Stato*, *Ultima login*.

**Nuovo utente / Modifica** apre una finestra con:

| Campo | Note |
|---|---|
| **Username** | Con sorgente Active Directory **deve coincidere esattamente** con quello di dominio, e per questo su un utente AD già creato **non si modifica più**: cambiarlo lo lascerebbe fuori dall'applicazione. Si modifica solo sugli utenti locali |
| **Sorgente credenziali** | *Locale (password nell'app)* oppure *Active Directory* — vedi il capitolo seguente |
| **Password** | Compare **solo** per la sorgente Locale. In modifica: vuota = non cambia. Sotto il campo, l'elenco dei requisiti si spunta in verde man mano che vengono rispettati |
| **Ruolo** | Un Admin non vede l'opzione *Super Admin* |
| **Account attivo** | Solo in modifica. Disattivare blocca l'accesso senza perdere lo storico |

Lo username deve avere almeno 3 caratteri. La password locale deve avere:

- **almeno 12 caratteri**;
- **una lettera maiuscola** e **una minuscola**;
- **un numero**;
- **un carattere speciale** (qualunque carattere che non sia lettera o numero,
  anche lo spazio).

Finché manca un requisito il pulsante di salvataggio resta spento. La regola
vale quando una password si **imposta o si cambia**: quelle già salvate prima
non vengono ricontrollate. Non ci sono scadenza, blocco dopo tentativi falliti
né cambio obbligatorio al primo accesso. Gli utenti Active Directory non hanno
una password nell'applicazione, quindi la regola non li riguarda.

Lo stato si cambia anche
direttamente dall'interruttore nella colonna *Stato*. L'icona cestino elimina
l'utenza, con conferma.

Regole che l'applicazione fa rispettare da sé:

- **Al massimo due Super Admin.**
- **Un Admin non può modificare, disattivare né eliminare un Super Admin**: su
  quelle righe i pulsanti non compaiono.
- **Nessuno può eliminare la propria utenza né cambiarsi il ruolo**, e
  l'interruttore di stato non compare sulla propria riga.
- **L'ultimo Super Admin locale attivo non si tocca**: non si può convertire ad
  Active Directory, cambiargli ruolo, disattivarlo né eliminarlo (messaggio
  *«Deve restare almeno un superadmin locale…»*). Vedi il capitolo 4.

> **Disattivare è quasi sempre meglio che eliminare**: le comunicazioni inviate
> restano firmate con lo username nello Storico, e un'utenza cancellata e
> ricreata non è la stessa riga.

### Scheda Richieste di accesso

Qui compare **chi ha superato l'autenticazione su Active Directory ma non è fra
gli utenti abilitati**: la persona esiste sul dominio, la password era giusta,
ma in questa applicazione non ha un'utenza.

Per ogni richiesta: lo **username esatto scritto da AD**, il numero di tentativi
e la data dell'ultimo.

- **Abilita** apre la creazione utente **già compilata** con quello username e
  con sorgente *Active Directory*. Lo username **non si può modificare**: è
  quello arrivato da AD (`nome.cognome`), ed è il modo giusto di creare
  un'utenza di dominio — elimina il rischio di scrivere `mrossi` dove AD ha
  `m.rossi`.
- L'icona cestino scarta la richiesta, dopo conferma col pulsante **Scarta**.
  **Non è recuperabile**: quello username ricompare solo se la persona ritenta
  l'accesso.

Una richiesta evasa sparisce dall'elenco, in entrambi i casi: creando l'utenza
o scartandola. Sparisce anche se l'utenza con quello username è stata creata
da un'altra strada.

> Questa scheda è il surrogato della ricerca su Active Directory, che
> l'applicazione non può offrire perché il consorzio non concede un account di
> servizio. Senza di essa, un operatore legittimo resterebbe davanti a «non sei
> abilitato» senza che nessuno sappia perché.

---

## 3. Gestione Codici

Menù **Strumenti → Gestione Codici**, solo Admin e Super Admin. Serve a
togliere dalla circolazione un impianto o una roggia madre senza aspettare che
lo faccia il consorzio.

Due schede:

| Scheda | Cosa elenca |
|---|---|
| **Impianti** | Tutte le madri del registro degli impianti: rogge a scorrimento, impianti, pozzi, le madri `S` e quelle *non classificate* create dal sync |
| **Rogge Madri** | Le rogge madri `R` della seconda gerarchia |

Ogni riga ha codice, descrizione e l'interruttore **Attivo**. Sopra la tabella
c'è il campo *Cerca per codice o descrizione*, e l'etichetta di ogni scheda dice
quanti codici sono spenti (*«(N spenti)»*).

**Un codice spento:**

- sparisce da **Invia notifica**: la madre non si può selezionare e non
  riceve comunicazioni;
- sparisce da **Anagrafiche**: le sue righe e i legami sulle sue tratte non si
  vedono più;
- **resta nello Storico** e nella Dashboard: le comunicazioni già partite si
  vedono tutte, anche quelle verso codici che oggi sono spenti.

Riaccenderlo rimette tutto com'era, subito. Al primo rilascio **sono tutti
accesi**, e un codice nuovo che arriva col sync nasce acceso.

> **Una tratta sta spesso in due gerarchie**: `R01D01S02` è sotto l'impianto
> `IM01A` e sotto la roggia madre `R01`. Spegnere `IM01A` la toglie dalle
> schede Scorrimento/Impianti/Pozzi, ma resta in «Rogge Madri» finché `R01` è
> accesa — e con lei i suoi legami in Anagrafiche. Per toglierla del tutto si
> spengono entrambe le madri.

Se qualcuno sta componendo una comunicazione mentre un codice viene spento,
l'invio viene **rifiutato per intero** col nome del codice: basta aggiornare la
pagina e rifare la selezione.

---

## 4. Le due sorgenti di credenziali

Ogni utenza dichiara **in anticipo** chi valida la sua password: l'applicazione
(hash locale) oppure Active Directory, attraverso il web service del consorzio.
**Non è un ripiego a cascata**, ed è la regola di sicurezza più importante
dell'applicazione.

Il motivo è concreto: se si provasse prima la password locale e poi, fallendo,
Active Directory, un'utenza locale con lo stesso username di una persona di
dominio **vincerebbe per sempre** — anche dopo che il consorzio ha disabilitato
quell'account. Il licenziamento non chiuderebbe l'accesso.

Conseguenze pratiche:

- **Locale** ⇒ deve avere una password nell'applicazione.
- **Active Directory** ⇒ **non** ha una password nell'applicazione. Il campo
  sparisce dalla finestra, ed è corretto.
- Cambiare sorgente a un'utenza esistente è permesso, ma il sistema pretende che
  il risultato sia coerente: passando ad AD la password locale viene rimossa,
  passando a Locale bisogna fornirne una.

### La regola operativa da non violare

> **Deve sempre esistere almeno un Super Admin con sorgente Locale.**

È l'unico che riesce a entrare quando il servizio di verifica del consorzio non
risponde. **L'applicazione lo impone**: rifiuta di convertire ad AD, cambiare ruolo,
disattivare o eliminare l'ultimo Super Admin locale attivo, con il messaggio
*«Deve restare almeno un superadmin locale…»*. Resta una regola operativa
tenerne la **password** conosciuta e aggiornata: un'utenza locale di cui nessuno
ricorda la password non fa entrare nessuno.

### Altre tre cose vere

- **La password di dominio non la verifica l'applicazione, ma il web service
  del consorzio** (servizio `getuserAD`), che risponde solo «valida» o «non
  valida». Per questo password scaduta, account bloccato e account disabilitato
  sul dominio **non si distinguono**: all'utente compaiono tutti come
  *«Credenziali non valide»*.
- Una **password vuota non viene mai mandata** al servizio del consorzio:
  l'applicazione la rifiuta prima.
- **La sessione dura 8 ore e non richiede AD durante la sua vita.** Chi viene
  disabilitato sul dominio a metà giornata resta operativo fino alla scadenza
  della sessione. Per chiuderlo subito si disattiva l'utenza qui in *Gestione
  Utenti*.

---

## 5. Impostazioni → Email

Scheda **Email**: la casella di posta **ordinaria** da cui partono le
comunicazioni ai conduttori senza indirizzo PEC.

| Campo | Note |
|---|---|
| **Servizio Email** | *Gmail* oppure *SMTP Personalizzato* |
| **Il server richiede l'autenticazione** | Solo con SMTP personalizzato, acceso di default. Si spegne per un server di posta interno che accetta i messaggi senza username e password: in quel caso spariscono i due campi seguenti |
| **Email** (Gmail) / **Username** (SMTP) | Con Gmail è l'indirizzo della casella. Con SMTP è lo username di accesso al server, che non sempre è un indirizzo |
| **App Password** / **Password** | Con Gmail serve una **App Password**, non la password dell'account |
| **Mittente** | Solo con SMTP personalizzato: l'indirizzo che compare come «Da» nei messaggi, se diverso dallo username. Vuoto = si usa lo username |
| **Server SMTP**, **Porta SMTP**, **Connessione Sicura (TLS)** | Solo con SMTP personalizzato |

Due pulsanti: **Test Connessione** (prova le credenziali scritte a schermo,
senza salvare; con il campo password vuoto usa quella già memorizzata) e
**Salva Configurazione**.

### Invia email di test

Sotto il modulo, un campo per un indirizzo qualunque e il pulsante **Invia
email di test**: spedisce **una mail vera** con le credenziali **salvate** —
non con quelle scritte a schermo — all'indirizzo indicato. È la prova che il
*Test Connessione* non può dare: un server può accettare il login e poi
rifiutare il mittente. Il pulsante resta spento finché la configurazione non è
salvata, e se nel modulo ci sono modifiche non salvate la scheda lo ricorda.
Se non arriva, controllare anche lo spam.

Due regole del salvataggio, valide anche per PEC e SMS:

- **I segreti non tornano mai indietro al browser.** L'interfaccia sa solo se
  una password *è impostata*, non qual è.
- **Salvare con il campo password vuoto conserva quella già memorizzata.** Non
  la cancella: è l'unico modo sensato, visto che non si può rimostrare.

Le credenziali salvate qui **vincono sulle variabili d'ambiente** del server, che
restano solo come valore di partenza.

---

## 6. Impostazioni → PEC

Scheda **PEC**: la **seconda casella**, per i conduttori con indirizzo
certificato. Gli stessi campi della scheda Email, con credenziali proprie e un
test SMTP proprio, compreso il pulsante **Invia email di test** che spedisce
dalla casella PEC salvata. Il valore predefinito è **SMTP sulla porta 465 con
TLS**: i gestori PEC italiani espongono un server proprio, non un servizio noto.

### Perché è una scheda a parte, e non un dettaglio

L'anagrafica distingue i destinatari, e fra i conduttori attivi sono circa
**1775 posta ordinaria contro 1479 PEC**. Da una casella ordinaria una PEC non
ha valore legale — niente ricevuta di accettazione né di consegna — e molte
caselle PEC rifiutano del tutto la posta non certificata.

Da qui la regola che ogni amministratore deve conoscere:

> **Se la selezione contiene destinatari PEC e la PEC non è configurata, l'invio
> viene rifiutato per intero, prima di scrivere qualsiasi cosa.** L'operatore
> vede un messaggio del tipo *«Configurazione PEC assente: 47 destinatari su 120
> vanno raggiunti via PEC — imposta le credenziali PEC in Impostazioni»*.

Non si ripiega sulla casella ordinaria: sarebbe una comunicazione che il
consorzio crede fatta e che invece non vale. **Vale il simmetrico** per la posta
ordinaria non configurata.

Il canale effettivamente usato viene **fotografato sul singolo destinatario** e
mostrato nel dettaglio dello Storico (colonna *Canale*): l'anagrafica viene
riscritta a ogni caricamento, e «questa comunicazione è andata per PEC?» è la
domanda che conta.

**L'operatore lo vede prima di premere.** La tabella dei conduttori di *Invia
notifica* ha una colonna **Canali** (badge viola *PEC*, testo *Email*, più il
badge *SMS* di chi ha un numero; ordinabile) e sopra la tabella il conteggio
**«N via PEC»**: è lo stesso numero che comparirebbe nel rifiuto. Chi segnala *«mi ha bloccato l'invio senza
preavviso»* aveva il preavviso a schermo.

> Resta un punto cieco: **la scheda *Anagrafiche → Destinatari* non ha quella
> colonna**: il tipo di indirizzo è nell'anagrafica, ma quella scheda non lo
> mostra. Per sapere
> se un singolo conduttore è PEC lo si cerca in *Invia notifica*, dopo aver
> selezionato una sua tratta.

---

## 7. Impostazioni → SMS

Scheda **SMS**: credenziali del fornitore **Register.it (sfera.net)** — *Client
ID* e *Password* — con **Prova credenziali** e **Salva Configurazione**. La
prova interroga il credito residuo e non spende un SMS. Se fallisce con
credenziali giuste, l'IP del server non è ancora abilitato nella whitelist del
pannello Register.it: la scheda lo ricorda.

Sotto il modulo, **Invia SMS di test** spedisce **un SMS vero** con le
credenziali salvate al numero indicato. A differenza della prova credenziali,
**consuma un messaggio del credito**.

> **Il canale SMS è attivo.** In *Invia notifica* la spunta «Invia anche via
> SMS» è **accesa di default** quando queste credenziali ci sono: il testo SMS
> è obbligatorio e parte davvero, verso chi ha un numero di cellulare in
> anagrafica — circa metà dei conduttori attivi — e l'operatore che non lo
> vuole toglie la spunta. **Senza queste credenziali la spunta è spenta e non
> si può accendere**, con l'avviso «SMS non configurati»: le comunicazioni
> partono per sola mail.

---

## 8. Impostazioni → WebService (le anagrafiche del consorzio)

Scheda **WebService**: da qui si configura da dove arrivano i dati del
consorzio. È la sezione da cui dipende tutto il resto.

### Il principio

Le tabelle dell'anagrafica — conduttori, madri, tratte e legami — sono una
**copia** del web service del consorzio, e vengono **sostituite per intero** a
ogni caricamento. I conduttori si sostituiscono per conto loro; madri, tratte e
legami **tutti insieme**: se anche una sola delle sette entità che li riempiono
non si riesce a leggere, restano quelli del caricamento precedente e il
caricamento risulta *parziale*, con il motivo scritto. **La madre di ogni tratta
è un dato del consorzio**: non si ricava dal codice.

Da settembre 2026 (issue #49) ci sono anche le **rogge madri**, una seconda
gerarchia che convive con quella di sopra senza sostituirla: codici R da 3
con un nome proprio (per esempio «R08 — Roggia Serio e derivate»), e le loro
figlie. L'elenco del 22/09/2026 porta 69 righe e 64 codici distinti: 5 codici
arrivano due volte con nomi diversi, e l'applicazione tiene il primo e lo conta
(*«Rogge madri ripetute nell'elenco»*).
Le riempiono altre due entità, e **si sostituiscono per conto loro**:
se una delle due manca, la gerarchia rogge madri resta quella del caricamento
precedente, ma questo **non** blocca l'aggiornamento delle sette di sopra —
sono due gruppi indipendenti apposta, per non far dipendere l'anagrafica
principale da un web service che il consorzio potrebbe attivare più tardi.

> **Nessuna modifica fatta a mano su quei dati sopravvive al caricamento
> successivo.** Se un indirizzo è sbagliato, va corretto nel gestionale del
> consorzio.

Il caricamento automatico gira **ogni notte alle 03:00**. Il pulsante *Aggiorna
ora* fa esattamente la stessa cosa, subito.

### I campi

- **Stringa di autenticazione**: la credenziale del web service, inviata a ogni
  chiamata. Come le password, resta memorizzata: lasciarla vuota non la
  cancella.
- **URL base del web service**: l'indirizzo comune a tutte le entità (per
  esempio `http://192.168.0.100`). Un'entità in modalità HTTP senza un URL
  proprio usa la base più il suo percorso, che il campo mostra in grigio.
- Per **ciascuna delle dieci entità** (Destinatari; Impianti (aggreganti IM);
  Impianti a orari (S); Tratte e loro impianto; Tratte a orari (S); Legami live —
  tratte R; Legami live — tratte S; Legami stagione irrigua — tratte R; Rogge
  madri (codici R da 3); Tratte delle rogge madri (R)):
  - **Modalità**: `HTTP` oppure `File JSON`;
  - in modalità HTTP, l'**URL**: va compilato solo se quell'entità sta a un
    indirizzo diverso dalla base, e quando c'è **vale lui**;
  - in modalità File JSON, il **percorso** del file, con il pulsante **Carica
    file** per caricarne uno dal proprio PC;
  - il pulsante **Prova**, che verifica quella singola sorgente e scrive l'esito
    sotto. **Prova usa la configurazione salvata**, non quella a schermo: dopo
    una modifica si salva prima di provare.

Il caricamento di un file JSON viene **validato riga per riga** prima di essere
accettato: un file rifiutato **non tocca** quello già presente. A caricamento
riuscito modalità e percorso si impostano da soli.

In fondo alla scheda: *«Ultimo caricamento riuscito: <data>»* e, subito sotto,
**i numeri di quel caricamento**: quanti destinatari, madri, tratte e legami
sono stati scritti, quante righe sono state **scartate** e quante madri e tratte
*non classificate* ha creato l'applicazione. Se quel caricamento è parziale,
sotto compaiono anche i motivi. Poi i pulsanti **Aggiorna ora** e **Salva
configurazione**.

### Ordine di lavoro consigliato

1. Impostare modalità e URL/file di ogni entità.
2. **Salva configurazione**.
3. **Prova** su ciascuna, una alla volta.
4. **Aggiorna ora**, e poi controllare la sezione *Anagrafiche*: il riquadro
   ambra in cima dice se qualcosa è andato storto o se qualche entità non è mai
   stata caricata.

### Cose vere dei dati del consorzio, che sembrano guasti

Numeri del caricamento di settembre 2026: si ritrovano nei conteggi sotto
*Aggiorna ora*.

- **Righe scartate a ogni caricamento.** L'elenco *Tratte e loro impianto*
  mescola tre raggruppamenti del consorzio (`IM`, `NM`, `ZM`): l'applicazione
  usa solo gli impianti `IM` e scarta le altre righe, 373. Allo stesso modo
  scarta i legami sui codici che iniziano per `N`, che il consorzio ha chiesto
  di ignorare. Non è un guasto.
- **Madri non classificate.** Alcuni legami puntano a codici che nessun impianto
  contiene. L'applicazione li raccoglie sotto madri *non classificate* che
  portano le prime tre lettere del codice: nell'elenco del 25/09/2026 ne resta
  una sola, `R28`, con una tratta. Su richiesta del consorzio **non compaiono
  in Invia notifica → Scorrimento**; la loro tratta si raggiunge da *Rogge
  Madri*. Spariscono da sole quando il consorzio assegna quei codici a un
  impianto.
- **Conduttori nei legami che non stanno fra i destinatari.** I legami citano
  codici di conduttore che l'elenco dei destinatari non contiene (2.772 legami
  stagione nell'elenco del 25/09/2026): non ricevono niente, perché
  l'applicazione non ha né un indirizzo né un numero, e su richiesta del
  consorzio non compaiono nemmeno nelle schede *Legame* di Anagrafiche.
- **Una tratta non si attribuisce dal codice.** Tratte che iniziano allo stesso
  modo stanno sotto impianti diversi — quelle che iniziano per `R08` sotto 13
  impianti. La madre giusta è nella colonna *Codice impianto* di *Anagrafiche →
  Impianti*.
- **Tratte S scartate (non gruppi di consegna).** Delle figlie di `S45` servono
  solo i gruppi di consegna: sfiati, scarichi, nodi e saracinesche (91 righe) si
  scartano, perché non hanno mai conduttori.
- **Impianti con tipo irrigazione sconosciuto.** Un impianto con un tipo che la
  decodifica del consorzio non prevede non sparisce: finisce fra le rogge
  (*Scorrimento*) e si conta.
- **Rogge madri ripetute nell'elenco.** Lo stesso codice con due nomi diversi:
  si tiene il primo e si conta, così che qualcuno lo sappia.
- **Le rogge madri non coprono tutti i codici R.** Una tratta R il cui codice
  da 3 non è fra le rogge madri dell'elenco del consorzio resta fuori dal
  bottone *Rogge Madri* di Invia notifica, e continua a comparire sotto il suo
  impianto nelle altre sezioni. In *Anagrafiche → Rogge madri* compare lo
  stesso, con le sue prime 3 cifre come madre e «-» come descrizione. Non è un
  dato perso, è una lista che il consorzio stesso tiene più corta.

Se un operatore segnala «Invia notifica è quasi tutta vuota», la prima cosa da
guardare è quali entità risultano caricate.

---

## 9. Impostazioni → Active Directory

Scheda visibile **solo al Super Admin**, come *Utenti di test*: sono le uniche
due con questo livello. Per Active Directory la ragione è precisa: **chi sceglie
l'indirizzo del servizio di verifica decide dove vanno le password di dominio
del personale.**

### Come funziona

L'applicazione **non parla con il domain controller**. La password di
un'utenza Active Directory la verifica il **web service del consorzio**, con il
servizio `getuserAD`: l'applicazione gli passa username e password e lui
risponde soltanto *valida* o *non valida*. Qualunque altra risposta — nessuna
risposta entro il tempo massimo, un errore, una pagina inattesa — vale come
*«Active Directory non è raggiungibile»*: un servizio guasto non deve mai
sembrare né una password sbagliata né una giusta.

A differenza di email, PEC e SMS, **qui non c'è nessun ripiego su variabili
d'ambiente**: si configura solo da questa scheda.

### I campi

| Campo | Note |
|---|---|
| **Autenticazione Active Directory attiva** | L'interruttore generale |
| **URL dell'endpoint di verifica** | **Di solito si lascia vuoto**: vale allora l'*URL base* della scheda WebService più `/RestTabelle/RestTabelle.svc/getuserAD`, e se la base cambia l'indirizzo la segue. Si compila solo se il servizio sta altrove. Deve iniziare con `http://` o `https://` |
| **Timeout (millisecondi)** | Quanto aspettare la risposta prima di considerare il servizio irraggiungibile |

Il servizio riceve **la password dentro l'indirizzo** chiamato, e usa la stessa
*Stringa di autenticazione* del WebService. Ne seguono due cose da sapere:

- la password di dominio finisce nei **log di accesso del web service del
  consorzio**: è il funzionamento che il consorzio ha scelto. Da parte
  dell'applicazione non esce: nei suoi log e nelle prove compare mascherata;
- se l'indirizzo è in `http://`, compare un avviso ambra: **username e
  password del personale viaggiano in chiaro** sulla rete fino al web service.

### Prova endpoint

Sotto ai campi, il pulsante **Prova endpoint**:

- chiama il servizio con **credenziali inventate** e passa solo se riceve
  *non valida*. Se riceve *valida*, la prova **fallisce** con un avviso:
  vorrebbe dire che il servizio accetta chiunque, e l'autenticazione non va
  attivata finché il consorzio non lo corregge;
- facoltativamente si possono scrivere uno username e una password di dominio
  veri (**non vengono salvati**): se il primo controllo passa, la scheda dice
  anche se quelle credenziali sono state accettate o rifiutate;
- **la prova usa la configurazione già salvata**, anche con l'interruttore
  spento: dopo aver cambiato URL o timeout, salvare prima di premere.

### Cosa aspettarsi al collaudo

La macchina di sviluppo non vede il web service del consorzio: **il primo
contatto con Active Directory vero avviene al collaudo, in sede**. L'ordine
consigliato è: WebService configurato e funzionante → *Prova endpoint* con
credenziali inventate → *Prova endpoint* con le proprie credenziali di dominio
→ solo allora accendere l'interruttore, tenendo sempre un Super Admin locale
(capitolo 4).

---

## 10. Impostazioni → Utenti di test

Scheda visibile **solo al Super Admin**, con lo stesso livello della scheda
Active Directory: chi censisce un utente di test decide che a **ogni**
comunicazione del consorzio, qualunque roggia, parta una copia verso un
indirizzo o un numero che ha scelto lui. Non è un dettaglio da lasciare a un
Admin qualunque.

**A cosa serve.** Prima di un invio importante — o semplicemente per restare
sicuri che il canale email o SMS funzioni — si aggiunge una persona come
utente di test. Finché quell'utente è **attivo**, riceve una copia di ogni
comunicazione inviata dall'applicazione, indipendentemente da quali rogge o
conduttori sono stati selezionati.

**È un interruttore per persona, non generale.** Ogni riga della tabella ha il
proprio interruttore Attivo/Non attivo: si può tenere censita una persona e
spegnerla temporaneamente, senza cancellarla.

**Nuovo utente di test** (e la matita su una riga) apre una finestra con i
campi *Nome* (obbligatorio), *Email* con il suo *Canale* — *Email ordinaria* o
*PEC* — *Telefono* e l'interruttore *Riceve le comunicazioni*. Il cestino lo
elimina, con conferma. Un utente di test **PEC** si comporta come un
conduttore PEC: se la PEC non è configurata, l'invio viene rifiutato per intero.
In *Invia notifica* ogni operatore vede i nomi degli utenti di test che
riceveranno la copia.

**Un utente di test ha bisogno di almeno un recapito**, email o telefono: la
maschera non fa salvare una riga senza nessuno dei due, perché non
raggiungerebbe nessuno pur comparendo come censita. Chi ha inserito solo un
numero di telefono, però, riceve davvero qualcosa solo quando l'invio ha
anche la spunta SMS: con la sola email spedita, quella persona resta fuori.

**Come si fa un invio di sola prova.** Nella pagina *Invia notifica* si
compone la comunicazione come sempre, ma **si toglie la spunta a tutti i
conduttori**. Con almeno un utente di test attivo e raggiungibile il bottone
resta acceso: la comunicazione parte solo verso gli utenti di test, nessun
conduttore la riceve. È il modo per collaudare testo e canale (email, PEC,
SMS) senza disturbare nessuno.

**Una prova si comporta come un invio vero fino in fondo**, comprese le
conseguenze sulle rogge: se il tipo scelto è apertura o chiusura, le rogge
selezionate risultano aperte o chiuse in Dashboard esattamente come per un
invio reale, e la comunicazione compare nello Storico con un badge **Prova**.
È voluto — un collaudo che si comportasse diversamente da un invio vero non
proverebbe niente — ed è il motivo per cui esiste il pulsante seguente.

**«Elimina le comunicazioni di prova».** In fondo alla scheda, il pulsante
mostra quante comunicazioni risultano «di prova» — cioè andate ai soli utenti
di test, nessun conduttore vero — e le cancella tutte insieme dallo Storico.
**Cancellarle riapre anche le rogge che avevano chiuso**, perché lo stato di
una roggia si ricalcola sempre da quello che resta registrato. Una
comunicazione con anche un solo conduttore vero fra i destinatari non viene
mai toccata da questo pulsante, nemmeno se contiene anche utenti di test:
non è considerata «di prova». L'operazione non si può annullare.

---

## 11. Cosa deve sapere un amministratore sull'invio

Il flusso completo è nella [Guida utente](guida-utente.md#5-invia-notifica).
Qui i punti che generano segnalazioni.

**La risposta arriva prima della fine della spedizione.** La notifica viene
registrata, l'applicazione risponde subito e le email continuano a partire in
sottofondo. Con Gmail una email costa circa un secondo: aspettare l'ultima
farebbe scadere la connessione e l'operatore, vedendo un errore, riproverebbe —
due comunicazioni identiche a tutti. Per la stessa ragione la tabella dei
conduttori si svuota appena l'invio parte.

**Una comunicazione per conduttore, sempre.** Chi è legato a più tratte
selezionate riceve una sola email, con tutti i codici nella sua fotografia. Due
conduttori *diversi* che condividono un indirizzo ricevono invece un messaggio a
testa.

**L'email parte sempre — ordinaria o PEC — l'SMS solo se richiesto.** Il testo
SMS scritto dall'operatore viene registrato con la comunicazione e mostrato nel
dettaglio dello Storico, ma parte davvero solo se in *Invia notifica* era
spuntata «Invia anche via SMS» (accesa di default, se gli SMS sono
configurati) e solo verso chi ha un
numero in anagrafica. Chi segnala «ho scritto l'SMS e non è arrivato» — pur
avendo spuntato l'invio via SMS — va verificato sul numero: se manca in
anagrafica, è il comportamento previsto.

**I conduttori cessati non ricevono mai.** Il filtro è applicato in lettura, non
nel caricamento: il mirror resta una copia fedele e conserva i cessati, che
servono ancora a risolvere i legami nelle Anagrafiche.

**Lo stato aperta/chiusa si ricava dalle notifiche inviate.** Non esiste nessun
campo da modificare, in nessuna pagina. Per correggere uno stato sbagliato si
invia la notifica opposta sugli stessi codici. Regole:

- una **tratta eredita dalla madre**, non il contrario: chiudere il pozzo `IM27A`
  chiude le sue tratte, chiudere una tratta non chiude il pozzo;
- **ripetere non azzera**: una seconda chiusura su un codice già chiuso lascia la
  data della prima;
- la Dashboard conta le **tratte**: chiudere una madre vi porta tutte le sue
  tratte (con la dicitura *«Con la madre …»*), la madre non compare come riga a
  sé, e una tratta chiusa sia da sola sia con la madre conta una volta.

**Chi ha inviato viene preso dalla sessione**, non da quello che il client
dichiara: nello Storico la firma non è modificabile.

---

## 12. Manutenzione ordinaria

### Controlli periodici

| Ogni | Cosa | Dove |
|---|---|---|
| Giorno | *«Ultimo aggiornamento anagrafiche»* è verde | Intestazione di qualunque pagina |
| Giorno | Nessun riquadro ambra di errore | Anagrafiche |
| Settimana | Le **Richieste di accesso** in attesa | Gestione Utenti → Richieste |
| Mese | Utenze di persone che non sono più in servizio | Gestione Utenti, colonna *Ultima login* |

**Questi controlli sono a mano perché non arriva nessun avviso.** L'applicazione
non manda email di esito del caricamento notturno (vedi *Limiti noti*): se
nessuno guarda l'intestazione, un caricamento fermo da giorni non lo segnala
nessuno, e le comunicazioni continuano a partire verso indirizzi vecchi.

### Backup del database

Il backup è **automatico**, ogni giorno alle **22:30** (ora del server), e tiene
le **ultime 30 copie**. Ogni dump viene verificato *prima* di ruotare i
precedenti: se fallisce, lo script esce in errore e **non cancella nulla** — una
rotazione non elimina mai copie buone in cambio di una rotta.

> **I backup stanno solo sul disco di questo server: non sopravvivono a un
> guasto hardware.** Portarne una copia altrove è una decisione ancora aperta.

Dettagli operativi, comandi e ripristino: `README.md` nel repository, sezione
*Backup del database*.

### Installare e aggiornare l'applicazione

Si fa tutto dal server, con lo script `deploy.sh` nella cartella
dell'applicazione. Va lanciato da un terminale (una sessione SSH), con l'utente di
sistema che fa girare l'applicazione, **non da root**:

```
cd notifiche-canali-irrigui
./deploy.sh
```

Compare un menu:

| Voce | Quando si usa | Cosa fa |
|---|---|---|
| **1) Prima installazione** | Una volta sola, subito dopo il `git clone` | Installa ciò che manca sul server (Node.js, PostgreSQL, pm2…), chiede la **porta** su cui pubblicare l'applicazione, crea database e configurazione, chiede username e password del primo **Super Admin**, avvia l'applicazione e la fa ripartire da sola a ogni riavvio del server, programma il backup notturno |
| **2) Aggiorna** | Quando il fornitore comunica che c'è una nuova versione | Fa un backup del database, scarica la nuova versione, la compila, aggiorna il database e riavvia l'applicazione |
| **3) Stato** | Per un controllo, o prima di chiamare l'assistenza | Dice se l'applicazione è accesa e risponde, se il database è raggiungibile, quando è stato fatto l'ultimo backup |
| **4) Crea superadmin** | Solo se non esiste più nessun Super Admin | Chiede username e password e lo crea |

Alcune cose da sapere:

- **Durante l'aggiornamento l'applicazione resta accesa**: si ferma per pochi
  secondi solo al riavvio finale. Conviene comunque non aggiornare mentre
  qualcuno sta inviando una comunicazione. Un invio interrotto da un riavvio
  resta *«in invio»* (vedi *Limiti noti*).
- **Se l'aggiornamento si ferma con un errore**, l'applicazione che stava
  girando non viene toccata. Lo script stampa i comandi per tornare alla versione
  precedente e il nome del backup appena fatto: vanno copiati e mandati
  all'assistenza così come sono.
- **Se durante l'aggiornamento compare una domanda su tabelle da cancellare o da
  rinominare**, rispondere **No, abort** e contattare l'assistenza. Non capita in
  un aggiornamento normale.
- **Non vanno modificati a mano i file dell'applicazione sul server.** Se ce ne
  sono, l'aggiornamento si rifiuta di partire e li elenca. La configurazione
  tecnica sta nel file `.env`, che l'aggiornamento non tocca; tutto il resto si
  configura da *Impostazioni*.
- La porta scelta all'installazione è scritta in `.env` alla voce `PORT`.

### Dopo un intervento tecnico

Un aggiornamento dell'applicazione **non risincronizza le anagrafiche**: se
l'intervento riguardava il caricamento dei dati, va lanciato *Aggiorna ora*.

---

## 13. Limiti noti e cose da decidere

Non sono dimenticanze: sono scelte prese o questioni aperte. Vale la pena
conoscerle prima che diventino segnalazioni.

- **L'SMS non ha conferma di consegna.** Il fornitore (Register.it, sfera.net)
  dice solo quanti messaggi ha accettato: la colonna *SMS* del dettaglio
  Storico distingue *Inviato* da *Fallito*, ma non saprà mai dire *Consegnato*.
  Chi non ha un numero in anagrafica — circa metà dei conduttori attivi —
  risulta *Fallito* come chi non ha indirizzo email.
- **Nessuno viene avvisato per email dell'esito del caricamento notturno.** Il
  riepilogo esiste già lato server ed è pronto a partire dopo ogni corsa delle
  03:00, ma **manca la schermata per indicare i destinatari**: senza indirizzi
  configurati non viene spedito nulla. Finché è così, che il caricamento sia
  andato a buon fine lo si controlla a mano — vedi *Manutenzione ordinaria*.
- **Il limite di Gmail è 500 email al giorno**, sotto la dimensione di un invio
  ampio. Con la casella attuale un invio a tutti i conduttori non passa in un
  giorno solo.
- **Il pixel di tracciamento delle aperture** non funziona finché non è
  configurato l'indirizzo pubblico dell'applicazione (`APP_URL` nel file `.env`,
  chiesto da `deploy.sh` alla prima installazione): le email partono senza, con
  un avviso nei log.
- **Una notifica interrotta da un riavvio del server resta in stato «in invio»**
  e nessuno la chiude. Se nello Storico compare una comunicazione ferma in quello
  stato, è quasi certamente successo questo.
- **La sessione dura 8 ore e non ricontrolla Active Directory**: chi viene
  disabilitato sul dominio resta operativo fino alla scadenza. Per chiuderlo
  subito si disattiva l'utenza.
- **L'esito di ogni messaggio dice «inviato», non «consegnato»**: il dettaglio
  della notifica (Storico o Dashboard) mostra se il server di posta o la
  piattaforma SMS hanno accettato ciascun messaggio. Consegna e apertura non si
  tracciano.
- **I testi dei template partono come sono scritti**: niente variabili `{{…}}`,
  niente HTML.

---

## 14. Diagnosi rapida

**Un operatore dice che «Invia notifica» è quasi tutta vuota.**
Guardare *Anagrafiche*: quali entità risultano caricate e cosa dice il riquadro
ambra. Poi *Impostazioni → WebService*: **Prova** su ogni entità, quindi
*Aggiorna ora*. Ricordare però che gli export incompleti del consorzio sono una
condizione nota, non necessariamente un guasto.

**Un invio viene rifiutato con «Configurazione PEC assente».**
Configurare la scheda **PEC** in Impostazioni. Non esiste un modo di forzare la
posta ordinaria: è il comportamento voluto.

**Una persona non riesce ad accedere.**
Chiedere il **colore** del messaggio. Rosso = password. Ambra = leggere il testo,
che dice già cosa fare. Se dice *«Utente non abilitato»*, la richiesta è già in
*Gestione Utenti → Richieste di accesso*: si abilita da lì, così lo username è
quello esatto di dominio.

**Tutti gli utenti di dominio vedono «Active Directory non è raggiungibile», e l'accesso locale funziona.**
Il servizio di verifica del consorzio non risponde. Entrare con il Super Admin
**locale** e controllare *Impostazioni → Active Directory → Prova endpoint*;
se fallisce anche la *Prova* delle entità in *Impostazioni → WebService*, il
problema è il web service del consorzio nel suo complesso.

**Le email non arrivano, ma «Test Connessione» riesce.**
Usare **Invia email di test** (scheda Email o PEC) verso un indirizzo di cui si
controlla la casella, spam compreso: prova l'invio vero con le credenziali
salvate, mittente compreso.

**Lo stato di una tratta è sbagliato.**
Non c'è nulla da modificare: si invia la notifica opposta sugli stessi codici.
Se lo stato sbagliato deriva da una notifica errata, il collegamento «Chiusa dal
<data>» in Dashboard porta alla comunicazione che l'ha causato.

**Una notifica è ferma «in invio».**
Molto probabilmente un riavvio l'ha interrotta. Verificare nel dettaglio dello
Storico quanti destinatari risultano raggiunti prima di decidere se ripetere
l'invio ai soli mancanti — **non si rispedisce a tutti alla cieca**.
