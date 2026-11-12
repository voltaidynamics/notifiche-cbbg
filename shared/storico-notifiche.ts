import type {
  EsitoInvio,
  Notification,
  NotificationHistoryDetail,
  NotificationRecipient,
  NotificationHistoryRow,
  NotificationHistoryFilters,
  NotificationRecipientDetail,
} from "@shared/schema";
import { separaTratte } from "@shared/destinatari";
import { descriviBounce, tipoBounce } from "@shared/bounce";
import { ETICHETTE_TIPO, ETICHETTE_CLASSIFICAZIONE } from "@shared/classificazione";
import { ETICHETTE_LEGAME } from "@shared/legame";

/**
 * Logica pura dello Storico Notifiche.
 *
 * Sta in `shared/` perché la usano le due implementazioni di IStorage. Una
 * regola sola, o "il filtro non funziona" diventa una frase vera solo per metà
 * dei casi.
 */

/** Codice leggibile mostrato in tabella: 42 -> "N00042". */
export function codiceNotifica(id: number): string {
  return `N${String(id).padStart(5, "0")}`;
}

/** Data di riferimento della notifica: quando è partita, altrimenti quando è stata creata. */
export function dataNotifica(n: Pick<Notification, "sentAt" | "createdAt">): Date {
  return n.sentAt ?? n.createdAt;
}

/**
 * L'esito di una mail come lo mostra il dettaglio (issue #111): «inviata»
 * vuol dire che il server SMTP l'ha accettata, non che è arrivata.
 * `opened` (il pixel) conta come inviata: le aperture non le dichiariamo,
 * perché senza `APP_URL` il pixel non c'è e il dato non sarebbe affidabile.
 * `pending` è un invio ancora in corso — o interrotto da un riavvio.
 */
export function esitoEmail(status: string): EsitoInvio {
  if (status === "sent" || status === "opened") return "inviato";
  // Accettata dal server SMTP e poi tornata indietro (issue #126).
  if (status === "bounced") return "nonRecapitato";
  if (status === "failed") return "nonInviato";
  return "inAttesa";
}

/**
 * Come `esitoEmail`, ma `pending` vale null: gli SMS partono solo con la spunta
 * «Invia anche via SMS», e senza la spunta restano `pending` per sempre —
 * «in attesa» direbbe che prima o poi partiranno. `delivered` non lo scrive
 * nessuno (la piattaforma non conferma la consegna), ma conta come inviato.
 */
export function esitoSms(status: string): EsitoInvio | null {
  if (status === "sent" || status === "delivered") return "inviato";
  if (status === "failed") return "nonInviato";
  return null;
}

/**
 * Se la notifica è partita con la spunta «Invia anche via SMS» (issue #129).
 * true/false = sì/no, null = non si sa.
 *
 * Dalla migrazione 0019 la scelta è registrata in `notifications.invio_sms`, e
 * quella vale. Per le notifiche precedenti si ricava dagli esiti, ed è univoco
 * finché la spedizione è finita: con la spunta accesa ogni destinatario esce
 * dal giro SMS `sent` o `failed` (anche chi non ha numero), con la spunta
 * spenta restano tutti `pending`. `smsCount > 0` copre i percorsi legacy, che
 * contano i numeri prima di spedire. Non si sa — e non si inventa — quando non
 * ci sono destinatari o la spedizione è ancora (o per sempre, dopo un riavvio)
 * in corso: lì «tutti pending» vuol dire anche «SMS non ancora arrivati».
 *
 * Il testo SMS non dice niente: è prevalorizzato dal template e si salva anche
 * a spunta spenta.
 */
export function invioSmsAttivo(
  n: Pick<Notification, "smsCount" | "status"> & { invioSms?: boolean | null },
  recipients: Pick<NotificationRecipient, "smsStatus">[],
): boolean | null {
  if (n.invioSms === true || n.invioSms === false) return n.invioSms;
  if (recipients.some((r) => r.smsStatus !== "pending")) return true;
  if (n.smsCount > 0) return true;
  if (recipients.length > 0 && n.status !== "sending") return false;
  return null;
}

export function toRecipientDetail(r: NotificationRecipient): NotificationRecipientDetail {
  return {
    id: r.id,
    codiceConduttore: r.keykey,
    descrizioneConduttore: r.conduttoreDescrizione,
    codiceRoggia: r.keyroggia,
    descrizioneRoggia: r.roggiaDescrizione,
    sms: r.phone,
    mail: r.email,
    canale: r.canale,
    utenteTest: r.utenteTest,
    esitoEmail: esitoEmail(r.emailStatus),
    esitoSms: esitoSms(r.smsStatus),
    motivoMancatoRecapito:
      r.emailStatus === "bounced" ? descriviBounce(r.emailBounceCodice, tipoBounce(r.emailBounceTipo)) : null,
  };
}

