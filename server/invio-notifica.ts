// L'invio vero dalla pagina «Invia notifica» (issue #23).
//
// Fino alla issue #14 la pagina leggeva l'anagrafica vera del consorzio ma non
// spediva niente: `confermaInvio` mostrava un toast e finiva lì. Da qui parte
// invece la comunicazione, e il «Titolo della comunicazione» è l'oggetto della
// mail — che è precisamente quel che la issue #23 chiede di garantire.
//
// Sta in un modulo suo, con le dipendenze iniettabili come in `avviso-sync.ts`,
// perché in questo repo Express non è testabile: una funzione che decide se una
// comunicazione parte, e a chi, non può restare senza test.
//
// Non passa dalla rotta `/api/notifications/send`: quella risolve i destinatari
// dalle tabelle legacy con id numerici (`getUsersBySegmentId`), mentre qui le
// chiavi sono i codici del mirror — `keyroggia` per le tratte, `keykey` per i
// conduttori. Due mondi con chiavi diverse dentro lo stesso codice di invio
// sarebbero due rami in ogni passaggio, e il percorso legacy serve ancora allo
// scheduler.

import { storage } from "./storage";
import {
  getConfigEmail, getConfigEmailPec, emailConfigurata, mittenteDi,
  getConfigSms, smsConfigurata, type ConfigSms,
  CANALI_EMAIL, ETICHETTE_CANALE, canaleDi, type CanaleEmail, type ConfigEmail,
} from "./config-notifiche";
import { sendSMS, type SMSResult } from "./sms";
import { contaPerCanale } from "@shared/canale-email";
import { createTransporter } from "./email";
import { tokenDestinatario } from "./tracking-token";
import { validaRichiestaInvio, mancanoDestinatari } from "@shared/invio-notifica";
import { aggregaDestinatari, codiciTratte, descrizioniTratte, SEPARATORE_TRATTE } from "@shared/destinatari";
import { utenteTestRaggiungibile } from "@shared/utenti-test";
import type {
  DestinatarioTratta, NotificationRecipient, TargetNotifica,
  MadreSelezionabile, TrattaSelezionabile, UtenteTest,
} from "@shared/schema";
import type { TipoLegame } from "@shared/legame";
import type { NomiGerarchiaRogge } from "@shared/gerarchia-rogge";

/**
 * Quel poco che serve dell'archivio: il resto di `IStorage` non entra qui.
 *
 * `getDestinatariPerTratte` è dichiarata col tipo condiviso e non con una forma
 * scritta a mano: la `roggiaDescrizione` che arriva da lì finisce nello snapshot
 * su cui cerca il filtro "Roggia" dello Storico, e una firma più larga
 * lascerebbe sparire quel campo senza che il compilatore dica niente.
 */
export interface ArchivioInvio {
  getDestinatariPerTratte(keyroggie: string[], legame: TipoLegame): Promise<DestinatarioTratta[]>;
  getDestinatariPerMadri(codicimadre: string[], legame: TipoLegame): Promise<DestinatarioTratta[]>;
  createNotification(data: any): Promise<{ id: number }>;
  createNotificationRecipient(data: Partial<NotificationRecipient>): Promise<NotificationRecipient>;
  registraEsitoEmail(id: number, esito: { status: string; messageId?: string | null; sentAt?: Date }): Promise<void>;
  updateRecipientSmsStatus(id: number, status: string, deliveredAt?: Date): Promise<void>;
  updateNotificationStatus(id: number, status: string, sentAt?: Date): Promise<void>;
  createNotificationTargets(notificationId: number, targets: TargetNotifica[]): Promise<number>;
  getMadriSelezionabili(): Promise<MadreSelezionabile[]>;
  getTratteDiMadri(codicimadre: string[]): Promise<TrattaSelezionabile[]>;
  getUtentiTestAttivi(): Promise<UtenteTest[]>;
  getMappaMadri(): Promise<Record<string, string>>;
  getNomiGerarchiaRogge(): Promise<NomiGerarchiaRogge>;
}

/** Il minimo di nodemailer che serve, così il test può passare un finto. */
export interface TrasportoEmail {
  sendMail(opzioni: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html: string;
  }): Promise<unknown>;
}

