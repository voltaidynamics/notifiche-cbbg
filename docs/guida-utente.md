# Guida utente — Notifiche Canali Irrigui

Guida per chi usa l'applicazione tutti i giorni: **Utente** e **Osservatore**.
Le funzioni riservate agli amministratori (Gestione Utenti, Gestione Codici,
configurazione in Impostazioni) sono
descritte nella [Guida super user](guida-super-user.md).

---

## Indice

1. [Che cosa fa l'applicazione](#1-che-cosa-fa-lapplicazione)
2. [Accedere](#2-accedere)
3. [Muoversi nell'applicazione](#3-muoversi-nellapplicazione)
4. [Dashboard](#4-dashboard)
5. [Invia notifica](#5-invia-notifica)
6. [Storico notifiche](#6-storico-notifiche)
7. [Anagrafiche](#7-anagrafiche)
8. [Template](#8-template)
9. [Il vocabolario dell'applicazione](#9-il-vocabolario-dellapplicazione)
10. [Problemi frequenti](#10-problemi-frequenti)

---

## 1. Che cosa fa l'applicazione

L'applicazione serve a **comunicare ai conduttori** che cosa succede sulle
rogge, sugli impianti e sui pozzi da cui derivano: una chiusura, una
riapertura, una manutenzione, un allarme di inquinamento.

### Con quale mezzo arriva la comunicazione

**La comunicazione parte sempre per email.** I canali di posta sono però
**due**, e non li sceglie chi invia: il sistema guarda l'anagrafica di ogni
conduttore e manda la comunicazione dalla **casella ordinaria** oppure dalla
**PEC**. Fra i conduttori attivi la PEC è quasi la metà.

**Si può aggiungere anche l'SMS, ma solo spuntandolo.** In *Invia notifica*,
sotto al testo email, c'è un secondo riquadro, *Testo SMS*, e sotto ancora la
spunta **«Invia anche via SMS»**: **spenta di default**, perché ogni SMS ha un
costo. Se la si spunta, il testo SMS diventa **obbligatorio** e parte davvero,
attraverso il fornitore configurato in Impostazioni — ma solo verso chi ha un
numero di cellulare in anagrafica, **circa la metà** dei conduttori attivi: chi
non ce l'ha non riceve l'SMS, e lo si vede nel dettaglio dello Storico.

Il flusso è sempre lo stesso:

```
scelgo cosa è successo  →  scelgo su quali tratte  →  scelgo con quale legame
      (tipo e classificazione)      (rogge/impianti/pozzi)      (live o stagione)
                                          ↓
                             vedo l'elenco dei conduttori
                                          ↓
              scrivo titolo, testo email e testo SMS  →  riepilogo  →  invio
                                          ↓
                              lo Storico registra tutto
```

Due cose da sapere subito, perché spiegano molte cose dell'interfaccia:

- **L'anagrafica del consorzio è di sola lettura.** Conduttori, rogge, indirizzi
  e legami arrivano dal web service del consorzio e vengono ricaricati ogni
  notte alle 03:00. Nessuna pagina dell'applicazione li può modificare: se un
  indirizzo è sbagliato, si corregge nel gestionale del consorzio e arriva qui
  al caricamento successivo.
- **Lo stato "aperta/chiusa" di una tratta non è un dato: è una conseguenza.**
  Non esiste nessun campo da spuntare. Una tratta risulta chiusa perché
  qualcuno ha inviato una notifica di **Chiusura** che la riguardava, e torna
  aperta quando parte una notifica di **Apertura**. Le notifiche di tipo
  **Altro** non cambiano nulla.

---

## 2. Accedere

Nella pagina di login si inseriscono **Username** e **Password**, poi *Accedi*.

Le credenziali possono essere di due tipi, e lo decide l'amministratore quando
crea l'utenza:

| Sorgente | Che password si usa |
|---|---|
| **Locale** | La password creata dall'amministratore dentro l'applicazione |
| **Active Directory** | La stessa password con cui si accede al PC del consorzio |

Con Active Directory lo **username deve essere identico a quello di dominio**
(`m.rossi` e `mrossi` sono due cose diverse).

### Leggere il messaggio di errore

Il colore del riquadro dice che cosa fare, prima ancora del testo:

- **Rosso — «Credenziali non valide»**: la password potrebbe essere sbagliata.
  Riprovare ha senso.
- **Ambra — tutto il resto**: riprovare *non* serve. Il messaggio dice che cosa
  fare:
  - *«Utente non abilitato. Contatta un amministratore per richiedere
    l'accesso.»* → la password di dominio era giusta, ma l'utenza non è ancora
    stata abilitata in questa applicazione. La richiesta è già arrivata
    all'amministratore: basta segnalarglielo.
  - *«Account disabilitato»* → l'utenza esiste ma è stata disattivata.
  - *«Account di dominio disabilitato»* / *«bloccato per troppi tentativi»* →
    serve un sistemista. **Con l'account bloccato, riprovare allunga il
    blocco.**
  - *«La tua password di dominio è scaduta»* → si cambia dal PC, poi si rientra.
  - *«Active Directory non è raggiungibile»* → problema di rete o di server,
    non di credenziali.

### Uscire

Il pulsante con la freccia (**Esci**) in alto a destra, oppure quello in fondo
al menù laterale. **La sessione dura 8 ore**, poi va rifatto l'accesso.

---

## 3. Muoversi nell'applicazione

### Il menù laterale

Su computer sta a sinistra ed è diviso in due gruppi:

- **Moduli principali** — Dashboard, Invia Notifica, Storico Notifiche,
  Anagrafiche, Template
- **Strumenti** — Gestione Utenti, Gestione Codici, Impostazioni

**Si vedono solo le voci a cui si ha accesso.** *Gestione Utenti* e *Gestione
Codici* compaiono agli amministratori e a nessun altro. *Impostazioni* compare a
tutti, ma le schede di configurazione (email, PEC, SMS, web service) le legge e
le modifica solo un amministratore: agli altri ruoli si aprono vuote.

Su telefono il menù diventa una barra in basso con le prime cinque voci, più il
pulsante ☰ in alto a destra per l'elenco completo. Nell'intestazione, su
telefono, restano solo le icone: descrizione della sezione, parola «Guida» e
nome utente si vedono da computer.

### L'intestazione, uguale in ogni pagina

In cima a ogni sezione, sempre nello stesso posto:

- **Titolo** della sezione e sua descrizione.
- **«Ultimo aggiornamento anagrafiche: …»** — quando sono stati caricati per
  l'ultima volta i dati del consorzio. **Verde** = aggiornati nelle ultime 24
  ore. **Ambra** = più vecchi di 24 ore (o mai caricati): l'ultima corsa
  notturna non è andata a buon fine, e conviene segnalarlo prima di spedire una
  comunicazione importante.
- **«Attenzione, dati in corso di aggiornamento»** — compare solo mentre un
  caricamento sta davvero girando. Durante quel periodo gli elenchi possono
  cambiare sotto gli occhi.
- **Guida** — apre questa guida in una scheda nuova. Il pulsante porta alla
  guida giusta per il proprio ruolo: chi è Admin o Super Admin apre la *Guida
  super user*, che aggiunge i capitoli sulla configurazione.
- **Area personale** — nome utente e ruolo; porta a *Impostazioni*.
- **Esci**.

### I ruoli

| Ruolo | Che cosa può fare |
|---|---|
| **Utente** | Tutte le pagine tranne *Gestione Utenti* e *Gestione Codici*, in scrittura: può inviare notifiche, creare template |
| **Osservatore** | Le stesse pagine, ma **in sola lettura**: può guardare, filtrare, esportare in CSV — non può inviare né modificare nulla |
| **Admin / Super Admin** | Tutto, comprese le sezioni di configurazione (vedi la guida super user) |

Se si è **Osservatore** e si prova a fare un'operazione di modifica,
l'applicazione la rifiuta: è un blocco voluto, non un errore.

---

## 4. Dashboard

È la pagina d'ingresso: la fotografia della rete in questo momento.

### Tratte chiuse

Il numero grande è **quante tratte risultano chiuse adesso** — i codici a 9
caratteri che iniziano per R o per S — e sotto c'è l'elenco, una riga per
tratta:

- il **codice** e la descrizione;
- **«Con la madre <codice>»** quando la tratta è chiusa perché è stata chiusa
  l'intera madre (è il caso tipico dei pozzi): la madre non compare come riga a
  sé, compaiono tutte le sue tratte;
- quando il codice ha una roggia madre nella seconda gerarchia, il suo nome
  comparirà sotto, come riferimento — non è un dato in più da controllare, solo
  a chi conosce la tratta col nome della roggia più che con quello del codice;
- **«Chiusa dal <data>»**: la data è un collegamento e porta alla notifica che
  ha prodotto quella chiusura.

Il conteggio è per tratta: una notifica che chiude quattro tratte lo fa salire
di quattro, e chiudere un pozzo con venti tratte lo fa salire di venti. Una
tratta chiusa due volte — da sé e con la sua madre — conta una volta sola.

### Ultime notifiche

Le sei comunicazioni più recenti, con data, ora e numero di destinatari. La
freccia a destra apre il dettaglio.

### I due grafici

**Chiusure** e **Notifiche** degli ultimi 30 giorni, un barra per giorno.

### Il badge «esempio»

Quando una sezione non ha ancora dati veri (nessuna chiusura registrata, nessuna
notifica inviata) mostra dei **dati di esempio** con l'etichetta arancione
`ESEMPIO`. Servono a far vedere come si presenterà la sezione: **non sono dati
reali**. Spariscono da soli alla prima chiusura o alla prima notifica vera, e
**ricompaiono ogni volta che la sezione torna vuota**: il riquadro «Tratte
chiuse» quando tutte le tratte sono state riaperte, i grafici in un mese senza
chiusure o senza notifiche. Un numero rosso con il badge `ESEMPIO` accanto non
è una tratta chiusa.

---

## 5. Invia notifica

È la sezione più importante. Si compila dall'alto verso il basso, e ogni passo
sblocca il successivo.

### Passo 1 — La sezione: Rogge Madri, Scorrimento, Impianti o Pozzi

Quattro riquadri in cima, **«Rogge Madri» per primo a sinistra**. La pagina si
apre su **«Scorrimento»**. Il riquadro attivo è verde.

**Attenzione**: cambiare sezione **azzera tutta la selezione fatta finora**
(madri, tratte, elenco conduttori). I testi già scritti restano.

La differenza fra le quattro sezioni non è estetica:

- **Rogge Madri**: la seconda gerarchia del consorzio, i codici R da 3 con
  nome proprio (per esempio «R08 — Roggia Serio e derivate»; l'elenco del
  25/09/2026 ne conta 64). Si scelgono le
  loro tratte come nelle altre sezioni con tratte. Ogni tratta mostra codice e
  descrizione; il badge **Chiusa** tiene conto anche dell'impianto a cui la
  tratta appartiene: chiudere l'impianto la chiude anche vista da qui.
- **Scorrimento** e **Impianti**: si scelgono le singole **tratte**, raggruppate
  per impianto. In Scorrimento compaiono solo impianti con codice `IM…`.
- **Pozzi**: **non si scelgono le tratte**. Si sceglie il pozzo, e la
  comunicazione vale per tutti i suoi conduttori. È scritto anche a schermo:
  *«La comunicazione vale per l'intero pozzo: le sue tratte non si scelgono una
  a una.»*

Se compare *«Nessuna roggia madre caricata. I due web service delle rogge
madri non sono ancora configurati in Impostazioni → WebService»*, la sezione
«Rogge Madri» non è un guasto della pagina: quei due dati arrivano da due web
service distinti da quelli di Scorrimento e Impianti, e un amministratore deve
ancora collegarli. Le stesse tratte restano comunque raggiungibili dalle
sezioni Scorrimento e Impianti.

### Passo 2 — Classificazione della comunicazione

Due tendine, **entrambe obbligatorie**. Stanno in alto, prima delle tratte,
perché descrivono l'evento: chi comunica una chiusura per inquinamento lo sa
prima ancora di sapere quali tratte toccherà.

**Tipo** — che cosa succede alla tratta:

| Valore | Effetto sullo stato |
|---|---|
| **Apertura** (badge verde) | I codici selezionati risultano **aperti** |
| **Chiusura** (badge rosso) | I codici selezionati risultano **chiusi** |
| **Altro** (badge grigio) | **Non cambia nulla**: comunicazione informativa |

`Altro` non è un ripiego per pigrizia: esiste apposta per le comunicazioni che
non sono né un'apertura né una chiusura, così non si è costretti a dichiarare
il falso.

**Classificazione** — perché succede:

| Valore | Badge |
|---|---|
| **Ordinaria** | blu |
| **Straordinaria** | giallo |
| **Inquinamento** | viola |

Finché una delle due tendine è vuota, resta bordata di ambra e il pulsante di
invio rimane spento.

### Passo 3 — Scegliere madri e tratte

**A sinistra: la madre** (Roggia madre / Impianto / Pozzo).

- C'è un campo *Cerca…* che filtra su codice e nome.
- Si possono selezionare **più madri insieme**; il contatore in alto a destra
  dice quante.
- Accanto a una madre già chiusa compare il badge rosso **Chiusa**. Le voci
  aperte non hanno badge: aperta è il caso normale.
- I codici che il consorzio ha legato a dei conduttori ma non ha ancora
  assegnato a nessun impianto (per esempio `R28`) **non compaiono** in
  Scorrimento, su richiesta del consorzio: si raggiungono dalla sezione
  **Rogge Madri**.
- Cambiare la selezione delle madri **svuota le tratte già spuntate** e la
  tabella dei conduttori.

**A destra: le tratte** (per Rogge Madri, Scorrimento e Impianti — non per Pozzi).

- Finché non si sceglie una madre, l'elenco dice *«Seleziona prima una o più
  rogge madri a sinistra»*.
- Ogni tratta appartiene a **una sola madre** — una roggia, un impianto o un
  pozzo — e quale sia lo indica il consorzio: **non si ricava dal codice**.
  Tratte con codici che iniziano allo stesso modo possono stare sotto impianti
  diversi.
- In testa, in un riquadro verde, c'è **«Tutta la roggia» / «Tutto
  l'impianto»**: una voce *Tutte le tratte di <codice>* per ciascuna madre
  scelta che abbia almeno una tratta visibile con la ricerca in corso. È il modo per **avvisare tutti quelli di una madre**: spuntarla
  accende tutte le sue tratte, anche quelle che la ricerca sta nascondendo; se
  erano già tutte accese, le spegne. Spuntare le tratte una per una fino
  all'ultima porta alla stessa selezione, e nessuno riceve la comunicazione due
  volte.
- Sotto, le singole tratte con codice, descrizione e badge **Chiusa** dove serve.
- Il campo *Cerca codice…* cerca anche nella descrizione.
- **Seleziona tutti / Deseleziona tutti** agiscono sull'elenco **filtrato dalla
  ricerca**: se si sta cercando `D010`, «Seleziona tutti» spunta solo quelle.
- Il contatore dice `<spuntate> / <visibili> selezionate`.

### Passo 4 — «Mostra Conduttori» e la scelta del legame

Il pulsante **Mostra Conduttori** si accende quando c'è almeno una tratta (o, per
i pozzi, almeno un pozzo) selezionata.

Si apre la finestra **«Con quale legame?»** con due opzioni:

- **Legame live**
- **Legame stagione irrigua**

Il consorzio lega i conduttori alle tratte in due modi distinti, e sono due
elenchi diversi. **Non c'è un valore preselezionato**, di proposito: questa
scelta decide *chi riceve la comunicazione*, e va fatta guardandola.

Sotto ogni opzione compare il conteggio: *«N conduttori su questa selezione»*.
Se dice:

- *«Nessun legame di questo tipo caricato nell'anagrafica»* → quell'export non è
  ancora arrivato dal consorzio. Non è un guasto della pagina.
- *«Nessun conduttore su questa selezione»* → l'elenco esiste, ma su queste
  tratte non c'è nessuno.

Scelto il legame, compare la tabella dei conduttori.

### Passo 5 — La tabella dei conduttori

Accanto al titolo *Conduttori* c'è il badge del legame scelto e il link
**Cambia** per rifare la scelta.

Le colonne sono sei: *Inviare*, *Destinatario*, *Tratta*, *Numero*, *Mail*,
*Canali*.

**Canali** dice su quali recapiti questa comunicazione raggiunge quella persona,
e ce ne può essere più d'uno:

- da quale delle due caselle partirà la mail: badge viola **PEC**, oppure
  **Email** per la posta ordinaria. Non si sceglie — lo decide l'anagrafica del
  conduttore;
- il badge **SMS**, che compare quando il conduttore ha un numero. È azzurro
  pieno se la spunta «Invia anche via SMS» è accesa (l'SMS parte davvero),
  grigio e vuoto se è spenta (il numero c'è, ma non verrà usato).

È «—» solo per chi non ha né indirizzo né numero: quella persona non riceverà
nulla, da nessun canale.

Sopra la tabella, accanto al conteggio, compare **«— N via PEC»** quando fra gli
spuntati c'è almeno un destinatario certificato. È il numero che conta: se la
PEC non è configurata, **l'invio viene rifiutato per intero** proprio su quel
gruppo (vedi *Se l'invio viene rifiutato*, più sotto). Vederlo prima è l'unico
modo per accorgersene quando si può ancora fare qualcosa. Ordinando per
*Canali* le PEC salgono in cima (e chi non ha indirizzo scende in fondo, dove
sta davvero), e si vede subito di chi si tratta.

La colonna **Numero** è il cellulare dell'anagrafica: serve solo se si spunta
«Invia anche via SMS» più sotto — è lo stesso numero che fa comparire il badge
*SMS* fra i *Canali* — ed è normale che sia «—» per molti conduttori: circa la
metà non ha un numero censito.

- **Una riga per conduttore, sempre.** Chi è legato a tre tratte selezionate
  compare una volta sola e riceve **una sola** email; nella colonna *Tratta* si
  vedono tutti i codici che lo riguardano.
- La colonna **Inviare** ha una spunta per riga: togliendola, quel conduttore
  non riceve nulla.
- **Tutte le colonne sono ordinabili**: si clicca l'intestazione, si riclicca per
  invertire.
- Il campo *Cerca nome o email…* filtra la tabella. **Il filtro tocca solo
  quello che si vede**: chi resta fuori dalla ricerca ma è spuntato riceverà
  comunque la comunicazione.
- Il contatore sopra la tabella è sempre sull'**insieme intero**: *«12 di 40
  conduttori riceveranno la comunicazione — 5 in elenco per «rossi»»*.
- **Seleziona tutti / Deseleziona tutti** agiscono sulle sole righe visibili
  nella ricerca corrente.

> **La tabella è una fotografia scattata al momento del clic.** Se si cambia
> categoria, madre o tratta, o se nel frattempo finisce un caricamento delle
> anagrafiche, la tabella si svuota e va rifatta: è voluto, evita di spedire ai
> contatti di prima proprio dopo averli aggiornati.

Nella tabella non compaiono i **conduttori cessati**: chi non è più attivo
nell'anagrafica del consorzio non riceve mai una comunicazione.

### Passo 6 — Titolo e testi

Sotto la tabella:

- **Titolo della comunicazione** — diventa **l'oggetto dell'email**. Parte già
  compilato con *«CBBG - Comunicazione Importante»*, si può cambiare. Non può
  restare vuoto.
- **Testo email** — il corpo del messaggio. Obbligatorio.
- **Carica template** — la tendina accanto al testo email: carica un modello
  già pronto e riempie in un colpo solo oggetto, testo email e testo SMS. I
  template si gestiscono nella sezione [Template](#8-template). *Un template
  senza testo SMS non cancella quello eventualmente già scritto a mano.*
- **Testo SMS** — **facoltativo**, a meno di spuntare «Invia anche via SMS»
  qui sotto: in quel caso diventa obbligatorio. Sotto al campo c'è un contatore
  `nn/160 caratteri`: oltre i 160 il messaggio potrebbe essere spezzato in più
  SMS.
- **Invia anche via SMS** — la spunta che fa davvero partire l'SMS, **spenta
  di default** perché ogni messaggio ha un costo. Accesa, mostra quanti dei
  destinatari selezionati hanno un numero: solo a quelli arriverà, gli altri
  restano senza.

> **Senza la spunta «Invia anche via SMS», l'SMS non parte.** Il testo si può
> scrivere comunque: resta registrato e si rilegge nel dettaglio dello
> Storico, ma parte solo se la spunta è accesa al momento dell'invio.

### Passo 7 — L'avviso «risulta già chiusa»

Se fra i codici selezionati ce ne sono già nello stato che si sta per
comunicare, compare una riga ambra:

> *«3 delle voci selezionate risultano già chiuse. La comunicazione parte lo
> stesso.»*

**Non è un blocco**: ripetere una comunicazione può essere legittimo. È un
promemoria, perché una chiusura mandata due volte per distrazione è una email in
più a tutti i conduttori di quella tratta.

### Passo 8 — Riepilogo e conferma

Il pulsante **Invia notifica** resta spento finché non sono soddisfatte tutte e
tre le condizioni, e il motivo è scritto accanto:

- almeno un destinatario — un conduttore spuntato, **oppure** un utente di
  test in ricezione (vedi sotto: con almeno uno attivo, si può inviare anche
  senza aver spuntato nessun conduttore);
- Tipo e Classificazione scelti (*«Scegli Tipo e Classificazione»*);
- titolo e testo email scritti (*«Scrivi titolo e messaggio»*), e anche il
  testo SMS se si è spuntato «Invia anche via SMS» (*«Scrivi il testo SMS»*).

Se c'è almeno un **utente di test** attivo e raggiungibile — li censisce un
superadmin dalla scheda Utenti di test di Impostazioni, e ricevono ogni
comunicazione inviata — accanto al bottone compare una riga ambra:

- *«Più N utenti di test in copia (nomi)»* se c'è anche almeno un conduttore
  spuntato: la comunicazione parte ai destinatari veri e, in copia, a quei
  nomi;
- *«Nessun conduttore selezionato: la comunicazione partirà ai soli N utenti
  di test (nomi)»* se si sono tolte le spunte a tutti i conduttori — è il modo
  per collaudare un invio reale senza raggiungere nessun conduttore vero.

Cliccando **Invia notifica** si apre il **Riepilogo invio notifica**, l'ultima
occasione per annullare. Contiene:

| Voce | Che cosa dice |
|---|---|
| **Titolo** | L'oggetto dell'email, con i badge di Tipo e Classificazione |
| **Codici interessati** | L'elenco completo dei codici, non il numero. `(tutte)` segnala una madre presa per intero |
| **Tipo di legame** | Live o Stagione irrigua |
| **Dati del consorzio aggiornati al** | In ambra se più vecchi di 24 ore: è il momento buono per annullare e chiedere un aggiornamento |
| **Utenti associati / da notificare** | Quanti sono in tabella e quanti riceveranno davvero |
| **Messaggio** | Il testo email per intero |
| **Testo SMS** | Solo se scritto: con «Invia anche via SMS» spuntata dice a quanti parte, altrimenti *«non verrà spedito, solo registrato»* |

**Conferma invio** fa partire la comunicazione.

### Passo 9 — Dopo l'invio

Compare il messaggio **«Invio avviato — Comunicazione in partenza verso N
destinatari. L'esito di ogni mail si vede nello Storico notifiche.»** — ma
attenzione: l'esito mail per mail non sta nello Storico, sta nella *pagina della
notifica* (vedi più sotto, *Capitolo 6 → L'esito dell'invio*).

Cosa succede:

- **La tabella dei conduttori si svuota** subito. È voluto: lasciarla lì
  significherebbe lasciare armato il pulsante, e chi non ha visto il messaggio
  riclicca spedendo tutto una seconda volta. I testi scritti restano.
- **La spedizione prosegue in sottofondo.** La risposta arriva appena la
  notifica è registrata, non quando l'ultima email è partita: su un invio ampio
  ci vogliono minuti.
- **L'esito email per email si legge nella pagina della notifica**, che si apre
  dalla Dashboard (vedi *Capitolo 6 → L'esito dell'invio*).

### Se l'invio viene rifiutato

Compare un messaggio rosso **«Invio non riuscito»** con la ragione. La più
frequente:

> *«Configurazione PEC assente: 47 destinatari su 120 vanno raggiunti via PEC —
> imposta le credenziali PEC in Impostazioni»*

Metà dei conduttori attivi ha un indirizzo **PEC**, e le comunicazioni PEC
partono da una casella dedicata. Il numero non arriva a sorpresa: è lo stesso
che la tabella dei conduttori mostra come **«N via PEC»** prima ancora di
premere *Invia notifica*. Se quella casella non è configurata **l'invio
si ferma per intero** e non parte nulla: non si ripiega sulla posta ordinaria,
perché una PEC spedita da una casella normale non ha valore legale. Vale il
simmetrico per la posta ordinaria. La configurazione la fa un amministratore in
*Impostazioni*.

Un'altra risposta possibile:

> *«Codici spenti in Gestione Codici: … Aggiorna la pagina e rifai la
> selezione.»*

Un amministratore ha spento uno dei codici scelti mentre si compilava la
comunicazione. Si ricarica la pagina: quel codice non compare più, e si rifà la
selezione senza.

### Codici che non compaiono

Gli amministratori possono **spegnere** una roggia madre, un impianto o un pozzo
in *Gestione Codici*: da quel momento sparisce da *Invia notifica* e dalle
*Anagrafiche*, insieme alle tratte che non hanno un'altra madre accesa. Se un
codice che ci si aspetta non c'è, non è un guasto: va chiesto a un
amministratore. Lo Storico e la Dashboard continuano a mostrare le comunicazioni
già inviate su quei codici.

---

## 6. Storico notifiche

L'archivio di tutte le comunicazioni inviate, con il dettaglio di chi le ha
ricevute e di dove sono state indirizzate. L'esito dell'invio — partita o
fallita, destinatario per destinatario — si legge invece nella **pagina della
notifica** (vedi *L'esito dell'invio*, in fondo al capitolo).

### Filtri di ricerca

Sette filtri, che si combinano fra loro:

| Filtro | Come funziona |
|---|---|
| **Utente** | Tendina con chi ha inviato almeno una comunicazione |
| **Data inizio / Data fine** | Intervallo di date |
| **Tratta** | Testo libero: cerca su codice **e** descrizione della tratta |
| **Tipo** | Apertura / Chiusura / Altro |
| **Classificazione** | Ordinaria / Straordinaria / Inquinamento |
| **Destinatario** | Testo libero: cerca su nome e codice del conduttore, indirizzo email e numero |

I filtri **non si applicano mentre si scrive**: si compilano e si preme
**Applica filtri**. **Resetta** li svuota tutti.

### La tabella

Colonne: *ID Notifica*, *Utente*, *Data e ora*, *N° Tratte*, *N° Destinatari*,
*Tipo*, *Classificazione*, *Legame*. Tutte **ordinabili** cliccando
l'intestazione; l'ordinamento predefinito è per data, dalla più recente.

Accanto all'ID, il badge ambra **Prova** segna una comunicazione arrivata ai
soli utenti di test (un collaudo, non una comunicazione vera).

**Legame** dice con quale elenco sono stati scelti i destinatari: badge
**Live** oppure **Stagione irrigua**, come scelto nel popup «Con quale legame?»
al momento dell'invio. È «—» sulle comunicazioni partite prima che il legame si
potesse scegliere.

In fondo il conteggio dei record trovati.

**Esporta CSV** scarica esattamente le righe visibili, con i filtri applicati.
Il file si apre correttamente in Excel italiano, accenti compresi.

Anche qui, se non è mai stata inviata nessuna comunicazione, si vedono **dati di
esempio** con il badge `ESEMPIO`, che rispondono ai filtri come farebbero i dati
veri.

### Il dettaglio di una notifica

Si clicca una riga qualunque. Si apre una finestra con:

- **Intestazione**: ID, utente, data e ora, badge Tipo, Classificazione e
  Legame.
- **Oggetto** e **Messaggio inviato**: il testo *effettivamente spedito* per
  quella comunicazione, non il template da cui derivava.
- **Testo SMS**, se era stato scritto.
- **La tabella dei destinatari**, una riga per persona:

| Colonna | Significato |
|---|---|
| **Codice / Descrizione Conduttore** | Chi ha ricevuto, come risultava all'anagrafica *in quel momento*. Il badge ambra **Test** segna la copia inviata a un utente di test |
| **Codice / Descrizione Roggia** | Su quali tratte è passata la comunicazione |
| **SMS** | Il numero a cui era indirizzato l'SMS; «—» se il conduttore non aveva un numero. **Non dice** se l'SMS è partito |
| **Mail** | L'indirizzo a cui era indirizzata la mail; «—» se non ne aveva uno. **Non dice** se la mail è partita |
| **Canale** | Badge viola **PEC** oppure **Email**. È «—» sulle notifiche più vecchie, precedenti ai due canali |

- **Esporta dettaglio CSV** scarica l'elenco completo dei destinatari di quella
  notifica.

I dati del destinatario sono una **fotografia scattata all'invio**: se il
conduttore cambia indirizzo il mese dopo, lo Storico continua a dire dove era
stata mandata la comunicazione. È il comportamento voluto.

### L'esito dell'invio

Se una mail o un SMS sono **partiti davvero** lo dice la **pagina della
notifica**, che si apre dalla **Dashboard**: la freccia accanto a una delle
*Ultime notifiche*, oppure il collegamento *«Chiusa dal <data>»* di una tratta
chiusa. Contiene:

- **Riepilogo**: tratta, tipo, classificazione, legame, numero di destinatari,
  date e autore;
- **Statistiche Consegna**: sulle comunicazioni partite da *Invia notifica*
  questo riquadro resta vuoto, e non è un guasto;
- **Destinatari**, con l'indirizzo email e le colonne **Stato Email** (*In
  attesa*, *Inviata*, *Fallita*, *Aperta*) e **Stato SMS** (*In attesa*,
  *Inviato*, *Fallito*). È questa la tabella da guardare. La colonna *Nome*
  resta vuota: chi è il destinatario lo dice il dettaglio dello Storico.

Due cose da sapere:

- **Senza la spunta «Invia anche via SMS» lo Stato SMS resta *In attesa***:
  l'SMS non è mai partito, e non partirà.
- La Dashboard elenca solo le **sei** comunicazioni più recenti. Per una più
  vecchia la pagina si apre scrivendo nella barra degli indirizzi
  `…/notifiche/<numero>`, dove il numero è l'ID della prima colonna dello
  Storico senza la `N` e gli zeri iniziali: `N00042` diventa `…/notifiche/42`.

---

## 7. Anagrafiche

La copia dei dati del consorzio caricata a sistema. **Sola lettura, sempre**:
non c'è nessun pulsante di modifica, in nessuna scheda, per nessun ruolo.

### Le cinque schede

| Scheda | Contenuto | Colonne |
|---|---|---|
| **Impianti** | Tutte le tratte — di rogge, impianti e pozzi — con il loro impianto | Codice impianto, Descrizione impianto, Codice roggia figlia, Descrizione roggia figlia, **Stato** |
| **Rogge madri** | La seconda gerarchia del consorzio: le rogge madri a codice R da 3 (64 nell'elenco del 25/09/2026) e le loro tratte | Codice madre, Descrizione madre, Codice roggia figlia, Descrizione roggia figlia, **Stato**: la madre è la roggia madre, non l'impianto |
| **Destinatari** | I conduttori attivi, anche quelli senza nessun contatto | Codice destinatario, Descrizione destinatario, Numero, Mail |
| **Legame Live** | Chi è legato a quale tratta secondo l'elenco *live*; solo i conduttori presenti in anagrafica, **compresi i cessati**, che in *Invia notifica* non compaiono | Codice/Descrizione destinatario, Codice/Descrizione roggia figlia |
| **Legame Stagione Irrigua** | Lo stesso, secondo l'elenco *stagione irrigua* | idem |

Nelle intestazioni *roggia figlia* vuol dire **tratta**. Nella scheda **Impianti**
la *madre* è quella che il consorzio assegna alla tratta: per le tratte che
iniziano per `R` è un impianto con codice `IM…`, salvo quelle raccolte sotto
una madre *non classificata*. Nella scheda **Rogge madri** la *madre* è invece
la roggia madre stessa (un codice R da 3, per esempio `R08`): è **un'altra
classificazione dello stesso consorzio**, mantenuta a parte, e le due liste non
coincidono sempre — una tratta può comparire sotto un impianto nella prima
scheda e non avere nessuna roggia madre nella seconda, o viceversa. Non è un
errore di una delle due tabelle: sono due elenchi diversi che il consorzio
tiene entrambi.

La colonna **Stato** della scheda Impianti è calcolata, non caricata: dice
*Aperta* o *Chiusa* secondo le notifiche inviate. Una tratta senza eventi propri
eredita lo stato della madre.

Nella scheda **Destinatari**, *Numero* è il cellulare e *Mail* l'indirizzo di
posta. Due cose che la tabella **non** dice, e che è bene sapere prima di
cercarle:

- **non distingue PEC e posta ordinaria** — l'indirizzo si vede, il tipo no.
  Questa scheda serve a consultare l'anagrafica, non a preparare un invio: il
  canale di ciascun destinatario si legge nella colonna *Canale* di *Invia
  notifica*, e quello davvero usato per una comunicazione già partita nel
  dettaglio dello Storico;
- **il numero serve solo se in *Invia notifica* si spunta «Invia anche via
  SMS»**: senza quella spunta il canale SMS non parte, e il numero resta un
  dato consultabile. Se manca è perché il consorzio non lo ha in anagrafica,
  e per quel conduttore l'SMS non può arrivare.

### Cercare e ordinare

Ogni colonna ha:

- l'**intestazione cliccabile** per ordinare (e riordinare al contrario);
- un campo **Cerca…** proprio, sotto l'intestazione.

I campi si combinano: si può cercare `S45` fra i codici madre *e* `Adda` fra le
descrizioni. Dentro un campo contano le **singole parole, in qualunque ordine**:
`mario rossi` trova «Rossi Mario». In fondo alla tabella: *«N di M record»*.

Tre segnaposto, chiesti dal consorzio:

- nella scheda **Rogge madri**, una roggia madre che non ha figlie compare con
  una sola riga, con **«-»** come figlia; una figlia la cui roggia madre non è
  nell'elenco del consorzio compare con le sue prime 3 cifre come madre e
  **«-»** come descrizione;
- nelle schede **Legame**, una tratta che nessuna anagrafica conosce ha come
  descrizione **il suo codice**; i legami verso un conduttore che non è in
  anagrafica non si mostrano.

### Il riquadro ambra degli avvisi

Sopra le schede può comparire un riquadro con bordo arancione. Segnala che
l'ultimo caricamento dati ha avuto problemi:

- **«Ultimo caricamento parziale»** con i conteggi per entità;
- **«L'ultimo tentativo di caricamento (<data>) non è riuscito»** con l'elenco
  degli errori;
- **«Non configurate, mai caricate: …»** — quelle entità non sono ancora state
  collegate al web service, ed è il motivo per cui la loro tabella è vuota.

Il riquadro tace mentre un caricamento è in corso.

Se una tabella è vuota e dice *«Nessun impianto caricato. Lancia un aggiornamento
dati»*, l'aggiornamento si lancia da *Impostazioni → WebService → Aggiorna ora*:
di solito lo fa un amministratore, ma il pulsante è disponibile anche al ruolo
Utente.

I codici spenti da un amministratore in *Gestione Codici* non compaiono nelle
schede Impianti, Rogge madri e Legame; la scheda Destinatari li ignora, perché
elenca persone e non codici.

---

## 8. Template

I messaggi preimpostati che si caricano in *Invia notifica*.

### L'elenco

Colonne *ID*, *Nome*, *Oggetto Mail*, *Messaggio*, *Utente*, *Tipo*, *Azioni* —
tutte ordinabili. Sopra la tabella:

- **Cerca template…** — testo libero;
- **Tutti i tipi** — filtra per Apertura / Chiusura / Altro;
- **Tutti gli utenti** — filtra per chi l'ha creato (c'è anche *Non indicato*).

Cliccando una riga si apre il **dettaglio**: nome, tipo, utente, data di
creazione, ultima modifica (chi e quando), oggetto e corpo per intero. Dal
dettaglio si passa direttamente alla modifica.

### Creare o modificare un template

Pulsante **Nuovo Template**, oppure l'icona matita sulla riga.

| Campo | Note |
|---|---|
| **Nome** * | Come comparirà nella tendina di *Invia notifica* |
| **Tipo** * | Apertura, Chiusura o Altro. Serve **solo a filtrare l'elenco**: non decide se una roggia risulta aperta o chiusa — quello lo fa il Tipo scelto al momento dell'invio |
| **Oggetto Email** * | Diventa il titolo proposto quando si carica il template |
| **Corpo Email** * | Il testo, che parte **esattamente com'è scritto**. Non ci sono variabili: una scritta come `{{data}}` arriverebbe al conduttore così, con le parentesi. Anche i tag HTML arrivano come testo; gli a capo invece si conservano |
| **Testo SMS** * | La versione corta, precaricata in *Invia notifica* insieme a titolo e testo email quando si carica il template. Parte davvero solo se lì si spunta «Invia anche via SMS» |

Se non esiste ancora nessun template, in *Invia notifica* il pulsante per
caricarne uno propone tre testi di partenza già pronti (*Comunicazione chiusura
tratta*, *Avviso manutenzione programmata*, *Comunicazione riapertura*), che
riempiono solo il testo email.

L'icona cestino elimina il template, con una conferma. L'eliminazione **non
tocca le comunicazioni già inviate**: il loro testo resta nello Storico.

---

## 9. Il vocabolario dell'applicazione

| Termine | Significato |
|---|---|
| **Conduttore** | Chi deriva acqua da una tratta: il destinatario delle comunicazioni |
| **Madre** | La roggia, l'impianto o il pozzo sotto cui stanno le tratte (es. `IM44A`, `S45`). Le madri si dividono in tre categorie — Rogge, Impianti, Pozzi — e sia la categoria sia le tratte di ogni madre le indica il consorzio |
| **Tratta** (nelle Anagrafiche *roggia figlia*) | Un tratto di canale da cui i conduttori derivano acqua, con un codice di 9 caratteri (es. `R34D02S01`). **A quale madre appartenga lo dice il consorzio**, non le prime lettere del codice |
| **Tutte le tratte di …** | La voce di *Invia notifica* che spunta in un colpo tutte le tratte di una madre. Per i pozzi non serve: si sceglie direttamente il pozzo |
| **Non classificata** | Una madre creata dall'applicazione per raccogliere i codici che il consorzio lega a dei conduttori ma non ha ancora assegnato a nessun impianto. Non esiste nell'anagrafica del consorzio |
| **Legame live** | Uno dei due elenchi con cui il consorzio associa conduttori e tratte |
| **Legame stagione irrigua** | L'altro elenco |
| **Tipo** | Apertura / Chiusura / Altro — che cosa succede alla tratta |
| **Classificazione** | Ordinaria / Straordinaria / Inquinamento — perché succede |
| **PEC** | Posta Elettronica Certificata: circa metà dei conduttori attivi ha un indirizzo PEC e viene raggiunta da una casella dedicata |
| **Canale** | Da quale delle due caselle parte (o è partita) una comunicazione: *PEC* o *Email*. Lo sceglie il sistema, destinatario per destinatario. È una colonna nel dettaglio dello Storico; in *Invia notifica* si chiama *Canali* e accanto alla casella mostra anche il badge **SMS** di chi ha un numero |
| **Testo SMS** | La versione corta del messaggio. Si scrive sempre, ma **parte solo se si spunta «Invia anche via SMS»** in *Invia notifica* — altrimenti resta registrata e basta |
| **Anagrafiche / mirror** | La copia locale dei dati del consorzio, ricaricata ogni notte alle 03:00 |
| **Impianti / Pozzi** | Le altre due categorie di madri, accanto alle rogge. I pozzi si comunicano per madre intera |

---

## 10. Problemi frequenti

**«Mostra Conduttori» è spento.**
Non c'è nessuna tratta selezionata (o, per i pozzi, nessun pozzo). Per rogge e
impianti serve almeno una spunta nella colonna di destra.

**Ho selezionato un pozzo ma non vedo nessuna tratta.**
È corretto: per i pozzi le tratte non si mostrano. La comunicazione vale per
l'intero pozzo, e i suoi conduttori li risolve il sistema.

**La tabella dei conduttori è sparita da sola.**
È successa una di queste tre cose: si è cambiata la selezione, è finito un
caricamento delle anagrafiche, oppure una comunicazione è appena partita. Si
rifà con *Mostra Conduttori*.

**Il pulsante «Invia notifica» resta spento.**
Accanto al pulsante c'è scritto perché: mancano Tipo e Classificazione, oppure
titolo e testo (testo SMS compreso, se «Invia anche via SMS» è spuntata),
oppure non c'è nessun destinatario — nessun conduttore spuntato e nessun
utente di test in ricezione.

**L'elenco dei conduttori è vuoto.**
Con l'altro legame potrebbe non esserlo: si prova *Cambia* accanto al badge del
legame. Se entrambi sono vuoti, su quelle tratte non risulta nessun conduttore
attivo.

**Il conduttore dice che non gli è arrivato nessun SMS.**
Due cause possibili: quella comunicazione è partita senza la spunta «Invia
anche via SMS» (il testo si scrive comunque, ma senza la spunta non parte),
oppure quel conduttore non ha un numero di cellulare in anagrafica — succede
a circa metà dei conduttori attivi. Nel dettaglio dello Storico, colonna *SMS*
vuota («—») vuol dire nessun numero. Nella pagina della notifica (capitolo 6,
*L'esito dell'invio*), *Stato SMS* **In attesa** vuol dire che la spunta non
c'era, **Fallito** che la spunta c'era ma l'invio non è riuscito.

**Nel dettaglio dello Storico la colonna SMS è vuota.**
Il conduttore non aveva un numero di cellulare in anagrafica al momento
dell'invio. La colonna mostra il numero, non l'esito: se l'SMS sia partito lo
dice la pagina della notifica.

**Una roggia, un impianto o un pozzo non compare più.**
Un amministratore l'ha spento in *Gestione Codici* (capitolo 5, *Codici che
non compaiono*). Le comunicazioni già inviate restano nello Storico.

**«Troppi codici selezionati: N, il massimo è 500».**
La selezione è troppo ampia per l'anteprima. Quando si vogliono tutte le tratte
di una madre, si usa la voce *Tutte le tratte di …*: conta come un codice solo.

**Le voci «Gestione Utenti» e «Gestione Codici» non ci sono.**
Sono riservate ad Admin e Super Admin. Le altre voci si vedono tutte.

**«Accesso non autorizzato» e vengo rimandato alla Dashboard.**
Stessa cosa: si è aperto l'indirizzo di una di quelle due pagine senza esserlo.

**«Ultimo aggiornamento anagrafiche» è in ambra da giorni.**
Il caricamento notturno non sta andando a buon fine. Va segnalato a un
amministratore: i contatti che si stanno usando potrebbero essere vecchi.

**Ho inviato ma nello Storico la notifica sembra ferma.**
La spedizione prosegue in sottofondo e su un invio ampio richiede minuti. Si
riapre la pagina della notifica dopo qualche minuto per vedere gli esiti
aggiornati.
**Non si rinvia la stessa comunicazione**: si spedirebbe due volte a tutti.

**Ho sbagliato la comunicazione già inviata.**
Non si può ritirare una email spedita. Si manda una comunicazione di rettifica —
e se aveva chiuso o aperto qualcosa per errore, la si corregge inviando la
notifica opposta sugli stessi codici.
