import { describe, it, expect } from "vitest";
import { componiRigheRoggeMadri, TRATTINO } from "@shared/righe-anagrafiche";

const MADRI = [
  { codice: "R02", name: "R02 - Roggia borgogna" },
  { codice: "R48", name: "R48 - Senza figlie" },
];

describe("componiRigheRoggeMadri", () => {
  it("una madre senza figlie compare con una figlia «-»", () => {
    const righe = componiRigheRoggeMadri([], MADRI);
    expect(righe.find((r) => r.codiceMadre === "R48")).toEqual({
      codiceMadre: "R48", descrizioneMadre: "R48 - Senza figlie",
      codiceFiglia: TRATTINO, descrizioneFiglia: TRATTINO, codiceMadreImpianto: null,
    });
  });

  it("una madre con figlie non riceve la riga «-»", () => {
    const righe = componiRigheRoggeMadri(
      [{ codiceMadre: "R02", codiceFiglia: "R02D01", descrizioneFiglia: "Fosso", codiceMadreImpianto: null }],
      MADRI,
    );
    expect(righe.filter((r) => r.codiceMadre === "R02").map((r) => r.codiceFiglia)).toEqual(["R02D01"]);
  });

  it("una figlia senza madre in elenco porta il prefisso come madre e «-» come descrizione", () => {
    const righe = componiRigheRoggeMadri(
      [{ codiceMadre: "R29", codiceFiglia: "R29D09S01", descrizioneFiglia: "Orfana", codiceMadreImpianto: "IM07A" }],
      MADRI,
    );
    expect(righe.find((r) => r.codiceFiglia === "R29D09S01")).toEqual({
      codiceMadre: "R29", descrizioneMadre: TRATTINO,
      codiceFiglia: "R29D09S01", descrizioneFiglia: "Orfana", codiceMadreImpianto: "IM07A",
    });
  });

  it("ordina per madre e poi per figlia: la riga «-» sta al posto della sua madre", () => {
    const righe = componiRigheRoggeMadri(
      [
        { codiceMadre: "R50", codiceFiglia: "R50D01", descrizioneFiglia: "b", codiceMadreImpianto: null },
        { codiceMadre: "R02", codiceFiglia: "R02D01", descrizioneFiglia: "a", codiceMadreImpianto: null },
      ],
      MADRI,
    );
    expect(righe.map((r) => `${r.codiceMadre}/${r.codiceFiglia}`)).toEqual(["R02/R02D01", "R48/-", "R50/R50D01"]);
  });
});