export interface DepsInvio {
  archivio?: ArchivioInvio;
  /** Credenziali per canale; quelle non passate si leggono da `config-notifiche`. */
  config?: Partial<Record<CanaleEmail, ConfigEmail>>;
  /** Costruisce il trasporto di un canale: uno per canale, creato solo se serve. */
  creaTrasporto?: (config: ConfigEmail, canale: CanaleEmail) => TrasportoEmail;
  /** Credenziali SMS; se assenti si leggono da `config-notifiche`. */
  configSms?: ConfigSms;
  /** L'invio di un singolo SMS, iniettabile: i test non chiamano la piattaforma. */
  inviaSmsFn?: (to: string, testo: string, config: ConfigSms) => Promise<SMSResult>;
  appUrl?: string;
  adesso?: () => Date;
}

/** Un invio già registrato in tabella, che aspetta solo di partire. */
export interface InvioPreparato {
  notificationId: number;
  titolo: string;
  messaggio: string;
  /** Il testo corto e se va spedito: `""` quando l'SMS non parte. */
  messaggioSms: string;
  inviaSms: boolean;
  configSms: ConfigSms;
  /** Una riga destinatario per conduttore, con indirizzo e numero già ripuliti. */
  righe: { id: number; email: string | null; canale: CanaleEmail; telefono: string | null }[];
  /** Le credenziali dei due canali, fotografate alla preparazione. */
  config: Record<CanaleEmail, ConfigEmail>;
}

export type EsitoPreparazione =
  | { ok: true; preparato: InvioPreparato; destinatari: number }
  | { ok: false; errore: string };

export type EsitoInvioNotifica =
  | {
      ok: true;
      notificationId: number;
      /** Destinatari a cui la comunicazione era indirizzata. */
      destinatari: number;
      inviate: number;
      fallite: number;
    }
  | { ok: false; errore: string };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Il messaggio scritto nella textarea, reso come HTML.
 *
 * Il testo arriva a capo dove l'operatore è andato a capo: infilato grezzo in un
 * corpo HTML diventerebbe un unico paragrafo, e una comunicazione del consorzio
 * arriverebbe illeggibile senza che nessuno se ne accorga prima di spedirla.
 */
export function corpoHtml(messaggio: string): string {
  return escapeHtml(messaggio).replace(/\r\n|\r|\n/g, "<br>");
}

/**
 * I codici scelti, con il nome che avevano al momento dell'invio.
 *
 * Il nome si rilegge dall'anagrafica e non si prende dalle coppie destinatario
 * → tratta: quelle esistono solo dove c'è almeno un conduttore, mentre un
 * target va scritto anche per una tratta senza nessuno attaccato. Un codice non
 * più risolvibile passa con `descrizione` null, come `roggiaDescrizione` nello
 * snapshot dei destinatari: meglio un codice nudo che nessuna riga.
 */
async function targetDellaSelezione(
  archivio: ArchivioInvio,
  tratte: string[],
  madri: string[],
): Promise<TargetNotifica[]> {
  const target: TargetNotifica[] = [];

  if (tratte.length > 0) {
    // La madre di una tratta è un dato, non le sue prime 3 posizioni: si legge
    // dal registro. Serve solo a recuperare i nomi da fotografare — lo
    // Storico deve dire fra sei mesi come si chiamava la tratta quel giorno.
    const mappa = await archivio.getMappaMadri();
    const madriDelleTratte: string[] = [];
    for (const t of tratte) {
      const m = mappa[t];
      if (m !== undefined && madriDelleTratte.indexOf(m) === -1) madriDelleTratte.push(m);
    }
    const figlie = await archivio.getTratteDiMadri(madriDelleTratte);
    const nomi = new Map(figlie.map((f) => [f.keyroggia, f.name]));
    // Un codice scelto dal quarto bottone può non essere in `tratte`: nessun
    // impianto lo rivendica. Il nome ce l'ha la seconda gerarchia, e senza
    // questo ripiego lo Storico mostrerebbe un codice nudo per sempre.
    const mancanti = tratte.filter((t) => !nomi.has(t));
    const nomiRogge = mancanti.length > 0
      ? (await archivio.getNomiGerarchiaRogge()).tratte
      : {};
    for (const t of tratte) {
      target.push({ codice: t, livello: "tratta", descrizione: nomi.get(t) ?? nomiRogge[t] ?? null });
    }
  }

  if (madri.length > 0) {
    const tutte = await archivio.getMadriSelezionabili();
    const nomi = new Map(tutte.map((m) => [m.codicemadre, m.name]));
    for (const m of madri) {
      target.push({ codice: m, livello: "madre", descrizione: nomi.get(m) ?? null });
    }
  }

  return target;
}

