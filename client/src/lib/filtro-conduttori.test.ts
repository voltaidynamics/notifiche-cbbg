import { describe, it, expect } from "vitest";
import { filtraConduttori, chiaviDi } from "./filtro-conduttori";

/** Il minimo che il filtro guarda: la pagina ci passa le sue `Row` intere. */
const riga = (keykey: string, descrizione: string, email: string | null) => ({
  conduttore: { keykey, descrizione, email },
});

const righe = [
  riga("C1", "Rossi Mario", "mario.rossi@example.com"),
  riga("C2", "Bianchi Anna", "anna@bianchi.it"),
  riga("C3", "Verdi Giuseppe", null),
];

describe("filtraConduttori", () => {
  it("con query vuota restituisce tutte le righe", () => {
    expect(filtraConduttori(righe, "")).toEqual(righe);
  });

  it("con query di soli spazi restituisce tutte le righe", () => {
    expect(filtraConduttori(righe, "   ")).toEqual(righe);
  });

  it("cerca nel nome ignorando le maiuscole", () => {
    expect(filtraConduttori(righe, "rOsSi")).toEqual([righe[0]]);
  });

  it("cerca anche nell'email", () => {
    expect(filtraConduttori(righe, "bianchi.it")).toEqual([righe[1]]);
  });

  it("trova a pezzo di parola, non solo a parola intera", () => {
    expect(filtraConduttori(righe, "ann")).toEqual([righe[1]]);
  });

  it("ignora gli spazi ai bordi della query", () => {
    expect(filtraConduttori(righe, "  verdi  ")).toEqual([righe[2]]);
  });

  it("tiene chi non ha email quando a corrispondere è il nome", () => {
    expect(filtraConduttori(righe, "giuseppe")).toEqual([righe[2]]);
  });

  it("non restituisce chi non ha email quando si cerca un'email", () => {
    expect(filtraConduttori(righe, "@example.com")).toEqual([righe[0]]);
  });

  it("restituisce l'elenco vuoto quando niente corrisponde", () => {
    expect(filtraConduttori(righe, "neri")).toEqual([]);
  });

  it("conserva l'ordine in cui le righe arrivano", () => {
    expect(filtraConduttori(righe, "i")).toEqual([righe[0], righe[1], righe[2]]);
  });
});

describe("chiaviDi", () => {
  it("restituisce le keykey delle righe passate", () => {
    expect(chiaviDi([righe[0], righe[2]])).toEqual(new Set(["C1", "C3"]));
  });

  it("su un elenco vuoto restituisce un insieme vuoto", () => {
    expect(chiaviDi([])).toEqual(new Set());
  });
});
