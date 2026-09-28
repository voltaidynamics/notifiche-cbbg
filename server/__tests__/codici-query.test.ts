import { describe, it, expect } from "vitest";
import { leggiCodici, TroppiCodici, MAX_CODICI_QUERY } from "../codici-query";

describe("leggiCodici", () => {
  it("separa, ripulisce e normalizza", () => {
    expect(leggiCodici("s45da1c01, S45DA1C02 ,")).toEqual(["S45DA1C01", "S45DA1C02"]);
  });

  it("un parametro assente è una selezione vuota, non un errore", () => {
    expect(leggiCodici(undefined)).toEqual([]);
    expect(leggiCodici("")).toEqual([]);
    expect(leggiCodici(",,  ,")).toEqual([]);
  });

  it("toglie i duplicati", () => {
    expect(leggiCodici("R01D01000,r01d01000")).toEqual(["R01D01000"]);
  });

  it("accetta fino al tetto", () => {
    const codici = Array.from({ length: MAX_CODICI_QUERY }, (_, i) => `S45DA${String(i).padStart(4, "0")}`);
    expect(leggiCodici(codici.join(","))).toHaveLength(MAX_CODICI_QUERY);
  });

  it("oltre il tetto solleva, così la rotta risponde 400 invece di far esplodere la URL", () => {
    const codici = Array.from({ length: MAX_CODICI_QUERY + 1 }, (_, i) => `S45DA${String(i).padStart(4, "0")}`);
    expect(() => leggiCodici(codici.join(","))).toThrow(TroppiCodici);
  });

  it("il tetto guarda i codici letti, non quelli rimasti dopo la deduplica", () => {
    // Sono tutti uguali: dedotti sarebbero uno solo, ma la URL è lunga lo stesso.
    const codici = Array.from({ length: MAX_CODICI_QUERY + 1 }, () => "S45DA1C01");
    expect(() => leggiCodici(codici.join(","))).toThrow(TroppiCodici);
  });
});