/**
 * Le tratte nominate da una selezione, per lo snapshot degli utenti di test:
 * quelle spuntate, poi quelle di ogni madre scelta per intero, senza doppioni.
 */
function tratteDellaSelezione(
  target: TargetNotifica[],
  figlie: TrattaSelezionabile[],
): { keyroggia: string; roggiaDescrizione: string | null }[] {
  const out = new Map<string, string | null>();
  for (const t of target) {
    if (t.livello === "tratta") {
      if (!out.has(t.codice)) out.set(t.codice, t.descrizione);
      continue;
    }
    const sue = figlie.filter((f) => f.codicemadre === t.codice);
    if (sue.length === 0 && !out.has(t.codice)) out.set(t.codice, t.descrizione);
    for (const f of sue) if (!out.has(f.keyroggia)) out.set(f.keyroggia, f.name);
  }
  return [...out].map(([keyroggia, roggiaDescrizione]) => ({ keyroggia, roggiaDescrizione }));
}

/**
 * Spedisce una comunicazione ai conduttori scelti sulle tratte selezionate.
 *
 * `createdBy` arriva dalla sessione e non dal corpo della richiesta: chi ha
 * spedito non deve poterselo firmare da solo.
 */
export async function preparaInvio(
  raw: {
    tratte?: unknown;
    madri?: unknown;
    destinatari?: unknown;
    titolo?: unknown;
    messaggio?: unknown;
    messaggioSms?: unknown;
    tipo?: unknown;
    classificazione?: unknown;
    legame?: unknown;
  },
  opzioni: { createdBy?: string | null } = {},
  deps: DepsInvio = {},
): Promise<EsitoPreparazione> {
  const archivio = deps.archivio ?? storage;
  const config: Record<CanaleEmail, ConfigEmail> = {
    normale: deps.config?.normale ?? getConfigEmail(),
    pec: deps.config?.pec ?? getConfigEmailPec(),
  };
  const configSms = deps.configSms ?? getConfigSms();

  const esito = validaRichiestaInvio(raw);
  if (!esito.ok) return { ok: false, errore: esito.errore };
  const richiesta = esito.richiesta;

  // I destinatari si rileggono dall'anagrafica, non si prendono dal browser.
  // `getDestinatariPerTratte` scarta già i conduttori cessati e ripulisce il
  // cellulare (issue #14); qui resta da tenere solo chi è rimasto spuntato.
  // Le due strade di selezione confluiscono qui: le tratte spuntate a mano
  // (rogge e impianti) e le madri prese per intero (i pozzi, issue #26).
  // `aggregaDestinatari` toglie i doppioni, quindi una tratta che ricade sotto
  // una madre già scelta non raddoppia né il destinatario né la sua riga.
  const coppie = [
    ...(await archivio.getDestinatariPerTratte(richiesta.tratte, richiesta.legame)),
    ...(await archivio.getDestinatariPerMadri(richiesta.madri, richiesta.legame)),
  ];
  const scelti = new Set(richiesta.destinatari);
  // Una mail per conduttore anche se lo raggiungono più tratte (issue #5), con
  // tutte le tratte nello snapshot.
  const destinatari = aggregaDestinatari(coppie, (c) => c.keykey).filter((d) =>
    scelti.has(d.conduttore.keykey),
  );

  // Gli utenti di test attivi ricevono ogni comunicazione, qualunque roggia
  // (issue #36). Si leggono qui, dopo `aggregaDestinatari`: non sono conduttori,
  // non hanno `keykey`, e non devono entrare nella deduplicazione per identita'.
  const utentiTest = await archivio.getUtentiTestAttivi();

  // Solo chi questa comunicazione raggiunge davvero: un utente di test col
  // solo telefono, con l'SMS spento, non è un destinatario.
  const utentiTestRaggiungibili = utentiTest.filter((u) =>
    utenteTestRaggiungibile(
      { haEmail: (u.email ?? "").trim() !== "", haTelefono: (u.telefono ?? "").trim() !== "" },
      richiesta.inviaSms,
    ),
  ).length;

  if (mancanoDestinatari({ conduttori: destinatari.length, utentiTestAttivi: utentiTestRaggiungibili })) {
    return { ok: false, errore: "Nessun destinatario trovato fra quelli selezionati" };
  }

  const totaleDestinatari = destinatari.length + utentiTest.length;

  // Servono le credenziali di ogni canale che questa selezione usa davvero, e si
  // controllano prima di qualunque scrittura: una notifica registrata senza che
  // sia partito nulla è una riga di Storico che racconta un invio mai avvenuto.
  //
  // Manca la PEC? Ci si ferma, non si ripiega sulla posta ordinaria: una PEC
  // spedita da una casella normale non ha ricevuta di accettazione né di
  // consegna, e per metà dei conduttori attivi sarebbe una comunicazione che il
  // consorzio crede fatta e che invece non vale.
  //
  // Il conteggio è quello di `contaPerCanale` (@shared/canale-email), lo stesso
  // che «Invia notifica» mostra prima di premere: il numero nel rifiuto non deve
  // poter smentire quello che l'operatore aveva a schermo.
  // Gli utenti di test entrano nel conteggio come tutti: uno di essi in PEC
  // pretende le credenziali PEC, ed e' proprio quello che si sta collaudando.
  const perCanale = contaPerCanale([
    ...destinatari.map((d) => d.conduttore),
    ...utentiTest.map((u) => ({ email: u.email, tipoEmail: u.tipoEmail })),
  ]);
  for (const canale of CANALI_EMAIL) {
    const quanti = perCanale[canale];
    if (quanti > 0 && !emailConfigurata(config[canale])) {
      const dove = canale === "pec" ? "le credenziali PEC" : "le credenziali email";
      return {
        ok: false,
        errore:
          `Configurazione ${ETICHETTE_CANALE[canale]} assente: ${quanti} destinatari su ` +
          `${totaleDestinatari} vanno raggiunti via ${ETICHETTE_CANALE[canale]} — imposta ${dove} in Impostazioni`,
      };
    }
  }

  // L'SMS richiesto senza credenziali si ferma qui, come la PEC: chi ha acceso
  // la spunta crede di aver avvisato anche per SMS, e non lo scoprirebbe mai.
  if (richiesta.inviaSms && !smsConfigurata(configSms)) {
    return {
      ok: false,
      errore:
        "Configurazione SMS assente: imposta Client ID e password in Impostazioni, " +
        "oppure togli la spunta «Invia anche via SMS»",
    };
  }

  const notification = await archivio.createNotification({
    // Nessuna tratta in colonna: `segmentId` è una FK sulle tabelle legacy e le
    // tratte qui sono codici del mirror. La verità sta nello snapshot dei
    // destinatari, che le elenca tutte (stessa regola dell'invio multi-tratta).
    segmentId: undefined,
    tipo: richiesta.tipo,
    classificazione: richiesta.classificazione,
    legame: richiesta.legame,
    subject: richiesta.titolo,
    message: richiesta.messaggio,
    // Il testo SMS si registra ma non parte (issue #28): il canale non c'è
    // ancora. Vuoto diventa null — «mai avuto un testo SMS» non è «testo SMS
    // vuoto».
    messageSms: richiesta.messaggioSms || null,
    status: "sending",
    recipientCount: totaleDestinatari,
    emailCount: totaleDestinatari,
    smsCount: richiesta.inviaSms
      ? destinatari.filter((d) => (d.conduttore.cellulare ?? "").trim() !== "").length +
        utentiTest.filter((u) => (u.telefono ?? "").trim() !== "").length
      : 0,
    createdBy: opzioni.createdBy ?? null,
  });

  // I codici selezionati, che è quello da cui si ricava se una roggia risulta
  // aperta o chiusa (issue #22). Vanno scritti qui e non ricavati dagli
  // snapshot dei destinatari: una tratta chiusa a cui non è legato nessun
  // conduttore non comparirebbe in nessuna riga, ed è proprio una di quelle che
  // la Dashboard deve contare.
  //
  // È l'unico punto di scrittura: se fallisce, fallisce l'invio — non esiste
  // una comunicazione partita senza i suoi eventi.
  const target = await targetDellaSelezione(archivio, richiesta.tratte, richiesta.madri);
  await archivio.createNotificationTargets(notification.id, target);

  // Le righe destinatario nascono prima dell'invio, come nello scheduler: danno
  // l'id da mettere nel token del pixel, e tengono lo Storico popolato anche se
  // poi la spedizione fallisce.
  //
  // `userId` resta null: è una FK sui consorziati legacy, mentre un conduttore
  // del mirror ha per chiave `keykey`. L'identità sta nello snapshot, che è poi
  // l'unico posto dove i filtri dello Storico cercano (issue #12).
  const righe: InvioPreparato["righe"] = [];
  for (const d of destinatari) {
    const canale = canaleDi(d.conduttore.tipoEmail);
    const riga = await archivio.createNotificationRecipient({
      notificationId: notification.id,
      userId: null,
      keykey: d.conduttore.keykey,
      conduttoreDescrizione: d.conduttore.descrizione || null,
      keyroggia: codiciTratte(d.tratte),
      roggiaDescrizione: descrizioniTratte(d.tratte),
      email: d.conduttore.email,
      phone: d.conduttore.cellulare,
      // Con quale canale è partita, fotografato come il resto: `tipo_email`
      // nell'anagrafica cambia a ogni sync, e a distanza di mesi «questa è
      // andata per PEC?» deve avere una risposta.
      canale,
      emailStatus: "pending",
      smsStatus: "pending",
    });
    righe.push({
      id: riga.id,
      email: (d.conduttore.email ?? "").trim() || null,
      canale,
      telefono: (d.conduttore.cellulare ?? "").trim() || null,
    });
  }

  // Le righe degli utenti di test: stesso trattamento, un campo di differenza.
  // `keyroggia` porta i codici selezionati come per un conduttore, o una
  // comunicazione di sola prova comparirebbe nello Storico come «0 rogge» pur
  // avendo nominato una tratta.
  //
  // Con i codici vanno anche i loro nomi, gli stessi fotografati nei target:
  // senza, il dettaglio dello Storico mostrava «—» come descrizione di ogni
  // prova (issue #118).
  //
  // Una madre scelta per intero (i pozzi) entra con le sue tratte, non col suo
  // codice (issue #85): lo Storico conta e mostra le tratte, e chiudere un
  // pozzo da tre tratte deve risultare tre tratte chiuse, come in Dashboard.
  // Una madre senza tratte nel registro resta col suo codice: meglio quello
  // che nessuna riga.
  const tratteSelezionate = tratteDellaSelezione(
    target,
    richiesta.madri.length > 0 ? await archivio.getTratteDiMadri(richiesta.madri) : [],
  );
  const codiciSelezionati = tratteSelezionate.map((t) => t.keyroggia).join(SEPARATORE_TRATTE);
  const nomiSelezionati = descrizioniTratte(tratteSelezionate);
  for (const u of utentiTest) {
    const canale = canaleDi(u.tipoEmail);
    const riga = await archivio.createNotificationRecipient({
      notificationId: notification.id,
      userId: null,
      keykey: null,
      conduttoreDescrizione: u.nome,
      keyroggia: codiciSelezionati || null,
      roggiaDescrizione: nomiSelezionati,
      email: u.email,
      phone: u.telefono,
      canale,
      emailStatus: "pending",
      smsStatus: "pending",
      utenteTest: true,
    });
    righe.push({
      id: riga.id,
      email: (u.email ?? "").trim() || null,
      canale,
      telefono: (u.telefono ?? "").trim() || null,
    });
  }

  return {
    ok: true,
    preparato: {
      notificationId: notification.id,
      titolo: richiesta.titolo,
      messaggio: richiesta.messaggio,
      messaggioSms: richiesta.messaggioSms,
      inviaSms: richiesta.inviaSms,
      configSms,
      righe,
      config,
    },
    destinatari: totaleDestinatari,
  };
}

