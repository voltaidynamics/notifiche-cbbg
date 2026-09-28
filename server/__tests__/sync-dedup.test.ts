import { describe, it, expect } from "vitest";
import { dedupByKey } from "../sync/dedup";

describe("dedupByKey", () => {
  it("restituisce l'array invariato se non ci sono duplicati", () => {
    const righe = [{ k: "a" }, { k: "b" }];
    expect(dedupByKey(righe, (r) => r.k)).toEqual([{ k: "a" }, { k: "b" }]);
  });

  it("tiene l'ultima occorrenza di una chiave duplicata", () => {
    const righe = [
      { k: "a", v: 1 },
      { k: "b", v: 2 },
      { k: "a", v: 3 },
    ];
    expect(dedupByKey(righe, (r) => r.k)).toEqual([
      { k: "a", v: 3 },
      { k: "b", v: 2 },
    ]);
  });

  it("preserva l'ordine di prima apparizione", () => {
    const righe = [{ k: "b" }, { k: "a" }, { k: "b" }];
    expect(dedupByKey(righe, (r) => r.k).map((r) => r.k)).toEqual(["b", "a"]);
  });

  it("gestisce chiavi composte", () => {
    const righe = [
      { a: "1", b: "x", m: "live" },
      { a: "1", b: "x", m: "stagione" },
      { a: "1", b: "x", m: "live" },
    ];
    const out = dedupByKey(righe, (r) => `${r.a}|${r.b}|${r.m}`);
    expect(out.length).toBe(2);
  });

  it("restituisce array vuoto per input vuoto", () => {
    expect(dedupByKey([], (r: { k: string }) => r.k)).toEqual([]);
  });
});
