import { describe, it, expect } from "vitest";
import { descriviFreschezza, SOGLIA_OBSOLETO_MS } from "./freschezza-anagrafiche";

const ADESSO = new Date("2026-07-27T10:00:00Z");

describe("descriviFreschezza", () => {
  it("senza alcun sync completato lo stato è 'assente'", () => {
    expect(descriviFreschezza(null, ADESSO).stato).toBe("assente");
    expect(descriviFreschezza({ finishedAt: null }, ADESSO).stato).toBe("assente");
  });

  it("una data non interpretabile vale come dato assente, non come dato fresco", () => {
    expect(descriviFreschezza({ finishedAt: "non-una-data" }, ADESSO).stato).toBe("assente");
  });

  it("un sync di poche ore fa è fresco", () => {
    const treOreFa = new Date(ADESSO.getTime() - 3 * 60 * 60 * 1000);
    expect(descriviFreschezza({ finishedAt: treOreFa }, ADESSO).stato).toBe("fresco");
  });

  it("oltre la soglia il dato è obsoleto", () => {
    const oltre = new Date(ADESSO.getTime() - SOGLIA_OBSOLETO_MS - 1000);
    expect(descriviFreschezza({ finishedAt: oltre }, ADESSO).stato).toBe("obsoleto");
  });

  it("esattamente sulla soglia il dato è ancora fresco", () => {
    const soglia = new Date(ADESSO.getTime() - SOGLIA_OBSOLETO_MS);
    expect(descriviFreschezza({ finishedAt: soglia }, ADESSO).stato).toBe("fresco");
  });

  // Un orologio server avanti rispetto al client (o viceversa) produrrebbe
  // un'età negativa: non deve mai essere letta come "obsoleto".
  it("una data nel futuro non è obsoleta", () => {
    const futuro = new Date(ADESSO.getTime() + 60 * 60 * 1000);
    expect(descriviFreschezza({ finishedAt: futuro }, ADESSO).stato).toBe("fresco");
  });

  it("il testo riporta data e ora quando il dato esiste", () => {
    const d = new Date("2026-07-27T07:30:00Z");
    expect(descriviFreschezza({ finishedAt: d }, ADESSO).quando).toMatch(/27\/07\/2026/);
  });

  it("senza dato il testo dice 'mai'", () => {
    expect(descriviFreschezza(null, ADESSO).quando).toBe("mai");
  });
});
