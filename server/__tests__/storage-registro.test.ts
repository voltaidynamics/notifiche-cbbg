import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import type { RegistroConsorzio } from "@shared/ws-consorzio";

const REGISTRO: RegistroConsorzio = {
  madri: [
    { codice: "IM44A", name: "Trenzano", categoria: "rogge", tipoIrrigazione: "Acque superficiali", origine: "impianti" },
    { codice: "S45", name: "S45 - Impianto fiume adda", categoria: "impianti", tipoIrrigazione: null, origine: "orari" },
  ],
  tratte: [
    { keyroggia: "R34D02S01", name: "R.Trenzano I", codiceMadre: "IM44A" },
    { keyroggia: "S45D00001", name: "Comizio 1", codiceMadre: "S45" },
  ],
  legami: [
    { keykey: "1", keyroggia: "R34D02S01", metodo: "live" },
    { keykey: "2", keyroggia: "S45D00001", metodo: "stagione" },
  ],
};

describe("MemStorage — registro del consorzio", () => {
  let s: MemStorage;
  beforeEach(() => { s = new MemStorage(); });

  it("scrive e conta le tre entita'", async () => {
    expect(await s.replaceRegistro(REGISTRO)).toEqual({ madri: 2, tratte: 2, legami: 2 });
    expect((await s.getAllMadri()).length).toBe(2);
    expect((await s.getAllTratte()).length).toBe(2);
  });

  it("sostituisce per intero: niente righe vecchie sopravvissute", async () => {
    await s.replaceRegistro(REGISTRO);
    const c = await s.replaceRegistro({
      madri: [REGISTRO.madri[0]], tratte: [REGISTRO.tratte[0]], legami: [],
    });
    expect(c).toEqual({ madri: 1, tratte: 1, legami: 0 });
    expect((await s.getAllMadri()).map((m) => m.codice)).toEqual(["IM44A"]);
  });

  it("la mappa tratta -> madre non e' il prefisso", async () => {
    await s.replaceRegistro(REGISTRO);
    const mappa = await s.getMappaMadri();
    expect(mappa["R34D02S01"]).toBe("IM44A");
    expect(mappa["S45D00001"]).toBe("S45");
  });

  it("un registro vuoto svuota tutto senza esplodere", async () => {
    await s.replaceRegistro(REGISTRO);
    expect(await s.replaceRegistro({ madri: [], tratte: [], legami: [] }))
      .toEqual({ madri: 0, tratte: 0, legami: 0 });
    expect(await s.getMappaMadri()).toEqual({});
  });

  it("l'ordine e' alfabetico, come in PostgreSQL, non quello di inserimento", async () => {
    await s.replaceRegistro({
      madri: [REGISTRO.madri[1], REGISTRO.madri[0]], // S45 prima di IM44A
      tratte: [],
      legami: [],
    });
    expect((await s.getAllMadri()).map((m) => m.codice)).toEqual(["IM44A", "S45"]);
  });
});
