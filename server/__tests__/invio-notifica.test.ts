import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import {
  inviaNotificaDaTratte, preparaInvio, spedisciPreparato, corpoHtml, type ArchivioInvio,
} from "../invio-notifica";
import { leggiTokenTracking } from "../tracking-token";
import type { ConfigEmail } from "../config-notifiche";

/**
 * L'invio vero dalla pagina «Invia notifica» (issue #23).
 *
 * Il test che conta più di tutti è il primo: l'oggetto della mail è il titolo
 * scritto dall'operatore. È la domanda della issue, ed è rimasta senza risposta
 * per due versioni perché dalla pagina non partiva alcuna mail.
 */

const CONFIG_OK: ConfigEmail = {
  service: "gmail",
  user: "consorzio@example.it",
  password: "segreta",
  smtpHost: null,
  smtpPort: null,
  smtpSecure: false,
};

const CONFIG_PEC: ConfigEmail = {
  service: "smtp",
  user: "consorzio@pec.example.it",
  password: "segreta-pec",
  smtpHost: "smtps.pec.example.it",
  smtpPort: 465,
  smtpSecure: true,
};

const CONFIG_VUOTA: ConfigEmail = { ...CONFIG_OK, user: "", password: "" };

type MailInviata = { from: string; to: string; subject: string; text?: string; html: string };

function trasportoFinto(messageId = "id-mail") {
  const inviate: MailInviata[] = [];
  return {
    inviate,
    sendMail: async (opzioni: MailInviata) => {
      inviate.push(opzioni);
      return { messageId };
    },
  };
}

const RICHIESTA = {
  tratte: ["R01D01000"],
  destinatari: ["1"],
  titolo: "CBBG - Chiusura urgente Bolgare",
  messaggio: "Si comunica la chiusura immediata della tratta.",
  tipo: "chiusura",
  classificazione: "straordinaria",
  legame: "live",
};

