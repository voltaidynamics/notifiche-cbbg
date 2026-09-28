import { describe, it, expect } from "vitest";
import { sintetizzaServizio } from "@shared/madri-servizio";
import type { TrattaInsert, LegameInsert, MadreInsert } from "@shared/ws-consorzio";

const TRATTE: TrattaInsert[] = [
  { keyroggia: "R34D02S01", name: "R.Trenzano I", codiceMadre: "IM44A" },
];

const MADRI: MadreInsert[] = [
  { codice: "IM44A", name: "Trenzano", categoria: "rogge", tipoIrrigazione: "2", origine: "impianti" },
];

function legame(keyroggia: string, keykey = "1"): LegameInsert {
  return { keykey, keyroggia, metodo: "stagione" };
}

describe("sintetizzaServizio", () => {
  it("un legame orfano genera la sua tratta e la madre del suo prefisso", () => {
    const s = sintetizzaServizio([legame("R29D10+++")], TRATTE, MADRI);
    expect(s.tratte).toEqual([
      { keyroggia: "R29D10+++", name: "R29D10+++", codiceMadre: "R29" },
    ]);
    expect(s.madri).toEqual([
      { codice: "R29", name: "R29 — non classificata", categoria: "rogge", tipoIrrigazione: null, origine: "servizio" },
    ]);
  });

  it("due orfani dello stesso prefisso generano UNA madre sola", () => {
    const s = sintetizzaServizio([legame("R29D10+++"), legame("R29D11+++", "2")], TRATTE, MADRI);
    expect(s.madri.length).toBe(1);
    expect(s.tratte.length).toBe(2);
  });

  it("un legame su una tratta esistente non genera niente", () => {
    expect(sintetizzaServizio([legame("R34D02S01")], TRATTE, MADRI)).toEqual({ madri: [], tratte: [] });
  });

  it("lo stesso codice orfano in piu' legami genera UNA tratta sola", () => {
    const s = sintetizzaServizio([legame("R29D10+++", "1"), legame("R29D10+++", "2")], TRATTE, MADRI);
    expect(s.tratte.length).toBe(1);
  });

  it("prefissi diversi generano madri diverse, non un mucchio unico", () => {
    const s = sintetizzaServizio([legame("R29D10+++"), legame("R34D09+++")], TRATTE, MADRI);
    expect(s.madri.map((m) => m.codice).sort()).toEqual(["R29", "R34"]);
  });

  it("non sintetizza una madre che esiste gia' fra le tratte vere", () => {
    // Una tratta S45D00001 ha madre S45: un orfano S45D99999 deve attaccarsi
    // a quella, non creare una "S45 - non classificata" doppia.
    const conS: TrattaInsert[] = [{ keyroggia: "S45D00001", name: "x", codiceMadre: "S45" }];
    const s = sintetizzaServizio([legame("S45D99999")], conS, []);
    expect(s.madri).toEqual([]);
    expect(s.tratte).toEqual([
      { keyroggia: "S45D99999", name: "S45D99999", codiceMadre: "S45" },
    ]);
  });

  it("usa i nomi veri del consorzio, quando li conosce", () => {
    // ELENCO_RDA9 conosce «R02D10+++», ANAGRAFICA_R conosce «R02»: sono nomi del
    // consorzio, non inventati da noi, e vincono sul codice nudo.
    const s = sintetizzaServizio(
      [{ keykey: "1", keyroggia: "R02D10+++", metodo: "stagione" }],
      [],
      [],
      { madri: { R02: "R02 - Roggia borgogna e derivate" }, tratte: { "R02D10+++": "Fosso Calcinate" } },
    );
    expect(s.madri[0]).toMatchObject({ codice: "R02", name: "R02 - Roggia borgogna e derivate" });
    expect(s.tratte[0]).toMatchObject({ keyroggia: "R02D10+++", name: "Fosso Calcinate" });
  });

  it("senza nomi veri resta il comportamento di prima", () => {
    const s = sintetizzaServizio(
      [{ keykey: "1", keyroggia: "R29D10+++", metodo: "stagione" }],
      [], [],
    );
    expect(s.madri[0].name).toBe("R29 — non classificata");
    expect(s.tratte[0].name).toBe("R29D10+++");
  });

  it("non sintetizza una madre che esiste gia' fra le madri vere, anche senza tratte", () => {
    // Il mirror di agosto: `getroggemadri` manda S02, `getroggeorari/S` non ha
    // nessuna tratta S02, e i legami live S citano S02DA0002. Una seconda S02
    // «non classificata» violerebbe la chiave primaria su PostgreSQL — registro
    // fermo ogni notte — e su MemStorage sovrascriverebbe in silenzio quella vera.
    const conS02: MadreInsert[] = [
      { codice: "S02", name: "S02 - Impianto", categoria: "impianti", tipoIrrigazione: null, origine: "orari" },
    ];
    const s = sintetizzaServizio([legame("S02DA0002")], [], conS02);
    expect(s.madri).toEqual([]);
    expect(s.tratte).toEqual([
      { keyroggia: "S02DA0002", name: "S02DA0002", codiceMadre: "S02" },
    ]);
  });
});
