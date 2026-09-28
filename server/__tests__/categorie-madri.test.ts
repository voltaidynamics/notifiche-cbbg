import { describe, it, expect } from "vitest";
import { categoriaDaTipoIrrigazione } from "@shared/categorie-madri";

describe("categoriaDaTipoIrrigazione", () => {
  it("mappa i sei codici del consorzio", () => {
    expect(categoriaDaTipoIrrigazione("1")).toBe("rogge");
    expect(categoriaDaTipoIrrigazione("2")).toBe("rogge");
    expect(categoriaDaTipoIrrigazione("3")).toBe("pozzi");
    expect(categoriaDaTipoIrrigazione("4")).toBe("pozzi");
    expect(categoriaDaTipoIrrigazione("5")).toBe("pozzi");
    expect(categoriaDaTipoIrrigazione("6")).toBe("impianti");
  });

  it("tollera spazi e valori numerici già convertiti", () => {
    expect(categoriaDaTipoIrrigazione(" 6 ")).toBe("impianti");
  });

  it("il tipo 4 è un pozzo, non una roggia", () => {
    // Correzione del consorzio (mail del 16/09/2026): sposta IM11A e IM12A.
    expect(categoriaDaTipoIrrigazione("4")).toBe("pozzi");
  });

  it("restituisce null per un codice che il consorzio non ha ancora usato", () => {
    expect(categoriaDaTipoIrrigazione("7")).toBeNull();
    expect(categoriaDaTipoIrrigazione("")).toBeNull();
  });
});