describe("inviaNotificaDaTratte", () => {
  let s: MemStorage;

  const MADRI = [
    { codice: "R01", name: "R01 - Roggia bolgare", categoria: "rogge" as const, tipoIrrigazione: null, origine: "impianti" as const },
  ];
  const TRATTE = [
    { keyroggia: "R01D01000", name: "Bolgare capofonte", codiceMadre: "R01" },
    { keyroggia: "R01D02000", name: "Bolgare valle", codiceMadre: "R01" },
  ];

  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro({
      madri: MADRI,
      tratte: TRATTE,
      legami: [
        { keykey: "1", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "1", keyroggia: "R01D02000", metodo: "live" },
        { keykey: "2", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "3", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "4", keyroggia: "R01D01000", metodo: "live" },
      ],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Mario Rossi", email: "mario@e.it", cellulare: "3311234567", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
      { keykey: "2", descrizione: "Cessato Luigi", email: "luigi@e.it", cellulare: "3322345678", tipoEmail: "normale", flagAttivo: false, dataConsenso: null },
      { keykey: "3", descrizione: "Sara Verdi", email: "sara@e.it", cellulare: "0", tipoEmail: "pec", flagAttivo: true, dataConsenso: null },
      { keykey: "4", descrizione: "Senza Indirizzo", email: null, cellulare: "3344567890", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);
  });

  const invia = (richiesta: Record<string, unknown>, trasporto: any, createdBy = "mario.rossi") =>
    inviaNotificaDaTratte(richiesta, { createdBy }, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
      creaTrasporto: () => trasporto,
      appUrl: "https://notifiche.example.it",
    });

  // ── La issue #23 ───────────────────────────────────────────────────────────

  it("usa il titolo della comunicazione come oggetto della mail", async () => {
    const t = trasportoFinto();
    const esito = await invia(RICHIESTA, t);

    expect(esito.ok).toBe(true);
    expect(t.inviate).toHaveLength(1);
    expect(t.inviate[0].subject).toBe("CBBG - Chiusura urgente Bolgare");
    expect(t.inviate[0].to).toBe("mario@e.it");
  });

  it("salva lo stesso titolo su notifications.subject, che è ciò che legge lo Storico", async () => {
    const esito = await invia(RICHIESTA, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const notifica = await s.getNotificationById(esito.notificationId);
    expect(notifica?.subject).toBe("CBBG - Chiusura urgente Bolgare");
    expect(notifica?.message).toBe("Si comunica la chiusura immediata della tratta.");
    expect(notifica?.tipo).toBe("chiusura");
    expect(notifica?.classificazione).toBe("straordinaria");
    expect(notifica?.createdBy).toBe("mario.rossi");
    expect(notifica?.status).toBe("sent");
    expect(notifica?.sentAt).toBeInstanceOf(Date);
  });

  // ── Il testo SMS (issue #28) ───────────────────────────────────────────────

  it("salva il testo SMS su notifications.messageSms", async () => {
    const esito = await invia({ ...RICHIESTA, messaggioSms: "Roggia chiusa dal 20/08." }, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const notifica = await s.getNotificationById(esito.notificationId);
    expect(notifica?.messageSms).toBe("Roggia chiusa dal 20/08.");
    // Il testo della mail resta il suo: due testi, due colonne.
    expect(notifica?.message).toBe("Si comunica la chiusura immediata della tratta.");
  });

  // Null e non stringa vuota: «questa comunicazione non ha mai avuto un testo
  // SMS» è un fatto diverso da «il testo SMS era vuoto».
  it("lascia messageSms a null quando il riquadro SMS è vuoto", async () => {
    const esito = await invia(RICHIESTA, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const notifica = await s.getNotificationById(esito.notificationId);
    expect(notifica?.messageSms).toBeNull();
  });

  // Con la spunta spenta nessun SMS parte, e il testo SMS non deve comunque
  // finire nella mail: sarebbe una comunicazione con dentro due volte lo stesso
  // avviso.
  it("non mette il testo SMS né nell'oggetto né nel corpo della mail", async () => {
    const t = trasportoFinto();
    await invia({ ...RICHIESTA, messaggioSms: "Roggia chiusa dal 20/08." }, t);

    expect(t.inviate).toHaveLength(1);
    expect(t.inviate[0].subject).not.toContain("20/08");
    expect(t.inviate[0].html).not.toContain("20/08");
    expect(t.inviate[0].text).not.toContain("20/08");
  });

  // ── L'invio SMS (Register.it) ──────────────────────────────────────────────

  // Stessa regola della PEC mancante: si rifiuta tutto prima di scrivere, che
  // una notifica in tabella senza niente di partito e' una riga di Storico che
  // racconta un invio mai avvenuto.
  it("rifiuta l'invio se l'SMS e' richiesto e le credenziali mancano", async () => {
    const esito = await inviaNotificaDaTratte(
      { ...RICHIESTA, inviaSms: true, messaggioSms: "Roggia chiusa." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "", password: "" },
        creaTrasporto: () => trasportoFinto(),
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toMatch(/SMS/);
  });

  it("conta su smsCount i soli destinatari raggiungibili per SMS", async () => {
    // Fra i selezionati, Mario ha un numero e Sara ha lo "0" del web service,
    // che `getDestinatariPerTratte` ha gia' ridotto a niente.
    const esito = await inviaNotificaDaTratte(
      { ...RICHIESTA, destinatari: ["1", "3"], inviaSms: true, messaggioSms: "Roggia chiusa." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "cbbg", password: "segreta" },
        creaTrasporto: () => trasportoFinto(),
        inviaSmsFn: async () => ({ success: true }),
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const notifica = await s.getNotificationById(esito.notificationId);
    expect(notifica?.recipientCount).toBe(2);
    expect(notifica?.smsCount).toBe(1);
  });

  it("spedisce un SMS a chi ha un numero e registra l'esito", async () => {
    const inviati: { to: string; testo: string }[] = [];
    const esito = await inviaNotificaDaTratte(
      { ...RICHIESTA, destinatari: ["1", "3"], inviaSms: true, messaggioSms: "Roggia chiusa dal 20/08." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "cbbg", password: "segreta" },
        creaTrasporto: () => trasportoFinto(),
        inviaSmsFn: async (to, testo) => { inviati.push({ to, testo }); return { success: true }; },
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(esito.ok).toBe(true);
    // Solo Mario: Sara ha lo "0" del web service, cioe' nessun numero.
    expect(inviati).toEqual([{ to: "3311234567", testo: "Roggia chiusa dal 20/08." }]);
  });

  it("non spedisce nessun SMS se la spunta e' spenta", async () => {
    const inviati: string[] = [];
    await inviaNotificaDaTratte(
      { ...RICHIESTA, messaggioSms: "Roggia chiusa." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "cbbg", password: "segreta" },
        creaTrasporto: () => trasportoFinto(),
        inviaSmsFn: async (to) => { inviati.push(to); return { success: true }; },
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(inviati).toEqual([]);
  });

  // Un SMS rifiutato non ferma i successivi, come per le mail.
  it("registra come fallito l'SMS rifiutato dalla piattaforma", async () => {
    const esito = await inviaNotificaDaTratte(
      { ...RICHIESTA, inviaSms: true, messaggioSms: "Roggia chiusa." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "cbbg", password: "segreta" },
        creaTrasporto: () => trasportoFinto(),
        inviaSmsFn: async () => ({ success: false, error: "credito esaurito" }),
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe.every((r) => r.smsStatus === "failed")).toBe(true);
  });

  // ── Gli utenti di test (issue #36) ─────────────────────────────────────────

  it("manda la comunicazione anche agli utenti di test attivi, e non a quelli spenti", async () => {
    await s.createUtenteTest({ nome: "Francesco", email: "collaudo@consorzio.it", tipoEmail: "normale", telefono: null, attivo: true, createdBy: null });
    await s.createUtenteTest({ nome: "Spento", email: "spento@consorzio.it", tipoEmail: "normale", telefono: null, attivo: false, createdBy: null });

    const t = trasportoFinto();
    const esito = await invia(RICHIESTA, t);

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    // Mario piu' Francesco: lo spento non compare.
    expect(t.inviate.map((m) => m.to).sort()).toEqual(["collaudo@consorzio.it", "mario@e.it"]);
    expect(esito.destinatari).toBe(2);
  });

  it("marca il destinatario di test e gli mette in snapshot le tratte selezionate", async () => {
    await s.createUtenteTest({ nome: "Francesco", email: "collaudo@consorzio.it", tipoEmail: "normale", telefono: null, attivo: true, createdBy: null });

    const esito = await invia(RICHIESTA, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    const test = righe.filter((r) => r.utenteTest);
    expect(test).toHaveLength(1);
    expect(test[0].conduttoreDescrizione).toBe("Francesco");
    // Senza le tratte in snapshot, una prova comparirebbe nello Storico come
    // «0 rogge» pur avendo nominato una tratta.
    expect(test[0].keyroggia).toBe("R01D01000");
    // Non e' un conduttore: non ha un codice del mirror.
    expect(test[0].keykey).toBeNull();
    // Gli altri restano conduttori veri.
    expect(righe.filter((r) => !r.utenteTest)).toHaveLength(1);
  });

  // Issue #118: col solo codice, il dettaglio dello Storico mostrava «—» nella
  // colonna Descrizione Roggia di ogni prova.
  it("mette in snapshot anche i nomi dei codici selezionati, madri comprese", async () => {
    await s.createUtenteTest({ nome: "Francesco", email: "collaudo@consorzio.it", tipoEmail: "normale", telefono: null, attivo: true, createdBy: null });

    const esito = await invia({ ...RICHIESTA, tratte: ["R01D02000"], madri: ["R01"], destinatari: [] }, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const [test] = (await s.getRecipientsByNotificationId(esito.notificationId)).filter((r) => r.utenteTest);
    expect(test.keyroggia).toBe("R01D02000, R01");
    expect(test.roggiaDescrizione).toBe("Bolgare valle, R01 - Roggia bolgare");
  });

  // Il caso della issue: l'operatore toglie la spunta a tutti e collauda.
  it("parte anche senza nessun conduttore selezionato, se c'e' un utente di test attivo", async () => {
    await s.createUtenteTest({ nome: "Francesco", email: "collaudo@consorzio.it", tipoEmail: "normale", telefono: null, attivo: true, createdBy: null });

    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, destinatari: [] }, t);

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(t.inviate.map((m) => m.to)).toEqual(["collaudo@consorzio.it"]);
    // I target si scrivono lo stesso: una prova chiude la roggia come un invio
    // vero, ed e' una scelta — si ripulisce dalla scheda Utenti di test.
    // `getEventiStato()` li legge gia' filtrati per apertura/chiusura, ed e' la
    // stessa lettura che alimenta la Dashboard.
    const eventi = await s.getEventiStato();
    expect(eventi.filter((e) => e.notificaId === esito.notificationId)).toHaveLength(1);
  });

  it("rifiuta l'invio senza conduttori quando non c'e' nessun utente di test attivo", async () => {
    const esito = await invia({ ...RICHIESTA, destinatari: [] }, trasportoFinto());
    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toMatch(/destinatari/i);
  });

  // Un utente di test PEC senza credenziali PEC ferma tutto, come un conduttore
  // PEC: e' precisamente la cosa che il collaudo sta verificando.
  it("rifiuta l'invio se un utente di test e' PEC e la PEC non e' configurata", async () => {
    await s.createUtenteTest({ nome: "Francesco", email: "collaudo@pec.consorzio.it", tipoEmail: "pec", telefono: null, attivo: true, createdBy: null });

    const esito = await inviaNotificaDaTratte(RICHIESTA, { createdBy: "mario.rossi" }, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_VUOTA },
      creaTrasporto: () => trasportoFinto(),
      appUrl: "https://notifiche.example.it",
    });

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toMatch(/PEC/);
    // Nessuna scrittura: il rifiuto vale per l'intero invio, Mario compreso.
    expect(await s.getEventiStato()).toEqual([]);
  });

  it("manda l'SMS anche agli utenti di test che hanno un numero", async () => {
    await s.createUtenteTest({ nome: "Francesco", email: "collaudo@consorzio.it", tipoEmail: "normale", telefono: "3399999999", attivo: true, createdBy: null });

    const inviati: string[] = [];
    const esito = await inviaNotificaDaTratte(
      { ...RICHIESTA, inviaSms: true, messaggioSms: "Roggia chiusa." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "cbbg", password: "segreta" },
        creaTrasporto: () => trasportoFinto(),
        inviaSmsFn: async (to) => { inviati.push(to); return { success: true }; },
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(esito.ok).toBe(true);
    expect(inviati.sort()).toEqual(["3311234567", "3399999999"]);
  });

  // Un utente di test col solo telefono non e' raggiungibile da un invio senza
  // SMS: senza questo controllo la comunicazione partirebbe verso nessuno,
  // lasciando una riga di Storico e una roggia chiusa in Dashboard.
  it("non parte se l'unico utente di test attivo ha il solo telefono e l'SMS e' spento", async () => {
    await s.createUtenteTest({ nome: "Solo SMS", email: null, tipoEmail: "normale", telefono: "3399999999", attivo: true, createdBy: null });

    const esito = await invia({ ...RICHIESTA, destinatari: [] }, trasportoFinto());

    expect(esito.ok).toBe(false);
    // E soprattutto: niente in tabella.
    expect(await s.getEventiStato()).toEqual([]);
  });

  it("parte verso lo stesso utente quando la spunta SMS e' accesa", async () => {
    await s.createUtenteTest({ nome: "Solo SMS", email: null, tipoEmail: "normale", telefono: "3399999999", attivo: true, createdBy: null });

    const inviati: string[] = [];
    const esito = await inviaNotificaDaTratte(
      { ...RICHIESTA, destinatari: [], inviaSms: true, messaggioSms: "Roggia chiusa." },
      { createdBy: "mario.rossi" },
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_PEC },
        configSms: { clientid: "cbbg", password: "segreta" },
        creaTrasporto: () => trasportoFinto(),
        inviaSmsFn: async (to) => { inviati.push(to); return { success: true }; },
        appUrl: "https://notifiche.example.it",
      },
    );

    expect(esito.ok).toBe(true);
    expect(inviati).toEqual(["3399999999"]);
  });

  // ── Chi riceve, e quante volte ─────────────────────────────────────────────

  it("manda una sola mail al conduttore raggiunto da più tratte selezionate", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, tratte: ["R01D01000", "R01D02000"] }, t);
    if (!esito.ok) throw new Error(esito.errore);

    expect(t.inviate).toHaveLength(1);
    expect(esito.destinatari).toBe(1);

    // ...e lo snapshot elenca entrambe le tratte (issue #5).
    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe).toHaveLength(1);
    expect(righe[0].keyroggia).toBe("R01D01000, R01D02000");
    expect(righe[0].roggiaDescrizione).toBe("Bolgare capofonte, Bolgare valle");
  });

  // I pozzi si scelgono per madre (issue #26): la richiesta arriva senza tratte
  // e la comunicazione deve partire lo stesso, ai conduttori di tutti i figli.
  it("spedisce anche quando la selezione è una madre intera e non una tratta", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, tratte: [], madri: ["R01"] }, t);
    if (!esito.ok) throw new Error(esito.errore);

    expect(t.inviate.map((m) => m.to)).toEqual(["mario@e.it"]);
    // Lo snapshot porta i codici veri dei figli, non il codice della madre: fra
    // sei mesi lo Storico deve dire su quali tratte è passata la comunicazione.
    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe[0].keyroggia).toBe("R01D01000, R01D02000");
  });

  it("una madre e una sua tratta scelte insieme non raddoppiano la mail", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, tratte: ["R01D01000"], madri: ["R01"] }, t);
    if (!esito.ok) throw new Error(esito.errore);

    expect(t.inviate).toHaveLength(1);
    expect(esito.destinatari).toBe(1);
    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe).toHaveLength(1);
    expect(righe[0].keyroggia).toBe("R01D01000, R01D02000");
  });

  it("scrive solo ai conduttori selezionati: chi è stato tolto con la spunta non riceve", async () => {
    const t = trasportoFinto();
    await invia({ ...RICHIESTA, destinatari: ["3"] }, t);

    expect(t.inviate.map((m) => m.to)).toEqual(["sara@e.it"]);
  });

  // Il collaudo l'ha chiesto per iscritto (issue #14). La regola vive in
  // `getDestinatariPerTratte`, ma qui si difende fino alla `sendMail`: è il
  // punto in cui un errore diventa una mail davvero partita.
  it("non scrive a un conduttore cessato nemmeno se il browser lo chiede", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, destinatari: ["1", "2"] }, t);
    if (!esito.ok) throw new Error(esito.errore);

    expect(t.inviate.map((m) => m.to)).toEqual(["mario@e.it"]);
    expect(esito.destinatari).toBe(1);
  });

  it("rifiuta l'invio se nessuno dei selezionati è più un destinatario valido", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, destinatari: ["2"] }, t);

    expect(esito).toEqual({ ok: false, errore: "Nessun destinatario trovato fra quelli selezionati" });
    expect(t.inviate).toHaveLength(0);
    expect(await s.getAllNotifications()).toHaveLength(0);
  });

  // ── Lo snapshot che alimenta lo Storico ────────────────────────────────────

  it("fotografa codice e descrizione del conduttore, che è dove cercano i filtri dello Storico", async () => {
    const esito = await invia(RICHIESTA, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const [riga] = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(riga.keykey).toBe("1");
    expect(riga.conduttoreDescrizione).toBe("Mario Rossi");
    expect(riga.email).toBe("mario@e.it");
    expect(riga.phone).toBe("3311234567");
    expect(riga.emailStatus).toBe("sent");
    expect(riga.emailMessageId).toBe("id-mail");
    expect(riga.sentAt).toBeInstanceOf(Date);
    // `userId` è una FK sui consorziati legacy: un conduttore del mirror non ne
    // ha uno, e la riga deve esistere lo stesso.
    expect(riga.userId).toBeNull();
  });

  it("porta la notifica nello Storico con destinatari e tratte", async () => {
    const esito = await invia({ ...RICHIESTA, destinatari: ["1", "3"] }, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const storico = await s.getNotificationHistory({});
    expect(storico).toHaveLength(1);
    expect(storico[0].numDestinatari).toBe(2);
    expect(storico[0].numRogge).toBe(1);
    expect(storico[0].subject).toBe("CBBG - Chiusura urgente Bolgare");
  });

  // ── Guasti ─────────────────────────────────────────────────────────────────

  it("un indirizzo che rifiuta non ferma gli altri e resta segnato come fallito", async () => {
    const inviate: MailInviata[] = [];
    const trasporto = {
      sendMail: async (m: MailInviata) => {
        if (m.to === "mario@e.it") throw new Error("mailbox unavailable");
        inviate.push(m);
        return { messageId: "ok" };
      },
    };

    const esito = await invia({ ...RICHIESTA, destinatari: ["1", "3"] }, trasporto);
    if (!esito.ok) throw new Error(esito.errore);

    expect(esito.inviate).toBe(1);
    expect(esito.fallite).toBe(1);
    expect(inviate.map((m) => m.to)).toEqual(["sara@e.it"]);

    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe.find((r) => r.keykey === "1")?.emailStatus).toBe("failed");
    expect(righe.find((r) => r.keykey === "3")?.emailStatus).toBe("sent");
  });

  it("segna la notifica come fallita se non è partita nemmeno una mail", async () => {
    const trasporto = { sendMail: async () => { throw new Error("smtp down"); } };
    const esito = await invia(RICHIESTA, trasporto);
    if (!esito.ok) throw new Error(esito.errore);

    expect(esito.inviate).toBe(0);
    const notifica = await s.getNotificationById(esito.notificationId);
    expect(notifica?.status).toBe("failed");
    expect(notifica?.sentAt).toBeNull();
  });

  // Chi non ha indirizzo compare comunque nello Storico: sparire in silenzio
  // farebbe credere che la comunicazione sia arrivata a tutti.
  it("registra come non raggiunto il conduttore senza email, senza tentare l'invio", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, destinatari: ["1", "4"] }, t);
    if (!esito.ok) throw new Error(esito.errore);

    expect(t.inviate.map((m) => m.to)).toEqual(["mario@e.it"]);
    expect(esito.fallite).toBe(1);

    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe.find((r) => r.keykey === "4")?.emailStatus).toBe("failed");
  });

  it("non scrive nulla se l'email non è configurata", async () => {
    const t = trasportoFinto();
    const esito = await inviaNotificaDaTratte(RICHIESTA, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_VUOTA, pec: CONFIG_PEC },
      creaTrasporto: () => t,
    });

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toContain("Configurazione Email assente");
    expect(t.inviate).toHaveLength(0);
    expect(await s.getAllNotifications()).toHaveLength(0);
  });

  it("non scrive nulla se la richiesta è incompleta", async () => {
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, titolo: "  " }, t);

    expect(esito.ok).toBe(false);
    expect(t.inviate).toHaveLength(0);
    expect(await s.getAllNotifications()).toHaveLength(0);
  });

  // ── I due canali: posta ordinaria e PEC ────────────────────────────────────

  /**
   * L'anagrafica distingue i conduttori con `tipo_email`, e fra gli attivi 1479
   * su 3254 hanno un indirizzo PEC. Una PEC spedita da una casella ordinaria non
   * ha ricevuta di accettazione né di consegna: per il consorzio è una
   * comunicazione che crede fatta e che invece non vale.
   */
  it("manda ogni destinatario dalla casella del suo canale", async () => {
    const perCanale = new Map<string, ReturnType<typeof trasportoFinto>>();
    const esito = await inviaNotificaDaTratte({ ...RICHIESTA, destinatari: ["1", "3"] }, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
      creaTrasporto: (_config, canale) => {
        const t = trasportoFinto();
        perCanale.set(canale, t);
        return t;
      },
      appUrl: "https://notifiche.example.it",
    });
    if (!esito.ok) throw new Error(esito.errore);

    // Mario è "normale", Sara è "pec": due trasporti, un destinatario ciascuno.
    expect(perCanale.get("normale")?.inviate.map((m) => m.to)).toEqual(["mario@e.it"]);
    expect(perCanale.get("pec")?.inviate.map((m) => m.to)).toEqual(["sara@e.it"]);
    // ...e ognuno con il proprio mittente.
    expect(perCanale.get("normale")?.inviate[0].from).toBe("consorzio@example.it");
    expect(perCanale.get("pec")?.inviate[0].from).toBe("consorzio@pec.example.it");
    expect(esito.inviate).toBe(2);
  });

  it("non apre il trasporto di un canale che questa selezione non usa", async () => {
    const canaliAperti: string[] = [];
    await inviaNotificaDaTratte({ ...RICHIESTA, destinatari: ["1"] }, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
      creaTrasporto: (_config, canale) => {
        canaliAperti.push(canale);
        return trasportoFinto();
      },
    });

    expect(canaliAperti).toEqual(["normale"]);
  });

  it("scrive sul destinatario con quale canale è partita", async () => {
    const esito = await invia({ ...RICHIESTA, destinatari: ["1", "3"] }, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const righe = await s.getRecipientsByNotificationId(esito.notificationId);
    expect(righe.find((r) => r.keykey === "1")?.canale).toBe("normale");
    expect(righe.find((r) => r.keykey === "3")?.canale).toBe("pec");
  });

  // Senza credenziali PEC non si ripiega sulla posta ordinaria: si rifiuta tutto
  // l'invio, prima di scrivere qualunque cosa. Un ripiego silenzioso
  // spedirebbe a metà dei conduttori una comunicazione senza valore legale.
  it("rifiuta l'invio se servirebbe la PEC e la PEC non è configurata", async () => {
    const t = trasportoFinto();
    const esito = await inviaNotificaDaTratte({ ...RICHIESTA, destinatari: ["1", "3"] }, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_VUOTA },
      creaTrasporto: () => t,
    });

    expect(esito.ok).toBe(false);
    if (esito.ok) return;
    expect(esito.errore).toContain("Configurazione PEC assente");
    // Il messaggio dice quanti sono, così si capisce se vale la pena togliere la
    // spunta a quei destinatari o configurare la PEC.
    expect(esito.errore).toContain("1 destinatari su 2");
    expect(t.inviate).toHaveLength(0);
    expect(await s.getAllNotifications()).toHaveLength(0);
  });

  it("non pretende la PEC se nessuno dei selezionati ne ha una", async () => {
    const t = trasportoFinto();
    const esito = await inviaNotificaDaTratte({ ...RICHIESTA, destinatari: ["1"] }, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_VUOTA },
      creaTrasporto: () => t,
    });

    expect(esito.ok).toBe(true);
    expect(t.inviate.map((m) => m.to)).toEqual(["mario@e.it"]);
  });

  // Chi non ha indirizzo non ha canale da configurare: pretendere le credenziali
  // per lui bloccherebbe un invio che a lui non manderebbe niente comunque.
  it("non conta i destinatari senza indirizzo quando verifica le credenziali", async () => {
    const t = trasportoFinto();
    const esito = await inviaNotificaDaTratte({ ...RICHIESTA, destinatari: ["3", "4"] }, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_VUOTA, pec: CONFIG_PEC },
      creaTrasporto: () => t,
    });

    expect(esito.ok).toBe(true);
    expect(t.inviate.map((m) => m.to)).toEqual(["sara@e.it"]);
  });

  // ── Corpo della mail ───────────────────────────────────────────────────────

  it("mette nel pixel il token della riga destinatario, non uno userId che non esiste", async () => {
    const t = trasportoFinto();
    const esito = await invia(RICHIESTA, t);
    if (!esito.ok) throw new Error(esito.errore);

    const [riga] = await s.getRecipientsByNotificationId(esito.notificationId);
    const token = t.inviate[0].html.match(/track\/open\/([^"]+)/)?.[1];
    expect(leggiTokenTracking(token)).toEqual({
      notificationId: esito.notificationId,
      recipientId: riga.id,
    });
  });

  it("manda anche la versione testuale del messaggio", async () => {
    const t = trasportoFinto();
    await invia(RICHIESTA, t);
    expect(t.inviate[0].text).toBe("Si comunica la chiusura immediata della tratta.");
  });

  // In produzione APP_URL non è (ancora) impostata: senza di essa il pixel
  // avrebbe un indirizzo relativo, che dentro una mail non porta da nessuna
  // parte. Meglio nessun pixel che un pixel che non traccia e non lo dice.
  it("senza APP_URL spedisce lo stesso, ma senza pixel", async () => {
    const t = trasportoFinto();
    const esito = await inviaNotificaDaTratte(RICHIESTA, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
      creaTrasporto: () => t,
      appUrl: "",
    });

    expect(esito.ok).toBe(true);
    expect(t.inviate).toHaveLength(1);
    expect(t.inviate[0].html).not.toContain("track/open");
  });

  it("registra come autore la sessione, e nessuno se non c'è", async () => {
    const esito = await inviaNotificaDaTratte(RICHIESTA, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
      creaTrasporto: () => trasportoFinto(),
      appUrl: "https://notifiche.example.it",
    });
    if (!esito.ok) throw new Error(esito.errore);

    expect((await s.getNotificationById(esito.notificationId))?.createdBy).toBeNull();
  });

  // ── La issue #27: uno dei due legami, non l'unione ─────────────────────────

  it("scrive sulla notifica il legame con cui è stata risolta", async () => {
    await s.replaceRegistro({ madri: MADRI, tratte: TRATTE, legami: [
      { keykey: "1", keyroggia: "R01D01000", metodo: "stagione" },
    ] });
    const esito = await invia({ ...RICHIESTA, legame: "stagione" }, trasportoFinto());
    if (!esito.ok) throw new Error(esito.errore);

    const notifica = await s.getNotificationById(esito.notificationId);
    expect(notifica?.legame).toBe("stagione");
  });

  it("raggiunge chi sta nell'elenco scelto e non chi sta nell'altro", async () => {
    // "1" è legato alla tratta solo in live, "3" solo in stagione: prima della
    // issue #27 un invio li avrebbe presi entrambi, senza che nessuno avesse
    // scelto.
    await s.replaceRegistro({ madri: MADRI, tratte: TRATTE, legami: [
      { keykey: "1", keyroggia: "R01D01000", metodo: "live" },
      { keykey: "3", keyroggia: "R01D01000", metodo: "stagione" },
    ] });
    const t = trasportoFinto();
    const esito = await invia({ ...RICHIESTA, destinatari: ["1", "3"], legame: "stagione" }, t);
    if (!esito.ok) throw new Error(esito.errore);

    expect(esito.destinatari).toBe(1);
    expect(t.inviate.map((m: { to: string }) => m.to)).toEqual(["sara@e.it"]);
  });

  it("con il legame sbagliato non trova nessuno, e non scrive nulla", async () => {
    await s.replaceRegistro({ madri: MADRI, tratte: TRATTE, legami: [
      { keykey: "1", keyroggia: "R01D01000", metodo: "stagione" },
    ] });
    const esito = await invia({ ...RICHIESTA, legame: "live" }, trasportoFinto());

    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toMatch(/Nessun destinatario/);
  });

  it("rifiuta una richiesta senza legame", async () => {
    const { legame, ...senza } = RICHIESTA;
    const esito = await invia(senza, trasportoFinto());

    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.errore).toMatch(/legame/i);
  });
});