/** Il dettaglio di una notifica, uguale per le due implementazioni di IStorage. */
export function buildHistoryDetail(
  n: Notification,
  recipients: NotificationRecipient[],
): NotificationHistoryDetail {
  const destinatari = recipients.map(toRecipientDetail);
  return {
    ...buildHistoryRow(n, recipients),
    messaggio: n.message,
    messaggioSms: n.messageSms,
    invioSms: invioSmsAttivo(n, recipients),
    destinatari,
    emailInviate: destinatari.filter((d) => d.esitoEmail === "inviato").length,
    smsInviati: destinatari.filter((d) => d.esitoSms === "inviato").length,
    inCorso: n.status === "sending",
  };
}

export function buildHistoryRow(
  n: Notification,
  recipients: NotificationRecipient[],
): NotificationHistoryRow {
  // Un destinatario raggiunto da più tratte le porta tutte in un unico campo
  // (issue #5): vanno riseparate, o due tratte conterebbero come una.
  const rogge = new Set<string>();
  for (const r of recipients) {
    for (const codice of separaTratte(r.keyroggia)) rogge.add(codice);
  }
  return {
    id: n.id,
    codice: codiceNotifica(n.id),
    utente: n.createdBy,
    data: dataNotifica(n).toISOString(),
    numRogge: rogge.size,
    // Se i destinatari di dettaglio non sono stati registrati (notifiche
    // precedenti a questa funzionalità) si ripiega sul contatore aggregato.
    numDestinatari: recipients.length || n.recipientCount,
    tipo: n.tipo,
    classificazione: n.classificazione,
    legame: n.legame ?? null,
    subject: n.subject,
    // Con destinatari, e nessuno di essi un conduttore vero. `length > 0`
    // esclude le notifiche senza destinatari: non sono prove, sono
    // comunicazioni che non hanno raggiunto nessuno.
    prova: recipients.length > 0 && recipients.every((r) => r.utenteTest),
  };
}

const contiene = (valore: string | null | undefined, ago: string) =>
  (valore ?? "").toLowerCase().includes(ago);

/**
 * Applica i filtri che dipendono dai destinatari (roggia, destinatario) e quelli
 * semplici su notifica. Restituisce true se la notifica va mostrata.
 */
export function matchHistoryFilters(
  n: Notification,
  recipients: NotificationRecipient[],
  filters: NotificationHistoryFilters,
): boolean {
  const { utente, dataInizio, dataFine, roggia, tipo, classificazione, destinatario } = filters;

  if (utente && !contiene(n.createdBy, utente.toLowerCase())) return false;
  if (tipo && n.tipo !== tipo) return false;
  if (classificazione && n.classificazione !== classificazione) return false;

  const data = dataNotifica(n);
  if (dataInizio) {
    const inizio = new Date(`${dataInizio}T00:00:00`);
    if (!Number.isNaN(inizio.getTime()) && data < inizio) return false;
  }
  if (dataFine) {
    const fine = new Date(`${dataFine}T23:59:59.999`);
    if (!Number.isNaN(fine.getTime()) && data > fine) return false;
  }

  if (roggia) {
    const ago = roggia.toLowerCase();
    const ok = recipients.some(
      (r) => contiene(r.keyroggia, ago) || contiene(r.roggiaDescrizione, ago),
    );
    if (!ok) return false;
  }

  if (destinatario) {
    const ago = destinatario.toLowerCase();
    const ok = recipients.some(
      (r) =>
        contiene(r.keykey, ago) ||
        contiene(r.conduttoreDescrizione, ago) ||
        contiene(r.email, ago) ||
        contiene(r.phone, ago),
    );
    if (!ok) return false;
  }

  return true;
}

/** Raggruppa i destinatari per notifica. */
export function raggruppaPerNotifica(
  recipients: NotificationRecipient[],
): Map<number, NotificationRecipient[]> {
  const out = new Map<number, NotificationRecipient[]>();
  for (const r of recipients) {
    const list = out.get(r.notificationId);
    if (list) list.push(r);
    else out.set(r.notificationId, [r]);
  }
  return out;
}

