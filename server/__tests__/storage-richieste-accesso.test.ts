import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";

describe("richieste di accesso", () => {
  let s: MemStorage;
  beforeEach(() => {
    s = new MemStorage();
  });

  it("registra una richiesta nuova con un tentativo", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    const righe = await s.getRichiesteAccesso();
    expect(righe).toHaveLength(1);
    expect(righe[0].username).toBe("m.rossi");
    expect(righe[0].tentativi).toBe(1);
  });

  it("un secondo tentativo non crea una riga nuova ma incrementa", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    await s.registraRichiestaAccesso("m.rossi");
    await s.registraRichiestaAccesso("m.rossi");
    const righe = await s.getRichiesteAccesso();
    expect(righe).toHaveLength(1);
    expect(righe[0].tentativi).toBe(3);
  });

  it("il primo tentativo non si muove, l'ultimo si", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    const primo = (await s.getRichiesteAccesso())[0];
    await new Promise((r) => setTimeout(r, 5));
    await s.registraRichiestaAccesso("m.rossi");
    const dopo = (await s.getRichiesteAccesso())[0];
    expect(dopo.primoTentativo.getTime()).toBe(primo.primoTentativo.getTime());
    expect(dopo.ultimoTentativo.getTime()).toBeGreaterThanOrEqual(primo.ultimoTentativo.getTime());
  });

  it("username diversi sono righe diverse", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    await s.registraRichiestaAccesso("g.bianchi");
    expect(await s.getRichiesteAccesso()).toHaveLength(2);
  });

  it("le piu' recenti vengono per prime", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    await new Promise((r) => setTimeout(r, 5));
    await s.registraRichiestaAccesso("g.bianchi");
    const righe = await s.getRichiesteAccesso();
    expect(righe[0].username).toBe("g.bianchi");
  });

  it("si cancella per id", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    const id = (await s.getRichiesteAccesso())[0].id;
    expect(await s.deleteRichiestaAccesso(id)).toBe(true);
    expect(await s.getRichiesteAccesso()).toHaveLength(0);
    expect(await s.deleteRichiestaAccesso(id)).toBe(false);
  });

  it("si cancella per username, e su uno inesistente non protesta", async () => {
    await s.registraRichiestaAccesso("m.rossi");
    await s.deleteRichiestaAccessoPerUsername("m.rossi");
    expect(await s.getRichiesteAccesso()).toHaveLength(0);
    await expect(s.deleteRichiestaAccessoPerUsername("ignoto")).resolves.toBeUndefined();
  });
});