/**
 * La rotta risponde appena la preparazione è finita e lascia correre la
 * spedizione: con Gmail una mail costa circa un secondo, e su una selezione
 * ampia il proxy chiuderebbe la connessione prima dell'ultima. Chi vedesse un
 * timeout riproverebbe, e la stessa comunicazione partirebbe due volte.
 */
describe("preparaInvio", () => {
  let s: MemStorage;

  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro({
      madri: [{ codice: "R01", name: "R01 - Roggia bolgare", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" }],
      tratte: [{ keyroggia: "R01D01000", name: "Bolgare capofonte", codiceMadre: "R01" }],
      legami: [{ keykey: "1", keyroggia: "R01D01000", metodo: "live" }],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Mario Rossi", email: "mario@e.it", cellulare: "3311234567", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);
  });

  it("registra notifica e destinatari senza spedire nulla", async () => {
    const t = trasportoFinto();
    const esito = await preparaInvio(RICHIESTA, { createdBy: "sara.verdi" }, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
      creaTrasporto: () => t,
    });

    expect(esito.ok).toBe(true);
    if (!esito.ok) return;
    expect(t.inviate).toHaveLength(0);
    expect(esito.destinatari).toBe(1);

    const notifica = await s.getNotificationById(esito.preparato.notificationId);
    expect(notifica?.status).toBe("sending");
    expect(notifica?.subject).toBe("CBBG - Chiusura urgente Bolgare");

    const righe = await s.getRecipientsByNotificationId(esito.preparato.notificationId);
    expect(righe.map((r) => r.emailStatus)).toEqual(["pending"]);
    expect(esito.preparato.righe).toEqual([
      { id: righe[0].id, email: "mario@e.it", canale: "normale", telefono: "3311234567" },
    ]);
  });

  it("chiude l'invio quando la spedizione arriva in fondo", async () => {
    const preparazione = await preparaInvio(RICHIESTA, {}, {
      archivio: s as unknown as ArchivioInvio,
      config: { normale: CONFIG_OK, pec: CONFIG_PEC },
    });
    if (!preparazione.ok) throw new Error(preparazione.errore);

    const t = trasportoFinto();
    const conteggi = await spedisciPreparato(preparazione.preparato, {
      archivio: s as unknown as ArchivioInvio,
      creaTrasporto: () => t,
      appUrl: "https://notifiche.example.it",
    });

    expect(conteggi).toEqual({ inviate: 1, fallite: 0 });
    expect((await s.getNotificationById(preparazione.preparato.notificationId))?.status).toBe("sent");
  });
});

describe("registrazione dei codici selezionati (issue #22)", () => {
  let s: MemStorage;

  const MADRI = [
    { codice: "R01", name: "R01 - Roggia bolgare", categoria: "rogge" as const, tipoIrrigazione: null, origine: "impianti" as const },
    { codice: "R10", name: "R10 - Pozzo bresciana", categoria: "pozzi" as const, tipoIrrigazione: null, origine: "impianti" as const },
  ];
  const TRATTE = [
    { keyroggia: "R01D01000", name: "Bolgare capofonte", codiceMadre: "R01" },
    { keyroggia: "R01D02000", name: "Bolgare valle", codiceMadre: "R01" },
    // Un pozzo senza figlia mirrorata non esiste più nel modello a registro: il
    // sync garantisce che ogni legame abbia la sua tratta, sintetizzandola.
    { keyroggia: "R10DA0001", name: "Pozzo bresciana - consegna 1", codiceMadre: "R10" },
  ];

  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro({
      madri: MADRI,
      tratte: TRATTE,
      legami: [
        { keykey: "1", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "1", keyroggia: "R10DA0001", metodo: "live" },
      ],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Mario Rossi", email: "m@e.it", cellulare: "3311234567", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);
  });

  const base = {
    destinatari: ["1"],
    titolo: "CBBG - Chiusura",
    messaggio: "Testo",
    tipo: "chiusura",
    classificazione: "ordinaria",
    legame: "live",
  };

  it("scrive un target per ogni tratta spuntata, col nome del mirror", async () => {
    const esito = await preparaInvio(
      { ...base, tratte: ["R01D01000"], madri: [] },
      {},
      { archivio: s as unknown as ArchivioInvio, config: { normale: CONFIG_OK, pec: CONFIG_PEC } },
    );
    expect(esito.ok).toBe(true);
    const eventi = await s.getEventiStato();
    expect(eventi.map((e) => [e.codice, e.livello, e.descrizione])).toEqual([
      ["R01D01000", "tratta", "Bolgare capofonte"],
    ]);
  });

  it("la madre di una tratta si legge dal registro, non dal prefisso (issue #14)", async () => {
    // R34D02S01 appartiene all'impianto IM44A (stesso caso di
    // sync-all.test.ts): il prefisso "R34" non è la madre vera. Se
    // targetDellaSelezione tornasse a derivarla col prefisso invece di
    // usare getMappaMadri, getTratteDiMadri("R34") non troverebbe questa
    // tratta e la descrizione fotografata sarebbe null — esattamente il
    // bug che il fix del Task 10 chiude. Nessuna fixture di questo file usa
    // altrove una madre disallineata dal prefisso: senza questo test la
    // regressione non sarebbe presa da nessun altro caso.
    await s.replaceRegistro({
      madri: [
        ...MADRI,
        { codice: "IM44A", name: "IM44A - Trenzano", categoria: "impianti" as const, tipoIrrigazione: null, origine: "impianti" as const },
      ],
      tratte: [...TRATTE, { keyroggia: "R34D02S01", name: "R.Trenzano I", codiceMadre: "IM44A" }],
      legami: [{ keykey: "1", keyroggia: "R34D02S01", metodo: "live" }],
    });
    const esito = await preparaInvio(
      { ...base, tratte: ["R34D02S01"], madri: [] },
      {},
      { archivio: s as unknown as ArchivioInvio, config: { normale: CONFIG_OK, pec: CONFIG_PEC } },
    );
    expect(esito.ok).toBe(true);
    const eventi = await s.getEventiStato();
    expect(eventi.map((e) => [e.codice, e.descrizione])).toEqual([["R34D02S01", "R.Trenzano I"]]);
  });

  it("scrive il codice madre per i pozzi, che le tratte non le hanno (issue #26)", async () => {
    const esito = await preparaInvio(
      { ...base, tratte: [], madri: ["R10"] },
      {},
      { archivio: s as unknown as ArchivioInvio, config: { normale: CONFIG_OK, pec: CONFIG_PEC } },
    );
    expect(esito.ok).toBe(true);
    const eventi = await s.getEventiStato();
    expect(eventi.map((e) => [e.codice, e.livello, e.descrizione])).toEqual([
      ["R10", "madre", "R10 - Pozzo bresciana"],
    ]);
  });

  it("una tratta non più nel mirror finisce comunque in tabella, senza nome", async () => {
    // R01D09000 non ha una tratta nel registro: il legame resta risolvibile
    // per esatto (issue #26), ma senza nome da mostrare.
    await s.replaceRegistro({ madri: MADRI, tratte: TRATTE, legami: [
      { keykey: "1", keyroggia: "R01D09000", metodo: "live" },
    ] });
    const esito = await preparaInvio(
      { ...base, tratte: ["R01D09000"], madri: [] },
      {},
      { archivio: s as unknown as ArchivioInvio, config: { normale: CONFIG_OK, pec: CONFIG_PEC } },
    );
    expect(esito.ok).toBe(true);
    const eventi = await s.getEventiStato();
    expect(eventi.map((e) => [e.codice, e.descrizione])).toEqual([["R01D09000", null]]);
  });

  it("una comunicazione rifiutata non lascia eventi", async () => {
    const esito = await preparaInvio(
      { ...base, tratte: ["R01D01000"], madri: [], destinatari: ["999"] },
      {},
      { archivio: s as unknown as ArchivioInvio, config: { normale: CONFIG_OK, pec: CONFIG_PEC } },
    );
    expect(esito.ok).toBe(false);
    expect(await s.getEventiStato()).toEqual([]);
  });

  it("fotografa il nome anche per un codice che sta solo nella gerarchia R", async () => {
    // Una figlia che nessun impianto rivendica non è in `tratte`: senza il
    // ripiego, il target finirebbe con descrizione null e fra sei mesi lo
    // Storico direbbe soltanto «R02D10+++».
    const s = new MemStorage();
    await s.replaceGerarchiaRogge({
      madri: [{ codice: "R02", name: "R02 - Roggia borgogna" }],
      tratte: [{ keyroggia: "R02D10+++", name: "Fosso Calcinate", codiceMadre: "R02" }],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Rossi", email: "r@e.it", cellulare: "333", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
    ]);

    await s.replaceRegistro({ madri: [], tratte: [], legami: [
      { keykey: "1", keyroggia: "R02D10+++", metodo: "live" },
    ] });

    const trasporto = trasportoFinto();
    const esito = await preparaInvio(
      { ...RICHIESTA, tratte: ["R02D10+++"] },
      {},
      {
        archivio: s as unknown as ArchivioInvio,
        config: { normale: CONFIG_OK, pec: CONFIG_OK },
        creaTrasporto: () => trasporto,
      },
    );

    expect(esito.ok).toBe(true);
    const eventi = await s.getEventiStato();
    expect(eventi.find((e) => e.codice === "R02D10+++")!.descrizione).toBe("Fosso Calcinate");
  });
});

describe("corpoHtml", () => {
  it("tiene gli a capo scritti dall'operatore", () => {
    expect(corpoHtml("Prima riga\nSeconda riga")).toBe("Prima riga<br>Seconda riga");
    expect(corpoHtml("Windows\r\nva a capo")).toBe("Windows<br>va a capo");
  });

  it("non lascia passare markup dal messaggio", () => {
    expect(corpoHtml("Portata < 5 m³ & <script>alert(1)</script>")).toBe(
      "Portata &lt; 5 m³ &amp; &lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});
