// I due legami del consorzio (issue #27).

import { describe, it, expect } from "vitest";
import {
  TIPI_LEGAME, ETICHETTE_LEGAME, COLORI_LEGAME, isTipoLegame, validaLegame,
} from "@shared/legame";

describe("tipi di legame", () => {
  it("sono i due valori di associazioni.metodo", () => {
    expect(TIPI_LEGAME).toEqual(["live", "stagione"]);
  });

  it("ogni tipo ha etichetta e colore", () => {
    for (const t of TIPI_LEGAME) {
      expect(ETICHETTE_LEGAME[t]).toBeTruthy();
      expect(COLORI_LEGAME[t]).toBeTruthy();
    }
  });

  it("l'etichetta della stagione è quella della issue", () => {
    expect(ETICHETTE_LEGAME.stagione).toBe("Stagione irrigua");
  });

  it("i colori non collidono fra loro", () => {
    expect(COLORI_LEGAME.live).not.toBe(COLORI_LEGAME.stagione);
  });
});

describe("validaLegame", () => {
  it("accetta i due codici", () => {
    expect(validaLegame("live")).toBe("live");
    expect(validaLegame("stagione")).toBe("stagione");
  });

  it("rifiuta l'etichetta al posto del codice", () => {
    // È la trappola della issue, che scrive "stagione irrigua": quella è
    // l'etichetta, in colonna va il codice del mirror.
    expect(validaLegame("stagione irrigua")).toBeNull();
    expect(validaLegame("Stagione irrigua")).toBeNull();
  });

  it("rifiuta assenza, tipi sbagliati e valori fuori elenco", () => {
    expect(validaLegame(undefined)).toBeNull();
    expect(validaLegame(null)).toBeNull();
    expect(validaLegame("")).toBeNull();
    expect(validaLegame(3)).toBeNull();
    expect(validaLegame("LIVE")).toBeNull();
  });

  it("isTipoLegame restringe il tipo", () => {
    const v: unknown = "live";
    expect(isTipoLegame(v)).toBe(true);
    expect(isTipoLegame("boh")).toBe(false);
  });
});
