import type {
  Notification,
  NotificationRecipient,
  NotificationHistoryRow,
  NotificationHistoryDetail,
  NotificationHistoryFilters,
} from "@shared/schema";
import {
  costruisciStorico, buildHistoryRow, toRecipientDetail,
} from "@shared/storico-notifiche";

// Dati di esempio dello Storico Notifiche: mostrano com'è fatta la sezione
// finché il database non contiene notifiche reali. Non vengono mai scritti.
//
// Sono veri oggetti di dominio, non righe già pronte, e passano dalla stessa
// `costruisciStorico()` del server: un filtro che qui funziona funziona anche
// in produzione, e non restano due comportamenti da allineare a mano. Era il
// difetto segnalato dal tester — l'esempio spariva al primo filtro, e ogni
// ricerca sembrava non funzionare.

const CONDUTTORI = [
  { codice: "S45DA1G21", descrizione: "Azienda Agricola Sereni Srl" },
  { codice: "N09CV3E88", descrizione: "Mario Rossi" },
  { codice: "T12BC3F04", descrizione: "Cooperativa Agricola San Marco" },
  { codice: "L14DF2B62", descrizione: "Luca Bianchi" },
  { codice: "P88NA2H17", descrizione: "Fattoria Colline Verdi Spa" },
  { codice: "V30GH5A11", descrizione: "Sara Verdi" },
  { codice: "R33VE1L09", descrizione: "Consorzio Irriguo Bassa Padana" },
  { codice: "D21RF3C40", descrizione: "Paolo Ricci" },
];

const ROGGE = [
  { codice: "R01D01000", descrizione: "Roggia Comuna - tratto capofonte" },
  { codice: "R02D01000", descrizione: "Molinara - derivazione 01" },
  { codice: "S02DA0002", descrizione: "Consegna Adda 0002" },
  { codice: "S45DA0021", descrizione: "Consegna Serio 0021" },
];

type Seme = {
  id: number;
  utente: string;
  data: string;
  tipo: string;
  classificazione: string;
  legame: string;
  subject: string;
  messaggio: string;
  destinatari: number;
  rogge: number[]; // indici in ROGGE
};

const SEMI: Seme[] = [
  { id: 9001, utente: "mario.rossi", data: "2026-07-23T07:45:00", tipo: "chiusura", classificazione: "straordinaria", legame: "live", subject: "Chiusura urgente tratta R02D01000", messaggio: "Si comunica la chiusura immediata della tratta per rottura arginale. Si prega di sospendere ogni prelievo fino a nuova comunicazione.", destinatari: 6, rogge: [1] },
  { id: 9002, utente: "luca.bianchi", data: "2026-07-22T16:20:00", tipo: "chiusura", classificazione: "ordinaria", legame: "stagione", subject: "Manutenzione programmata impianto Adda", messaggio: "È prevista un'attività di manutenzione programmata sull'impianto in oggetto. Si informa l'utenza per opportuna conoscenza.", destinatari: 5, rogge: [2, 3] },
  { id: 9003, utente: "mario.rossi", data: "2026-07-21T09:00:00", tipo: "apertura", classificazione: "ordinaria", legame: "live", subject: "Riapertura Roggia Comuna", messaggio: "Si comunica che la tratta precedentemente chiusa è stata riaperta e risulta nuovamente in esercizio.", destinatari: 4, rogge: [0] },
  { id: 9004, utente: "sara.verdi", data: "2026-07-19T14:10:00", tipo: "chiusura", classificazione: "inquinamento", legame: "stagione", subject: "Sospensione prelievi Serio 45", messaggio: "Sospensione dei prelievi per episodio di inquinamento rilevato a monte. Non utilizzare l'acqua per uso irriguo fino a revoca.", destinatari: 8, rogge: [3] },
  { id: 9005, utente: "luca.bianchi", data: "2026-07-17T06:55:00", tipo: "apertura", classificazione: "straordinaria", legame: "live", subject: "Apertura straordinaria Molinara", messaggio: "Apertura straordinaria disposta per far fronte alla richiesta irrigua eccezionale del periodo.", destinatari: 3, rogge: [1, 2] },
  { id: 9006, utente: "sara.verdi", data: "2026-07-15T18:30:00", tipo: "apertura", classificazione: "ordinaria", legame: "stagione", subject: "Riapertura S02DA0002", messaggio: "Terminata la pulizia del canale, la tratta torna in esercizio secondo il calendario ordinario.", destinatari: 7, rogge: [2] },
];

function notificaDaSeme(s: Seme): Notification {
  const data = new Date(s.data);
  return {
    id: s.id,
    segmentId: null,
    templateId: null,
    tipo: s.tipo,
    classificazione: s.classificazione,
    legame: s.legame,
    subject: s.subject,
    message: s.messaggio,
    messageSms: null,
    status: "sent",
    scheduledAt: null,
    sentAt: data,
    recipientCount: s.destinatari,
    emailCount: s.destinatari,
    smsCount: s.destinatari,
    emailOpenCount: 0,
    smsDeliveredCount: 0,
    createdBy: s.utente,
    createdAt: data,
  };
}

function destinatariDaSeme(s: Seme): NotificationRecipient[] {
  return Array.from({ length: s.destinatari }, (_, i) => {
    const c = CONDUTTORI[i % CONDUTTORI.length];
    const r = ROGGE[s.rogge[i % s.rogge.length]];
    return {
      id: s.id * 100 + i,
      notificationId: s.id,
      userId: null,
      keykey: c.codice,
      conduttoreDescrizione: c.descrizione,
      keyroggia: r.codice,
      roggiaDescrizione: r.descrizione,
      // Un destinatario ogni quattro non ha numero, uno ogni cinque non ha mail:
      // così si vede come si comporta la tabella con i campi mancanti.
      phone: i % 4 === 3 ? null : `33${i} ${1000000 + i * 137}`.slice(0, 12),
      email: i % 5 === 4 ? null : `${c.descrizione.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@email.it`,
      // Un destinatario su tre per PEC: nell'anagrafica vera sono quasi la metà,
      // e la colonna Canale dev'essere popolata anche negli esempi.
      canale: i % 3 === 2 ? "pec" : "normale",
      // I dati di esempio sono tutti conduttori veri: la prova la si vede solo
      // dopo un invio di collaudo.
      utenteTest: false,
      emailStatus: "sent",
      smsStatus: "sent",
      emailMessageId: null,
      smsSid: null,
      emailOpenedAt: null,
      smsDeliveredAt: null,
      sentAt: new Date(s.data),
    };
  });
}

const NOTIFICHE: Notification[] = SEMI.map(notificaDaSeme);
const DESTINATARI: NotificationRecipient[] = SEMI.flatMap(destinatariDaSeme);

/** Lo storico d'esempio, filtrato con la stessa regola del server. */
export function storicoEsempio(filtri: NotificationHistoryFilters): NotificationHistoryRow[] {
  return costruisciStorico(NOTIFICHE, DESTINATARI, filtri);
}

export function dettaglioEsempio(id: number): NotificationHistoryDetail | undefined {
  const n = NOTIFICHE.find((x) => x.id === id);
  if (!n) return undefined;
  const destinatari = DESTINATARI.filter((r) => r.notificationId === id);
  return {
    ...buildHistoryRow(n, destinatari),
    messaggio: n.message,
    messaggioSms: n.messageSms,
    destinatari: destinatari.map(toRecipientDetail),
  };
}
