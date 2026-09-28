import { describe, it, expect, beforeEach } from "vitest";
import { FiltroCodici, isGerarchiaCodice } from "@shared/codici-attivi";
import { MemStorage } from "../storage";
import { caricaFiltroCodici } from "../filtro-codici";

/**
 * Gestione Codici (issue #52). La regola che conta è `trattaAttiva`: una
 * tratta sta in due gerarchie, e spegnerne una sola non deve toglierla
 * dall'altra.
 */

// R01D01S02 sta sotto l'impianto IM01A e sotto la roggia madre R01;
// R05D01000 solo sotto IM05A; R77D01000 solo sotto la roggia madre R77.
const IMPIANTI = { R01D01S02: "IM01A", R05D01000: "IM05A" };
const ROGGE = { R01D01S02: "R01", R77D01000: "R77" };

const filtro = (impianti: string[], rogge: string[]) => new FiltroCodici({ impianti, rogge }, IMPIANTI, ROGGE);

describe("FiltroCodici", () => {
  it("al primo rilascio non c'è niente di spento: tutto passa", () => {
    const f = filtro([], []);
    expect(f.vuoto).toBe(true);
    expect(f.madreAttiva("IM01A")).toBe(true);
    expect(f.trattaAttiva("R05D01000")).toBe(true);
    expect(f.bloccati(["R01D01S02"], ["IM05A"])).toEqual([]);
  });

  it("spegnere l'impianto spegne la tratta che ha solo lui", () => {
    const f = filtro(["IM05A"], []);
    expect(f.madreAttiva("IM05A")).toBe(false);
    expect(f.trattaAttiva("R05D01000")).toBe(false);
  });

  it("una tratta resta attiva finché l'altra gerarchia la offre", () => {
    expect(filtro(["IM01A"], []).trattaAttiva("R01D01S02")).toBe(true);
    expect(filtro([], ["R01"]).trattaAttiva("R01D01S02")).toBe(true);
    expect(filtro(["IM01A"], ["R01"]).trattaAttiva("R01D01S02")).toBe(false);
  });

  it("spegnere la roggia madre spegne la figlia che nessun impianto rivendica", () => {
    expect(filtro([], ["R77"]).trattaAttiva("R77D01000")).toBe(false);
  });

  it("una tratta sconosciuta a entrambe le gerarchie non ha niente da spegnere", () => {
    expect(filtro(["IM01A"], ["R01"]).trattaAttiva("R99D00000")).toBe(true);
  });

  it("riaccendere rimette tutto com'era: lo stato è solo l'elenco degli spenti", () => {
    expect(filtro(["IM05A"], []).trattaAttiva("R05D01000")).toBe(false);
    expect(filtro([], []).trattaAttiva("R05D01000")).toBe(true);
  });

  it("l'invio elenca madri e tratte spente, e solo quelle", () => {
    const f = filtro(["IM05A", "IM27A"], []);
    expect(f.bloccati(["R05D01000", "R01D01S02"], ["IM27A", "IM01A"])).toEqual(["IM27A", "R05D01000"]);
  });
});

describe("isGerarchiaCodice", () => {
  it("accetta solo le due gerarchie", () => {
    expect(isGerarchiaCodice("impianti")).toBe(true);
    expect(isGerarchiaCodice("rogge")).toBe(true);
    expect(isGerarchiaCodice("madri")).toBe(false);
    expect(isGerarchiaCodice(undefined)).toBe(false);
  });
});

// Il pezzo che le rotte usano davvero: storage + caricaFiltroCodici. Express
// non è testabile in questo repository, e ogni rotta filtra con una riga sola
// che chiama questo filtro.
describe("caricaFiltroCodici su MemStorage", () => {
  let s: MemStorage;
  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro({
      madri: [{ codice: "IM44A", name: "Trenzano", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" }],
      tratte: [{ keyroggia: "R34D02S01", name: "R.Trenzano I", codiceMadre: "IM44A" }],
      legami: [],
    });
    await s.replaceGerarchiaRogge({
      madri: [{ codice: "R34", name: "R34 - Roggia trenzana" }],
      tratte: [{ keyroggia: "R34D02S01", name: "R.Trenzano I", codiceMadre: "R34" }],
    });
  });

  it("al primo rilascio è tutto acceso", async () => {
    expect(await s.getCodiciSpenti()).toEqual({ impianti: [], rogge: [] });
    expect((await caricaFiltroCodici(s)).vuoto).toBe(true);
  });

  it("spegne, legge le due mappe e riaccende", async () => {
    await s.impostaCodiceSpento("impianti", "IM44A", true, "admin");
    let f = await caricaFiltroCodici(s);
    expect(f.madreAttiva("IM44A")).toBe(false);
    // La roggia madre R34 è accesa: la tratta resta raggiungibile da lì.
    expect(f.trattaAttiva("R34D02S01")).toBe(true);

    await s.impostaCodiceSpento("rogge", "R34", true, "admin");
    f = await caricaFiltroCodici(s);
    expect(f.trattaAttiva("R34D02S01")).toBe(false);
    expect(f.bloccati(["R34D02S01"], [])).toEqual(["R34D02S01"]);

    await s.impostaCodiceSpento("impianti", "IM44A", false, "admin");
    await s.impostaCodiceSpento("rogge", "R34", false, "admin");
    expect(await s.getCodiciSpenti()).toEqual({ impianti: [], rogge: [] });
  });

  it("spegnere due volte lo stesso codice non lo duplica", async () => {
    await s.impostaCodiceSpento("rogge", "R34", true, "admin");
    await s.impostaCodiceSpento("rogge", "R34", true, "admin");
    expect(await s.getCodiciSpenti()).toEqual({ impianti: [], rogge: ["R34"] });
  });
});
