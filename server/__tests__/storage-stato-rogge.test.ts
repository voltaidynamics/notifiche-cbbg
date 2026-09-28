import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import { statoDi } from "@shared/stato-rogge";

/**
 * La registrazione degli eventi di stato (issue #22).
 *
 * `getEventiStato` è l'unica lettura da cui passano Dashboard, Invia notifica e
 * Anagrafiche: se lascia fuori le notifiche di tipo "altro" — o se ci fa
 * entrare quelle sbagliate — sbagliano tutte e tre insieme.
 */
describe("eventi di stato", () => {
  let s: MemStorage;

  async function notificaCon(tipo: string, targets: { codice: string; livello: "tratta" | "madre" }[]) {
    const n = await s.createNotification({
      tipo,
      classificazione: "ordinaria",
      subject: "t",
      message: "m",
      status: "sending",
    } as any);
    await s.createNotificationTargets(n.id, targets.map((t) => ({ ...t, descrizione: `nome di ${t.codice}` })));
    return n.id;
  }

  beforeEach(() => {
    s = new MemStorage();
  });

  it("senza notifiche non ci sono eventi", async () => {
    expect(await s.getEventiStato()).toEqual([]);
  });

  it("registra un evento per codice, con livello e descrizione", async () => {
    const id = await notificaCon("chiusura", [
      { codice: "R01D01000", livello: "tratta" },
      { codice: "R10", livello: "madre" },
    ]);
    const eventi = await s.getEventiStato();
    expect(eventi.length).toBe(2);
    expect(eventi.map((e) => [e.codice, e.livello, e.tipo, e.notificaId, e.descrizione])).toEqual([
      ["R01D01000", "tratta", "chiusura", id, "nome di R01D01000"],
      ["R10", "madre", "chiusura", id, "nome di R10"],
    ]);
    expect(eventi[0].quando).toBeInstanceOf(Date);
  });

  it("le notifiche di tipo 'altro' non diventano eventi", async () => {
    await notificaCon("altro", [{ codice: "R01D01000", livello: "tratta" }]);
    expect(await s.getEventiStato()).toEqual([]);
  });

  it("gli eventi bastano a decidere lo stato", async () => {
    await notificaCon("chiusura", [{ codice: "R01D01000", livello: "tratta" }]);
    const eventi = await s.getEventiStato();
    // Nessuna ereditarietà in gioco qui: la mappa madri può restare vuota.
    expect(statoDi("R01D01000", "tratta", eventi, {}).stato).toBe("chiusa");
  });

  it("una lista di target vuota non scrive niente", async () => {
    const n = await s.createNotification({
      tipo: "chiusura", classificazione: "ordinaria",
      subject: "t", message: "m", status: "sending",
    } as any);
    expect(await s.createNotificationTargets(n.id, [])).toBe(0);
    expect(await s.getEventiStato()).toEqual([]);
  });
});
