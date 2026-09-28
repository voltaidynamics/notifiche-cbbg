import { describe, it, expect } from "vitest";
import { toggleTratta, toggleMadre, selezionaTutte, madriComplete, comprimiPerAnteprima, madriDellaSezione } from "./selezione-tratte";

const TRATTE = [
  { keyroggia: "R01D01000", codicemadre: "R01" },
  { keyroggia: "R01D02000", codicemadre: "R01" },
  { keyroggia: "R02D01000", codicemadre: "R02" },
  { keyroggia: "R02D02S02", codicemadre: "R02" },
];

// Codici troppo corti perché una madre esista.
const SENZA_MADRE = [
  { keyroggia: "P17", codicemadre: "" },
  { keyroggia: "P22", codicemadre: "" },
  { keyroggia: "P30", codicemadre: null },
];

describe("toggleTratta", () => {
  it("accende una tratta spenta", () => {
    const next = toggleTratta(new Set(), "R01D01000");
    expect(Array.from(next)).toEqual(["R01D01000"]);
  });
  it("spegne una tratta accesa", () => {
    const next = toggleTratta(new Set(["R01D01000", "R02D01000"]), "R01D01000");
    expect(Array.from(next)).toEqual(["R02D01000"]);
  });
  it("non muta l'insieme in ingresso", () => {
    const sel = new Set(["R01D01000"]);
    toggleTratta(sel, "R02D01000");
    expect(Array.from(sel)).toEqual(["R01D01000"]);
  });
});

describe("toggleMadre", () => {
  it("accende tutte le tratte della madre", () => {
    const next = toggleMadre(new Set(), TRATTE, "R01");
    expect(Array.from(next).sort()).toEqual(["R01D01000", "R01D02000"]);
  });
  it("se erano già tutte accese, le spegne", () => {
    const sel = new Set(["R01D01000", "R01D02000"]);
    const next = toggleMadre(sel, TRATTE, "R01");
    expect(Array.from(next)).toEqual([]);
  });
  it("non tocca le tratte di un'altra madre", () => {
    const sel = new Set(["R02D01000"]);
    const next = toggleMadre(sel, TRATTE, "R01");
    expect(Array.from(next).sort()).toEqual(["R01D01000", "R01D02000", "R02D01000"]);
  });
  it("accende solo le tratte già accese di una madre non le spegne del tutto: parziale conta come 'non tutte'", () => {
    const sel = new Set(["R01D01000"]);
    const next = toggleMadre(sel, TRATTE, "R01");
    expect(Array.from(next).sort()).toEqual(["R01D01000", "R01D02000"]);
  });
  it("una madre senza tratte in elenco non fa nulla", () => {
    const sel = new Set(["R01D01000"]);
    const next = toggleMadre(sel, TRATTE, "R99");
    expect(Array.from(next)).toEqual(["R01D01000"]);
  });
  it("non muta l'insieme in ingresso", () => {
    const sel = new Set(["R02D01000"]);
    toggleMadre(sel, TRATTE, "R01");
    expect(Array.from(sel)).toEqual(["R02D01000"]);
  });
});

describe("selezionaTutte", () => {
  it("prende tutto l'elenco", () => {
    const next = selezionaTutte(TRATTE);
    expect(Array.from(next).sort()).toEqual([
      "R01D01000", "R01D02000", "R02D01000", "R02D02S02",
    ]);
  });
  it("seleziona anche le voci senza madre", () => {
    const next = selezionaTutte(SENZA_MADRE);
    expect(Array.from(next).sort()).toEqual(["P17", "P22", "P30"]);
  });
  it("non muta l'array in ingresso", () => {
    const copia = TRATTE.map((t) => ({ ...t }));
    selezionaTutte(TRATTE);
    expect(TRATTE).toEqual(copia);
  });
});

describe("madriComplete", () => {
  it("una madre con tutte le tratte spuntate e' completa", () => {
    expect(madriComplete(["R01D01000", "R01D02000", "R02D01000"], TRATTE)).toEqual(["R01"]);
  });
  it("una madre con una tratta sola spuntata non lo e'", () => {
    expect(madriComplete(["R01D01000"], TRATTE)).toEqual([]);
  });
  it("le voci senza madre non formano una madre completa", () => {
    expect(madriComplete(["P17", "P22", "P30"], SENZA_MADRE)).toEqual([]);
  });
  it("una selezione vuota non completa niente", () => {
    expect(madriComplete([], TRATTE)).toEqual([]);
  });
});

describe("comprimiPerAnteprima", () => {
  it("una madre completa va in madri e le sue tratte spariscono da tratte", () => {
    const c = comprimiPerAnteprima(["R01D01000", "R01D02000", "R02D01000"], [], TRATTE);
    expect(c).toEqual({ tratte: ["R02D01000"], madri: ["R01"] });
  });
  it("una madre incompleta lascia le sue tratte intatte", () => {
    const c = comprimiPerAnteprima(["R01D01000", "R02D01000"], [], TRATTE);
    expect(c).toEqual({ tratte: ["R01D01000", "R02D01000"], madri: [] });
  });
  it("le madri gia' selezionate (i pozzi) restano", () => {
    const c = comprimiPerAnteprima([], ["R10"], TRATTE);
    expect(c).toEqual({ tratte: [], madri: ["R10"] });
  });
  it("tutte le madri complete: nessuna tratta resta in query", () => {
    const tutte = TRATTE.map((t) => t.keyroggia);
    const c = comprimiPerAnteprima(tutte, [], TRATTE);
    expect(c).toEqual({ tratte: [], madri: ["R01", "R02"] });
  });
  it("nessun doppione: una madre gia' in madri e completa compare una volta, una tratta ripetuta una volta", () => {
    const c = comprimiPerAnteprima(
      ["R01D01000", "R01D02000", "R02D01000", "R02D01000"],
      ["R01"],
      TRATTE,
    );
    expect(c).toEqual({ tratte: ["R02D01000"], madri: ["R01"] });
  });
  it("una tratta fuori elenco resta una tratta", () => {
    const c = comprimiPerAnteprima(["R01D01000", "R01D02000", "X99D99999"], [], TRATTE);
    expect(c).toEqual({ tratte: ["X99D99999"], madri: ["R01"] });
  });
  it("non muta gli array in ingresso", () => {
    const tratte = ["R01D01000", "R01D02000"];
    const madri = ["R10"];
    comprimiPerAnteprima(tratte, madri, TRATTE);
    expect(tratte).toEqual(["R01D01000", "R01D02000"]);
    expect(madri).toEqual(["R10"]);
  });
});

describe("madriDellaSezione", () => {
  const MADRI = [
    { codicemadre: "IM01A", categoria: "rogge", origine: "impianti" },
    { codicemadre: "R28", categoria: "rogge", origine: "servizio" },
    { codicemadre: "IM27A", categoria: "pozzi", origine: "impianti" },
    { codicemadre: "S45", categoria: "impianti", origine: "orari" },
  ];

  it("tiene le madri della categoria scelta", () => {
    expect(madriDellaSezione(MADRI, "pozzi").map((m) => m.codicemadre)).toEqual(["IM27A"]);
    expect(madriDellaSezione(MADRI, "impianti").map((m) => m.codicemadre)).toEqual(["S45"]);
  });

  it("toglie le madri di servizio: in Scorrimento restano i soli codici IM", () => {
    expect(madriDellaSezione(MADRI, "rogge").map((m) => m.codicemadre)).toEqual(["IM01A"]);
  });
});
