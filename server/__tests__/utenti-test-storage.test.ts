// Gli utenti di test in archivio, e la cancellazione delle comunicazioni di
// prova (issue #36).
//
// Gira su MemStorage: e' l'implementazione che i test possono usare senza un
// database, ed e' la stessa che regge l'app quando manca DATABASE_URL.

import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";

describe("utenti di test in archivio", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("crea, rilegge, modifica ed elimina", async () => {
    const creato = await s.createUtenteTest({
      nome: "Francesco", email: "f@consorzio.it", tipoEmail: "normale",
      telefono: null, attivo: true, createdBy: "superadmin",
    });
    expect(creato.id).toBeGreaterThan(0);
    expect(await s.getUtentiTest()).toHaveLength(1);

    const modificato = await s.updateUtenteTest(creato.id, { attivo: false });
    expect(modificato?.attivo).toBe(false);
    // Quello che non si manda non si tocca.
    expect(modificato?.nome).toBe("Francesco");

    expect(await s.deleteUtenteTest(creato.id)).toBe(true);
    expect(await s.getUtentiTest()).toHaveLength(0);
    expect(await s.deleteUtenteTest(creato.id)).toBe(false);
  });

  it("gli attivi sono un sottoinsieme, non tutti", async () => {
    await s.createUtenteTest({ nome: "Attivo", email: "a@c.it", tipoEmail: "normale", telefono: null, attivo: true, createdBy: null });
    await s.createUtenteTest({ nome: "Spento", email: "s@c.it", tipoEmail: "normale", telefono: null, attivo: false, createdBy: null });

    expect(await s.getUtentiTest()).toHaveLength(2);
    const attivi = await s.getUtentiTestAttivi();
    expect(attivi.map((u) => u.nome)).toEqual(["Attivo"]);
  });
});

describe("comunicazioni di prova", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  const notificaCon = async (destinatari: { utenteTest: boolean }[]) => {
    // `tipo: "chiusura"` non e' decorativo: `getEventiStato()` scarta le
    // notifiche "altro", e senza questo l'ultimo test non vedrebbe mai un
    // evento da cancellare.
    const n = await s.createNotification({ subject: "Prova", message: "Testo", status: "sent", tipo: "chiusura" });
    await s.createNotificationTargets(n.id, [
      { codice: "R01D01000", livello: "tratta", descrizione: "Tratta di prova" },
    ]);
    for (const d of destinatari) {
      await s.createNotificationRecipient({ notificationId: n.id, utenteTest: d.utenteTest, email: "x@y.it" });
    }
    return n.id;
  };

  it("conta solo le notifiche i cui destinatari sono tutti di test", async () => {
    await notificaCon([{ utenteTest: true }, { utenteTest: true }]);   // prova
    await notificaCon([{ utenteTest: true }, { utenteTest: false }]);  // mista: NON e' una prova
    await notificaCon([{ utenteTest: false }]);                        // vera
    await notificaCon([]);                                             // senza destinatari: non e' una prova

    expect(await s.contaNotificheProva()).toBe(1);
  });

  // La regola piu' importante del task: una comunicazione con anche un solo
  // destinatario reale non si cancella mai, nemmeno se le altre righe sono
  // tutte utenti di test.
  it("elimina le prove e lascia intatte le comunicazioni con un destinatario vero", async () => {
    const prova = await notificaCon([{ utenteTest: true }]);
    const mista = await notificaCon([{ utenteTest: true }, { utenteTest: false }]);

    expect(await s.eliminaNotificheProva()).toBe(1);

    expect(await s.getNotificationById(prova)).toBeUndefined();
    expect(await s.getNotificationById(mista)).toBeDefined();
    expect(await s.getRecipientsByNotificationId(prova)).toHaveLength(0);
    expect(await s.getRecipientsByNotificationId(mista)).toHaveLength(2);
  });

  // Senza questo, una tratta chiusa da una prova resterebbe chiusa in Dashboard
  // per sempre: lo stato si ricava dai target, non da una colonna.
  it("porta via anche i target, cosi' lo stato delle rogge si ricalcola", async () => {
    const prova = await notificaCon([{ utenteTest: true }]);
    // `getEventiStato()` e' la lettura da cui Dashboard, Invia notifica e
    // Anagrafiche ricavano se una roggia e' aperta o chiusa: e' li' che si
    // vede se una prova ha lasciato una chiusura dietro di se'.
    expect((await s.getEventiStato()).some((e) => e.notificaId === prova)).toBe(true);

    await s.eliminaNotificheProva();

    const eventi = await s.getEventiStato();
    expect(eventi.some((e) => e.notificaId === prova)).toBe(false);
    expect(eventi.some((e) => e.codice === "R01D01000")).toBe(false);
  });
});
