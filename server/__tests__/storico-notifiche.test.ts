import { describe, it, expect } from "vitest";
import {
  codiceNotifica,
  dataNotifica,
  buildHistoryRow,
  matchHistoryFilters,
  costruisciStorico,
  toRecipientDetail,
  esitoEmail,
  esitoSms,
  buildHistoryDetail,
} from "@shared/storico-notifiche";
import type { Notification, NotificationRecipient } from "@shared/schema";

function notifica(over: Partial<Notification> = {}): Notification {
  return {
    id: 1,
    segmentId: null,
    templateId: null,
    tipo: "chiusura",
    classificazione: "ordinaria",
    subject: "Chiusura tratta",
    message: "Testo",
    status: "sent",
    scheduledAt: null,
    sentAt: new Date("2026-07-20T10:00:00Z"),
    recipientCount: 0,
    emailCount: 0,
    smsCount: 0,
    emailOpenCount: 0,
    smsDeliveredCount: 0,
    createdBy: "mario.rossi",
    createdAt: new Date("2026-07-20T09:00:00Z"),
    ...over,
  };
}

function destinatario(over: Partial<NotificationRecipient> = {}): NotificationRecipient {
  return {
    id: 1,
    notificationId: 1,
    userId: null,
    keykey: "233",
    conduttoreDescrizione: "Mario Rossi",
    keyroggia: "R01D01000",
    roggiaDescrizione: "Roggia Comuna - tratto capofonte",
    email: "mario.rossi@email.it",
    phone: "331 1234567",
    emailStatus: "sent",
    smsStatus: "pending",
    emailMessageId: null,
    smsSid: null,
    emailOpenedAt: null,
    smsDeliveredAt: null,
    sentAt: null,
    ...over,
  };
}

describe("codiceNotifica", () => {
  it("formatta l'id su 5 cifre", () => {
    expect(codiceNotifica(1)).toBe("N00001");
    expect(codiceNotifica(42)).toBe("N00042");
    expect(codiceNotifica(123456)).toBe("N123456");
  });
});

describe("dataNotifica", () => {
  it("preferisce sentAt", () => {
    const n = notifica();
    expect(dataNotifica(n)).toEqual(new Date("2026-07-20T10:00:00Z"));
  });
  it("ripiega su createdAt se non inviata", () => {
    const n = notifica({ sentAt: null });
    expect(dataNotifica(n)).toEqual(new Date("2026-07-20T09:00:00Z"));
  });
});

describe("buildHistoryRow", () => {
  it("conta le rogge distinte, non i destinatari", () => {
    const row = buildHistoryRow(notifica(), [
      destinatario({ id: 1, keyroggia: "R01D01000" }),
      destinatario({ id: 2, keyroggia: "R01D01000" }),
      destinatario({ id: 3, keyroggia: "R02D03000" }),
    ]);
    expect(row.numRogge).toBe(2);
    expect(row.numDestinatari).toBe(3);
    expect(row.codice).toBe("N00001");
    expect(row.utente).toBe("mario.rossi");
  });

  it("un destinatario raggiunto da due tratte le conta entrambe (issue #5)", () => {
    const row = buildHistoryRow(notifica(), [
      destinatario({ id: 1, keyroggia: "S45D00001, S45D00002" }),
      destinatario({ id: 2, keyroggia: "S45D00002" }),
    ]);
    expect(row.numRogge).toBe(2);
    expect(row.numDestinatari).toBe(2);
  });

  it("porta il legame fissato all'invio (issue #54)", () => {
    expect(buildHistoryRow(notifica({ legame: "stagione" }), []).legame).toBe("stagione");
    expect(buildHistoryRow(notifica({ legame: "live" }), []).legame).toBe("live");
  });

  it("legame null sulle notifiche precedenti alla scelta del legame", () => {
    expect(buildHistoryRow(notifica({ legame: null }), []).legame).toBeNull();
  });

  it("ignora le rogge nulle nel conteggio", () => {
    const row = buildHistoryRow(notifica(), [
      destinatario({ id: 1, keyroggia: null }),
      destinatario({ id: 2, keyroggia: "R01D01000" }),
    ]);
    expect(row.numRogge).toBe(1);
  });

  it("usa recipientCount se non ci sono destinatari di dettaglio", () => {
    const row = buildHistoryRow(notifica({ recipientCount: 7 }), []);
    expect(row.numDestinatari).toBe(7);
    expect(row.numRogge).toBe(0);
  });
});