/**
 * Spedisce le mail di un invio già preparato.
 *
 * Vive separata dalla preparazione perché la rotta risponde appena la notifica e
 * i suoi destinatari sono in tabella, e poi lascia correre la spedizione. Con
 * Gmail una mail costa circa un secondo — su una madre da sessanta conduttori si
 * superano i sessanta secondi del proxy, il browser vede un timeout, l'operatore
 * conclude che non è partito niente e riprova: due comunicazioni identiche a
 * tutti. Lo Storico intanto è già popolato, quindi non si perde nulla per strada.
 */
export async function spedisciPreparato(
  preparato: InvioPreparato,
  deps: DepsInvio = {},
): Promise<{ inviate: number; fallite: number }> {
  const archivio = deps.archivio ?? storage;
  const appUrl = deps.appUrl ?? process.env.APP_URL ?? "";
  const adesso = deps.adesso ?? (() => new Date());
  const crea = deps.creaTrasporto ?? ((config: ConfigEmail) => createTransporter(config) as TrasportoEmail);
  const html = corpoHtml(preparato.messaggio);

  // Un trasporto per canale, aperto solo se quel canale serve davvero: con una
  // selezione di soli conduttori ordinari non si tocca la PEC, e viceversa.
  const trasporti = new Map<CanaleEmail, TrasportoEmail>();
  const trasportoDi = (canale: CanaleEmail): TrasportoEmail => {
    let t = trasporti.get(canale);
    if (!t) {
      t = crea(preparato.config[canale], canale);
      trasporti.set(canale, t);
    }
    return t;
  };

  // Senza APP_URL il pixel avrebbe un indirizzo relativo, che in una mail non
  // porta da nessuna parte: meglio nessun pixel e una riga di log che un
  // tracciamento che non registra niente e non lo dice a nessuno.
  if (!appUrl) {
    console.warn("APP_URL non impostata: le mail partono senza pixel di tracciamento delle aperture");
  }

  let inviate = 0;
  let fallite = 0;

  for (const { id, email, canale } of preparato.righe) {
    // Chi non ha un indirizzo resta nello Storico come non raggiunto: sparire in
    // silenzio farebbe credere che la comunicazione sia arrivata a tutti.
    if (!email) {
      await archivio.registraEsitoEmail(id, { status: "failed" });
      fallite++;
      continue;
    }

    const pixel = appUrl
      ? `<img src="${appUrl}/api/track/open/${tokenDestinatario(preparato.notificationId, id)}" width="1" height="1" style="display:none;" />`
      : "";

    try {
      // Il canale decide sia il mittente sia il server che consegna: una PEC
      // parte dalla PEC del consorzio, una mail ordinaria dalla casella
      // ordinaria.
      const info = await trasportoDi(canale).sendMail({
        from: mittenteDi(preparato.config[canale]),
        to: email,
        // Il titolo della comunicazione, e nient'altro: è la issue #23.
        subject: preparato.titolo,
        text: preparato.messaggio,
        html: html + pixel,
      });
      await archivio.registraEsitoEmail(id, {
        status: "sent",
        messageId: (info as { messageId?: string })?.messageId ?? null,
        sentAt: adesso(),
      });
      inviate++;
    } catch (e) {
      // Una mail rifiutata non ferma le altre: il destinatario successivo non
      // c'entra nulla con l'indirizzo sbagliato del precedente.
      console.error(`Errore invio email a ${email}:`, e);
      await archivio.registraEsitoEmail(id, { status: "failed" });
      fallite++;
    }
  }

  // Gli SMS partono dopo le mail e non le condizionano: il canale è un altro
  // fornitore, e un SMS rifiutato non deve rimettere in discussione una
  // comunicazione già consegnata per posta.
  if (preparato.inviaSms) {
    const spedisciSms = deps.inviaSmsFn ?? ((to, testo, config) => sendSMS(to, testo, config));
    for (const { id, telefono } of preparato.righe) {
      // Chi non ha numero resta nello Storico come non raggiunto, esattamente
      // come chi non ha indirizzo: sparire in silenzio farebbe credere che
      // l'SMS sia arrivato a tutti.
      if (!telefono) {
        await archivio.updateRecipientSmsStatus(id, "failed");
        continue;
      }
      try {
        const esito = await spedisciSms(telefono, preparato.messaggioSms, preparato.configSms);
        // Nessuna data: `smsDeliveredAt` vorrebbe dire «consegnato», e la
        // piattaforma dice solo di aver accettato il messaggio.
        await archivio.updateRecipientSmsStatus(id, esito.success ? "sent" : "failed");
      } catch (e) {
        console.error(`Errore invio SMS a ${telefono}:`, e);
        await archivio.updateRecipientSmsStatus(id, "failed");
      }
    }
  }

  await archivio.updateNotificationStatus(
    preparato.notificationId,
    inviate > 0 ? "sent" : "failed",
    inviate > 0 ? adesso() : undefined,
  );

  return { inviate, fallite };
}

/**
 * Prepara e spedisce, aspettando la fine.
 *
 * È il percorso completo, quello che i test esercitano. La rotta usa invece i
 * due passi separati, per non tenere aperta la richiesta HTTP finché l'ultima
 * mail non è partita.
 */
export async function inviaNotificaDaTratte(
  raw: Parameters<typeof preparaInvio>[0],
  opzioni: { createdBy?: string | null } = {},
  deps: DepsInvio = {},
): Promise<EsitoInvioNotifica> {
  const preparazione = await preparaInvio(raw, opzioni, deps);
  if (!preparazione.ok) return { ok: false, errore: preparazione.errore };

  const { inviate, fallite } = await spedisciPreparato(preparazione.preparato, deps);
  return {
    ok: true,
    notificationId: preparazione.preparato.notificationId,
    destinatari: preparazione.destinatari,
    inviate,
    fallite,
  };
}