/** Costruisce lo storico filtrato e ordinato per data decrescente. */
export function costruisciStorico(
  notifs: Notification[],
  recipients: NotificationRecipient[],
  filters: NotificationHistoryFilters,
): NotificationHistoryRow[] {
  const perNotifica = raggruppaPerNotifica(recipients);
  return notifs
    .filter((n) => matchHistoryFilters(n, perNotifica.get(n.id) ?? [], filters))
    .map((n) => buildHistoryRow(n, perNotifica.get(n.id) ?? []))
    .sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Le parole degli esiti, uguali nel popup e nel CSV. «Inviata» = accettata dal
 * server SMTP o dalla piattaforma SMS, non consegnata né letta (issue #111).
 */
export const ETICHETTE_ESITO: Record<EsitoInvio, { email: string; sms: string }> = {
  inviato: { email: "Inviata", sms: "Inviato" },
  nonInviato: { email: "Non inviata", sms: "Non inviato" },
  inAttesa: { email: "In attesa", sms: "In attesa" },
  // Accettata dal server e poi tornata indietro (issue #126).
  nonRecapitato: { email: "Non recapitata", sms: "Non recapitato" },
};

/** Il valore della colonna «Invio con SMS» (issue #129); vuoto se non si sa. */
export function etichettaInvioSms(invioSms: boolean | null): string {
  if (invioSms === null) return "";
  return invioSms ? "attivo" : "non attivo";
}

/** Nel CSV un recapito mancante si scrive, non si lascia vuoto (issue #129). */
export const RECAPITO_ASSENTE = "assente";

const vuoto = (v: string | null | undefined) => (v ?? "").trim() === "";
const etichettaDi = (mappa: Record<string, string>, v: string) => mappa[v] ?? v;

/**
 * Le righe di «Esporta dettaglio CSV» (issue #129).
 *
 * Prima un blocco con ciò che è uguale per tutta la comunicazione — oggetto,
 * testo della mail, testo SMS, chi, quando — su una riga di intestazione e una
 * di valori; poi una riga vuota e la tabella dei destinatari. I due testi sono
 * lunghi e su più righe: ripetuti a ogni destinatario renderebbero il file
 * illeggibile in Excel (ogni riga alta come il messaggio) per un'informazione
 * che non cambia mai. La tabella tiene comunque le sue colonne comuni (ID, data,
 * tipo…), le stesse di prima: chi la filtra o la incolla altrove non perde
 * niente.
 *
 * Senza numero la colonna SMS dice «assente» e l'esito SMS resta vuoto: non è
 * un SMS fallito, è un SMS che non poteva partire. Idem per la mail.
 * `formatData` arriva dal chiamante perché il formato è quello del browser.
 */
export function righeCsvDettaglio(
  d: NotificationHistoryDetail,
  formatData: (iso: string) => string,
): string[][] {
  const tipo = etichettaDi(ETICHETTE_TIPO, d.tipo);
  const classificazione = etichettaDi(ETICHETTE_CLASSIFICAZIONE, d.classificazione);
  const legame = d.legame === null ? "" : etichettaDi(ETICHETTE_LEGAME, d.legame);
  const data = formatData(d.data);
  const invioSms = etichettaInvioSms(d.invioSms);
  return [
    ["ID Notifica", "Utente", "Data", "Tipo", "Classificazione", "Legame", "Invio con SMS",
      "Oggetto Email", "Testo Email", "Testo SMS"],
    [d.codice, d.utente ?? "", data, tipo, classificazione, legame, invioSms,
      d.subject, d.messaggio, d.messaggioSms ?? ""],
    [],
    ["ID Notifica", "Utente", "Data", "Tipo", "Classificazione", "Legame", "Invio con SMS",
      "Codice Conduttore", "Descrizione Conduttore", "Codice Roggia", "Descrizione Roggia",
      "SMS", "Mail", "Canale", "Utente di test", "Esito email", "Motivo mancato recapito", "Esito SMS"],
    ...d.destinatari.map((r) => {
      const senzaNumero = vuoto(r.sms);
      const senzaMail = vuoto(r.mail);
      return [
        d.codice, d.utente ?? "", data, tipo, classificazione, legame, invioSms,
        r.codiceConduttore ?? "", r.descrizioneConduttore ?? "", r.codiceRoggia ?? "", r.descrizioneRoggia ?? "",
        senzaNumero ? RECAPITO_ASSENTE : (r.sms as string),
        senzaMail ? RECAPITO_ASSENTE : (r.mail as string),
        r.canale ?? "",
        r.utenteTest ? "Si" : "No",
        senzaMail ? "" : ETICHETTE_ESITO[r.esitoEmail].email,
        senzaMail ? "" : r.motivoMancatoRecapito ?? "",
        senzaNumero || r.esitoSms === null ? "" : ETICHETTE_ESITO[r.esitoSms].sms,
      ];
    }),
  ];
}
