import { describe, it, expect } from "vitest";
import { filtraRighe, ordinaRighe } from "./data-table";

const RIGHE = [
  { codice: "R02", descrizione: "Molinara", numero: "331" },
  { codice: "R01", descrizione: "Comuna", numero: null },
  { codice: "R10", descrizione: "comuna bassa", numero: "332" },
];

describe("filtraRighe", () => {
  it("senza filtri restituisce tutte le righe", () => {
    expect(filtraRighe(RIGHE, {}).length).toBe(3);
  });

  it("ignora i filtri vuoti o di soli spazi", () => {
    expect(filtraRighe(RIGHE, { codice: "", descrizione: "   " }).length).toBe(3);
  });

  it("filtra per sottostringa senza distinguere maiuscole", () => {
    expect(filtraRighe(RIGHE, { descrizione: "COMUNA" }).map((r) => r.codice))
      .toEqual(["R01", "R10"]);
  });

  it("combina più filtri in AND", () => {
    expect(filtraRighe(RIGHE, { descrizione: "comuna", codice: "R1" }).map((r) => r.codice))
      .toEqual(["R10"]);
  });

  it("tratta null come stringa vuota e lo esclude da una ricerca non vuota", () => {
    expect(filtraRighe(RIGHE, { numero: "33" }).length).toBe(2);
  });

  it("cerca le parole in qualunque ordine, non la stringa intera", () => {
    // Richiesta del consorzio (24/09/2026): «rossi mario» deve trovare
    // «Mario Rossi», non solo chi scrive nell'ordine cognome nome.
    const persone = [
      { descrizione: "Rossi Mario" },
      { descrizione: "Rossi Giuseppe" },
      { descrizione: "Mariotti Anna" },
    ];
    expect(filtraRighe(persone, { descrizione: "mario rossi" }).map((r) => r.descrizione))
      .toEqual(["Rossi Mario"]);
    expect(filtraRighe(persone, { descrizione: "  rossi   mario " }).map((r) => r.descrizione))
      .toEqual(["Rossi Mario"]);
  });

  it("ogni parola deve comparire: una sola mancante esclude la riga", () => {
    expect(filtraRighe(RIGHE, { descrizione: "comuna alta" })).toEqual([]);
  });

  it("restituisce array vuoto se nessuna riga corrisponde", () => {
    expect(filtraRighe(RIGHE, { codice: "ZZZ" })).toEqual([]);
  });
});

describe("ordinaRighe", () => {
  it("senza chiave lascia l'ordine invariato", () => {
    expect(ordinaRighe(RIGHE, null, true).map((r) => r.codice)).toEqual(["R02", "R01", "R10"]);
  });

  it("ordina in modo crescente", () => {
    expect(ordinaRighe(RIGHE, "codice", true).map((r) => r.codice)).toEqual(["R01", "R02", "R10"]);
  });

  it("ordina in modo decrescente", () => {
    expect(ordinaRighe(RIGHE, "codice", false).map((r) => r.codice)).toEqual(["R10", "R02", "R01"]);
  });

  it("non distingue maiuscole e minuscole", () => {
    expect(ordinaRighe(RIGHE, "descrizione", true).map((r) => r.codice)).toEqual(["R01", "R10", "R02"]);
  });

  it("mette i valori nulli in fondo in entrambe le direzioni", () => {
    expect(ordinaRighe(RIGHE, "numero", true)[2].numero).toBeNull();
    expect(ordinaRighe(RIGHE, "numero", false)[2].numero).toBeNull();
  });

  it("non modifica l'array di partenza", () => {
    const copia = [...RIGHE];
    ordinaRighe(RIGHE, "codice", true);
    expect(RIGHE).toEqual(copia);
  });

  it("non modifica l'array di partenza anche con chiave nulla e ne restituisce una copia distinta", () => {
    const copia = [...RIGHE];
    const risultato = ordinaRighe(RIGHE, null, true);
    expect(RIGHE).toEqual(copia);
    expect(risultato).toEqual(RIGHE);
    expect(risultato).not.toBe(RIGHE);
  });
});