describe("matchHistoryFilters", () => {
  const n = notifica();
  const dest = [destinatario()];

  it("passa senza filtri", () => {
    expect(matchHistoryFilters(n, dest, {})).toBe(true);
  });

  it("filtra per utente (match parziale, case-insensitive)", () => {
    expect(matchHistoryFilters(n, dest, { utente: "ROSSI" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { utente: "bianchi" })).toBe(false);
  });

  it("filtra per tipo esatto", () => {
    expect(matchHistoryFilters(n, dest, { tipo: "chiusura" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { tipo: "apertura" })).toBe(false);
  });

  it("include gli estremi dell'intervallo di date", () => {
    // sentAt = 2026-07-20T10:00:00Z: il filtro usa l'ora locale del server,
    // quindi il giorno stesso deve rientrare in entrambi gli estremi.
    expect(matchHistoryFilters(n, dest, { dataInizio: "2026-07-20" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { dataFine: "2026-07-20" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { dataInizio: "2026-07-21" })).toBe(false);
    expect(matchHistoryFilters(n, dest, { dataFine: "2026-07-19" })).toBe(false);
  });

  it("filtra per roggia guardando dentro i destinatari", () => {
    expect(matchHistoryFilters(n, dest, { roggia: "R01" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { roggia: "Comuna" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { roggia: "Molinara" })).toBe(false);
  });

  it("filtra per destinatario su codice, descrizione, mail e telefono", () => {
    expect(matchHistoryFilters(n, dest, { destinatario: "233" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { destinatario: "mario" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { destinatario: "email.it" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { destinatario: "999" })).toBe(false);
  });

  it("una notifica senza destinatari non passa i filtri sui destinatari", () => {
    expect(matchHistoryFilters(n, [], { roggia: "R01" })).toBe(false);
    expect(matchHistoryFilters(n, [], { destinatario: "mario" })).toBe(false);
  });
});

describe("costruisciStorico", () => {
  const n1 = notifica({ id: 1, sentAt: new Date("2026-07-10T08:00:00Z") });
  const n2 = notifica({ id: 2, sentAt: new Date("2026-07-22T08:00:00Z"), tipo: "apertura" });
  const recipients = [
    destinatario({ id: 1, notificationId: 1, keyroggia: "R01D01000" }),
    destinatario({ id: 2, notificationId: 2, keyroggia: "R02D03000", conduttoreDescrizione: "Luca Bianchi" }),
  ];

  it("ordina per data decrescente", () => {
    const rows = costruisciStorico([n1, n2], recipients, {});
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });

  it("applica i filtri combinati in AND", () => {
    const rows = costruisciStorico([n1, n2], recipients, { tipo: "apertura", roggia: "R02" });
    expect(rows.map((r) => r.id)).toEqual([2]);
    expect(costruisciStorico([n1, n2], recipients, { tipo: "apertura", roggia: "R01" })).toEqual([]);
  });

  it("associa a ogni notifica solo i propri destinatari", () => {
    const rows = costruisciStorico([n1, n2], recipients, {});
    expect(rows.every((r) => r.numDestinatari === 1)).toBe(true);
  });
});

describe("toRecipientDetail", () => {
  it("mappa i campi sulle colonne del mockup", () => {
    expect(toRecipientDetail(destinatario())).toEqual({
      id: 1,
      codiceConduttore: "233",
      descrizioneConduttore: "Mario Rossi",
      codiceRoggia: "R01D01000",
      descrizioneRoggia: "Roggia Comuna - tratto capofonte",
      sms: "331 1234567",
      mail: "mario.rossi@email.it",
      esitoEmail: "inviato",
      esitoSms: null,
    });
  });
});

describe("esito dell'invio nel dettaglio (issue #111)", () => {
  it("una mail è inviata se il server SMTP l'ha accettata, aperta o no", () => {
    expect(esitoEmail("sent")).toBe("inviato");
    // Le aperture non si dichiarano: l'aperta resta una inviata.
    expect(esitoEmail("opened")).toBe("inviato");
    expect(esitoEmail("failed")).toBe("nonInviato");
    expect(esitoEmail("pending")).toBe("inAttesa");
  });

  it("un SMS mai partito non è «in attesa»: senza la spunta non partirà mai", () => {
    expect(esitoSms("pending")).toBeNull();
    expect(esitoSms("sent")).toBe("inviato");
    expect(esitoSms("delivered")).toBe("inviato");
    expect(esitoSms("failed")).toBe("nonInviato");
  });

  it("il dettaglio conta le mail e gli SMS inviati", () => {
    const d = buildHistoryDetail(notifica(), [
      destinatario({ id: 1, emailStatus: "sent", smsStatus: "sent" }),
      destinatario({ id: 2, emailStatus: "opened", smsStatus: "failed" }),
      destinatario({ id: 3, emailStatus: "failed", smsStatus: "failed" }),
      destinatario({ id: 4, email: null, emailStatus: "failed", smsStatus: "pending" }),
    ]);
    expect(d.destinatari).toHaveLength(4);
    expect(d.emailInviate).toBe(2);
    expect(d.smsInviati).toBe(1);
    expect(d.messaggio).toBe("Testo");
    expect(d.destinatari.map((x) => x.esitoEmail)).toEqual(["inviato", "inviato", "nonInviato", "nonInviato"]);
    expect(d.inCorso).toBe(false);
  });

  it("è in corso finché la notifica è «sending», anche a mail finite: dopo partono gli SMS", () => {
    const tutteSpedite = [destinatario({ emailStatus: "sent", smsStatus: "pending" })];
    expect(buildHistoryDetail(notifica({ status: "sending" }), tutteSpedite).inCorso).toBe(true);
    expect(buildHistoryDetail(notifica({ status: "failed" }), tutteSpedite).inCorso).toBe(false);
  });
});

describe("classificazione nello Storico", () => {
  it("la riga porta la classificazione della notifica", () => {
    const riga = buildHistoryRow(notifica({ classificazione: "inquinamento" }), []);
    expect(riga.classificazione).toBe("inquinamento");
  });

  it("il filtro classificazione tiene solo il valore esatto", () => {
    const n = notifica({ classificazione: "straordinaria" });
    expect(matchHistoryFilters(n, [], { classificazione: "straordinaria" })).toBe(true);
    expect(matchHistoryFilters(n, [], { classificazione: "ordinaria" })).toBe(false);
  });

  it("tipo e classificazione insieme si restringono a vicenda", () => {
    const n = notifica({ tipo: "chiusura", classificazione: "inquinamento" });
    expect(matchHistoryFilters(n, [], { tipo: "chiusura", classificazione: "inquinamento" })).toBe(true);
    expect(matchHistoryFilters(n, [], { tipo: "chiusura", classificazione: "ordinaria" })).toBe(false);
    expect(matchHistoryFilters(n, [], { tipo: "apertura", classificazione: "inquinamento" })).toBe(false);
  });
});

describe("ricerca per codice o descrizione (richiesta del tester, issue #12)", () => {
  const n = notifica();
  const dest = [
    destinatario({
      id: 1,
      keykey: "S45DA1G21",
      conduttoreDescrizione: "Azienda Agricola Sereni Srl",
      keyroggia: "S45DA0021",
      roggiaDescrizione: "Consegna Serio 0021",
    }),
  ];

  it("trova la roggia col codice a 9 per intero", () => {
    expect(matchHistoryFilters(n, dest, { roggia: "S45DA0021" })).toBe(true);
  });

  it("trova la roggia con un pezzo di codice", () => {
    expect(matchHistoryFilters(n, dest, { roggia: "DA0021" })).toBe(true);
  });

  it("trova la roggia con un pezzo di descrizione", () => {
    expect(matchHistoryFilters(n, dest, { roggia: "Serio" })).toBe(true);
  });

  it("trova il conduttore col codice a 9", () => {
    expect(matchHistoryFilters(n, dest, { destinatario: "S45DA1G21" })).toBe(true);
  });

  it("trova il conduttore con un pezzo di descrizione", () => {
    expect(matchHistoryFilters(n, dest, { destinatario: "Sereni" })).toBe(true);
  });

  it("la ricerca ignora maiuscole e minuscole", () => {
    expect(matchHistoryFilters(n, dest, { roggia: "s45da0021" })).toBe(true);
    expect(matchHistoryFilters(n, dest, { destinatario: "sereni" })).toBe(true);
  });

  it("un destinatario raggiunto da due tratte si trova con ciascuna", () => {
    // Lo snapshot di chi condivide più tratte le elenca in un campo solo (issue #5).
    const multi = [destinatario({ id: 2, keyroggia: "S45D00001, S45D00002" })];
    expect(matchHistoryFilters(n, multi, { roggia: "S45D00001" })).toBe(true);
    expect(matchHistoryFilters(n, multi, { roggia: "S45D00002" })).toBe(true);
  });

  it("un filtro che non trova nulla esclude la notifica, non la lascia passare", () => {
    expect(matchHistoryFilters(n, dest, { roggia: "R99D00000" })).toBe(false);
    expect(matchHistoryFilters(n, dest, { destinatario: "Inesistente" })).toBe(false);
  });

  it("la roggia cercata su una notifica senza destinatari registrati non passa", () => {
    expect(matchHistoryFilters(n, [], { roggia: "S45DA0021" })).toBe(false);
  });
});

// Una comunicazione «di prova» e' andata ai soli utenti di test (issue #36):
// e' la stessa definizione con cui il superadmin le cancella, e va calcolata
// una volta sola.
describe("riga di prova", () => {
  const notifica = (id: number) => ({
    id, segmentId: null, templateId: null, tipo: "chiusura", classificazione: "ordinaria",
    legame: "live", subject: "Prova", message: "Testo", messageSms: null, status: "sent",
    scheduledAt: null, sentAt: new Date("2026-09-01T10:00:00Z"), recipientCount: 0,
    emailCount: 0, smsCount: 0, emailOpenCount: 0, smsDeliveredCount: 0,
    createdBy: "superadmin", createdAt: new Date("2026-09-01T10:00:00Z"),
  }) as any;

  const destinatario = (id: number, utenteTest: boolean) => ({
    id, notificationId: 1, userId: null, keykey: utenteTest ? null : "C001",
    conduttoreDescrizione: utenteTest ? "Francesco" : "Mario Rossi",
    keyroggia: "R01D01000", roggiaDescrizione: "Tratta", email: "x@y.it", phone: null,
    canale: "normale", utenteTest, emailStatus: "sent", smsStatus: "pending",
    emailMessageId: null, smsSid: null, emailOpenedAt: null, smsDeliveredAt: null, sentAt: null,
  }) as any;

  it("marca come prova la notifica andata ai soli utenti di test", () => {
    const riga = buildHistoryRow(notifica(1), [destinatario(1, true), destinatario(2, true)]);
    expect(riga.prova).toBe(true);
  });

  it("non la marca se c'e' anche un solo conduttore vero", () => {
    const riga = buildHistoryRow(notifica(1), [destinatario(1, true), destinatario(2, false)]);
    expect(riga.prova).toBe(false);
  });

  it("non marca come prova una notifica senza destinatari", () => {
    expect(buildHistoryRow(notifica(1), []).prova).toBe(false);
  });

  it("porta il marcatore anche sul dettaglio del destinatario", () => {
    expect(toRecipientDetail(destinatario(1, true)).utenteTest).toBe(true);
    expect(toRecipientDetail(destinatario(2, false)).utenteTest).toBe(false);
  });
});
