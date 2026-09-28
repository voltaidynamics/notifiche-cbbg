import { describe, it, expect } from "vitest";
import { snapshotConduttore } from "@shared/destinatari";

// Lo Storico cerca i destinatari per codice conduttore o per descrizione
// (richiesta del tester in issue #12). Entrambi vengono da questa fotografia,
// scattata al momento dell'invio: le anagrafiche cambiano a ogni sync, lo
// storico no. Se qui manca un campo, quel filtro non trova più nulla.

describe("snapshotConduttore", () => {
  it("porta il codice del consorzio come codice conduttore", () => {
    const s = snapshotConduttore({
      codiceConsorzio: "S45DA1G21",
      firstName: "Mario",
      lastName: "Rossi",
    });
    expect(s.keykey).toBe("S45DA1G21");
  });

  it("compone la descrizione da nome e cognome", () => {
    const s = snapshotConduttore({ firstName: "Mario", lastName: "Rossi" });
    expect(s.conduttoreDescrizione).toBe("Mario Rossi");
  });

  it("un codice assente è null, non stringa vuota", () => {
    // Una stringa vuota nel filtro `contiene` combacerebbe con qualunque
    // ricerca: meglio l'assenza dichiarata.
    expect(snapshotConduttore({ firstName: "Mario", lastName: "Rossi" }).keykey).toBeNull();
    expect(snapshotConduttore({ codiceConsorzio: "", firstName: "M", lastName: "R" }).keykey).toBeNull();
    expect(snapshotConduttore({ codiceConsorzio: "   ", firstName: "M", lastName: "R" }).keykey).toBeNull();
  });

  it("ripulisce gli spazi attorno al codice", () => {
    expect(snapshotConduttore({ codiceConsorzio: "  S45DA1G21 " }).keykey).toBe("S45DA1G21");
  });

  it("un conduttore con solo cognome non lascia spazi penzolanti", () => {
    expect(snapshotConduttore({ lastName: "Rossi" }).conduttoreDescrizione).toBe("Rossi");
    expect(snapshotConduttore({ firstName: "Mario" }).conduttoreDescrizione).toBe("Mario");
  });

  it("senza nome né cognome la descrizione è null", () => {
    expect(snapshotConduttore({}).conduttoreDescrizione).toBeNull();
    expect(snapshotConduttore({ firstName: "  ", lastName: "" }).conduttoreDescrizione).toBeNull();
  });

  it("regge i null del database senza inventarsi valori", () => {
    const s = snapshotConduttore({ codiceConsorzio: null, firstName: null, lastName: null });
    expect(s).toEqual({ keykey: null, conduttoreDescrizione: null });
  });
});
