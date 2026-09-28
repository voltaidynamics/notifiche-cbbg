import { describe, it, expect } from "vitest";
import {
  analizzaArray, analizzaConteggi, etichettaConteggio, riassumiConteggi,
} from "@shared/esito-sync";

describe("analizzaArray", () => {
  it("legge un array JSON", () => {
    expect(analizzaArray('["a","b"]')).toEqual(["a", "b"]);
  });

  it("degrada a vuoto su JSON illeggibile, null o forma inattesa", () => {
    // I campi arrivano dal database come testo: durante il render del client non
    // c'è un ErrorBoundary a intercettare un'eccezione di JSON.parse, e in una
    // rotta del server farebbe fallire la richiesta.
    expect(analizzaArray("{rotto")).toEqual([]);
    expect(analizzaArray(null)).toEqual([]);
    expect(analizzaArray('{"non":"un array"}')).toEqual([]);
  });
});

describe("analizzaConteggi", () => {
  it("legge un oggetto JSON", () => {
    expect(analizzaConteggi('{"comuni":3}')).toEqual({ comuni: 3 });
  });

  it("rifiuta array e JSON illeggibile", () => {
    expect(analizzaConteggi("[1,2]")).toEqual({});
    expect(analizzaConteggi("{rotto")).toEqual({});
  });
});

describe("etichettaConteggio", () => {
  it("traduce le entità note", () => {
    expect(etichettaConteggio("madriImpianti")).toBe("Impianti (aggreganti IM)");
  });

  it("traduce le chiavi diagnostiche che il sync produce ma che non sono un'entità", () => {
    // Senza la mappa dedicata, la pagina Impostazioni mostrerebbe la chiave
    // grezza così com'è, es. "tratteScartate".
    expect(etichettaConteggio("tratteScartate")).not.toBe("tratteScartate");
    expect(etichettaConteggio("tratteScartate")).toBe("Tratte scartate (aggregazioni non IM)");
    expect(etichettaConteggio("madriDiServizio")).toBe("Madri non classificate create");
  });

  it("distingue le due cause di scarto delle tratte, che sono due contatori diversi", () => {
    // tratteScartate (aggregazioni non IM) e tratteSenzaMadre (keyroggia
    // troppo corto) sono due contatori distinti apposta: un'unica etichetta
    // per entrambi non direbbe all'utente quale delle due cause si è
    // verificata.
    expect(etichettaConteggio("tratteSenzaMadre")).toBe("Tratte scartate (codice troppo corto)");
    expect(etichettaConteggio("tratteSenzaMadre")).not.toBe(etichettaConteggio("tratteScartate"));
  });

  it("l'etichetta dei legami scartati nomina entrambe le cause di scarto", () => {
    // parseLegame scarta sia i codici N sia i keyroggia troppo corti, e li
    // somma in un solo contatore: l'etichetta deve dirlo onestamente,
    // altrimenti l'utente legge una diagnosi che nomina solo la prima causa.
    expect(etichettaConteggio("legamiScartati")).toMatch(/codici N/i);
    expect(etichettaConteggio("legamiScartati")).toMatch(/troppo corto/i);
  });

  it("ripiega sulla chiave per una chiave sconosciuta", () => {
    expect(etichettaConteggio("boh")).toBe("boh");
  });

  it("traduce le chiavi diagnostiche della seconda gerarchia (rogge madri R)", () => {
    // Senza la mappa, "madriRogge" e le altre tre chiavi che eseguiGerarchiaRogge
    // produce comparirebbero grezze in Impostazioni, come "tratteScartate" prima.
    expect(etichettaConteggio("madriRogge")).toBe("Rogge madri (R)");
    expect(etichettaConteggio("tratteRogge")).toBe("Tratte delle rogge madri");
    expect(etichettaConteggio("roggeFiglieScartate")).toBe("Righe scartate dalla gerarchia R (codice non valido)");
    expect(etichettaConteggio("roggeFiglieSenzaMadre")).toBe("Tratte R senza madre in elenco (mostrate con madre «-»)");
  });
});

describe("riassumiConteggi", () => {
  it("compone la riga di riepilogo", () => {
    expect(riassumiConteggi({ madriImpianti: 45, conduttori: 3 })).toBe(
      "Impianti (aggreganti IM): 45 · Destinatari: 3",
    );
  });

  it("senza conteggi restituisce stringa vuota", () => {
    expect(riassumiConteggi({})).toBe("");
  });
});
