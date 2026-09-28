import { describe, it, expect } from "vitest";
import { componiGerarchia, nomiDiGerarchia } from "@shared/gerarchia-rogge";

const MADRI = [
  { codice: "R02", name: "R02 - Roggia borgogna e derivate" },
  { codice: "R08", name: "R08 - Roggia serio e derivate" },
];

describe("componiGerarchia", () => {
  it("tiene le figlie la cui madre è in elenco", () => {
    const { gerarchia, senzaMadre } = componiGerarchia(MADRI, [
      { keyroggia: "R02D10+++", name: "Fosso Calcinate", codiceMadre: "R02" },
      { keyroggia: "R08D02S01", name: "Roggia Nuova A", codiceMadre: "R08" },
    ]);
    expect(senzaMadre).toBe(0);
    expect(gerarchia.madri.length).toBe(2);
    expect(gerarchia.tratte.map((t) => t.keyroggia)).toEqual(["R02D10+++", "R08D02S01"]);
  });

  it("tiene e conta le figlie di una madre che il consorzio non elenca", () => {
    // Richiesta del consorzio (24/09/2026): una figlia senza madre si mostra in
    // Anagrafiche con la madre ricavata dalle prime 3 cifre e la descrizione
    // «-». La madre non si inventa: resta assente da `madri_rogge`, quindi in
    // Invia notifica la figlia non è selezionabile.
    const { gerarchia, senzaMadre } = componiGerarchia(MADRI, [
      { keyroggia: "R08D02S01", name: "Roggia Nuova A", codiceMadre: "R08" },
      { keyroggia: "R29D09S01", name: "Orfana", codiceMadre: "R29" },
    ]);
    expect(senzaMadre).toBe(1);
    expect(gerarchia.tratte.map((t) => t.keyroggia)).toEqual(["R08D02S01", "R29D09S01"]);
    expect(gerarchia.madri.map((m) => m.codice)).toEqual(["R02", "R08"]);
  });

  it("toglie i doppioni di madri e figlie", () => {
    const { gerarchia } = componiGerarchia(
      MADRI.concat([{ codice: "R02", name: "doppione" }]),
      [
        { keyroggia: "R02D10+++", name: "a", codiceMadre: "R02" },
        { keyroggia: "R02D10+++", name: "b", codiceMadre: "R02" },
      ],
    );
    expect(gerarchia.madri.length).toBe(2);
    expect(gerarchia.tratte.length).toBe(1);
  });

  it("tiene la prima delle madri ripetute, e le conta", () => {
    // Nell'elenco del 22/09/2026 cinque codici arrivano due volte con nomi
    // diversi. Scegliere in silenzio fra i due nomi che il consorzio dà allo
    // stesso codice è la cosa che nessuno verrebbe mai a sapere: il conteggio
    // è l'unico modo perché qualcuno chieda quale dei due vale.
    const { gerarchia, madriDuplicate } = componiGerarchia(
      [
        { codice: "R32", name: "R32 - Comprensorio canale adda" },
        { codice: "R32", name: "R32 - Roggia morla di comun nuovo e spirano" },
        { codice: "R08", name: "R08 - Roggia serio e derivate" },
      ],
      [],
    );
    expect(madriDuplicate).toBe(1);
    expect(gerarchia.madri.map((m) => m.name)).toEqual([
      "R32 - Comprensorio canale adda",
      "R08 - Roggia serio e derivate",
    ]);
  });
});

describe("nomiDiGerarchia", () => {
  it("dà i due dizionari che servono ai nomi di servizio", () => {
    const { gerarchia } = componiGerarchia(MADRI, [
      { keyroggia: "R02D10+++", name: "Fosso Calcinate", codiceMadre: "R02" },
    ]);
    const nomi = nomiDiGerarchia(gerarchia);
    expect(nomi.madri["R02"]).toBe("R02 - Roggia borgogna e derivate");
    expect(nomi.tratte["R02D10+++"]).toBe("Fosso Calcinate");
  });
});
