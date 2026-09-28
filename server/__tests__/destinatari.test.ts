import { describe, it, expect } from "vitest";
import {
  aggregaDestinatari,
  codiciTratte,
  descrizioniTratte,
  separaTratte,
  numeroDestinatario,
  haNumero,
  type CoppiaDestinatario,
} from "@shared/destinatari";
import { normalizzaSegmentIds } from "../routes";

interface Conduttore {
  keykey: string;
  descrizione: string;
}

const c = (keykey: string): Conduttore => ({ keykey, descrizione: `Conduttore ${keykey}` });

const coppia = (
  keykey: string,
  keyroggia: string | null,
  roggiaDescrizione?: string,
): CoppiaDestinatario<Conduttore> => ({ conduttore: c(keykey), keyroggia, roggiaDescrizione });

const chiave = (x: Conduttore) => x.keykey;

describe("aggregaDestinatari", () => {
  it("il conduttore legato a due tratte selezionate è un destinatario solo", () => {
    const out = aggregaDestinatari(
      [coppia("233", "S45D00001"), coppia("233", "S45D00002")],
      chiave,
    );
    expect(out).toHaveLength(1);
    expect(out[0].tratte.map((t) => t.keyroggia)).toEqual(["S45D00001", "S45D00002"]);
  });

  it("le tratte di un destinatario sono ordinate per codice", () => {
    const out = aggregaDestinatari(
      [coppia("233", "S45D00009"), coppia("233", "R01D01000"), coppia("233", "S02DA0002")],
      chiave,
    );
    expect(out[0].tratte.map((t) => t.keyroggia)).toEqual([
      "R01D01000",
      "S02DA0002",
      "S45D00009",
    ]);
  });

  it("la stessa tratta ripetuta non viene elencata due volte", () => {
    const out = aggregaDestinatari(
      [coppia("233", "S45D00001"), coppia("233", "S45D00001")],
      chiave,
    );
    expect(out[0].tratte).toHaveLength(1);
  });

  it("conduttori diversi restano destinatari distinti", () => {
    const out = aggregaDestinatari(
      [coppia("233", "S45D00001"), coppia("999", "S45D00001")],
      chiave,
    );
    expect(out.map((d) => d.conduttore.keykey)).toEqual(["233", "999"]);
  });

  it("l'ordine di uscita è quello di prima comparsa", () => {
    const out = aggregaDestinatari(
      [coppia("999", "S45D00002"), coppia("233", "S45D00001"), coppia("999", "S45D00001")],
      chiave,
    );
    expect(out.map((d) => d.conduttore.keykey)).toEqual(["999", "233"]);
  });

  it("nessuna coppia, nessun destinatario", () => {
    expect(aggregaDestinatari<Conduttore>([], chiave)).toEqual([]);
  });
});

describe("codiciTratte / descrizioniTratte", () => {
  it("uniscono più tratte in un unico campo di snapshot", () => {
    const [d] = aggregaDestinatari(
      [coppia("233", "S45D00001", "Consegna 1"), coppia("233", "S45D00002", "Consegna 2")],
      chiave,
    );
    expect(codiciTratte(d.tratte)).toBe("S45D00001, S45D00002");
    expect(descrizioniTratte(d.tratte)).toBe("Consegna 1, Consegna 2");
  });

  it("una tratta senza codice non lascia separatori vuoti", () => {
    const [d] = aggregaDestinatari([coppia("233", null), coppia("233", "S45D00002")], chiave);
    expect(codiciTratte(d.tratte)).toBe("S45D00002");
  });

  it("senza codici né descrizioni restituiscono null", () => {
    const [d] = aggregaDestinatari([coppia("233", null)], chiave);
    expect(codiciTratte(d.tratte)).toBeNull();
    expect(descrizioniTratte(d.tratte)).toBeNull();
  });
});

describe("separaTratte", () => {
  it("rilegge i codici scritti da codiciTratte", () => {
    expect(separaTratte("S45D00001, S45D00002")).toEqual(["S45D00001", "S45D00002"]);
  });
  it("regge il campo vuoto o assente", () => {
    expect(separaTratte(null)).toEqual([]);
    expect(separaTratte("")).toEqual([]);
  });
});

describe("normalizzaSegmentIds", () => {
  it("accetta la selezione multipla", () => {
    expect(normalizzaSegmentIds([1, 2, 3], undefined)).toEqual([1, 2, 3]);
  });
  it("scarta i duplicati: la stessa tratta due volte non raddoppia i destinatari", () => {
    expect(normalizzaSegmentIds([1, "1", 2], undefined)).toEqual([1, 2]);
  });
  it("continua ad accettare il vecchio segmentId singolo", () => {
    expect(normalizzaSegmentIds(undefined, "7")).toEqual([7]);
  });
  it("scarta i valori non numerici", () => {
    expect(normalizzaSegmentIds(["abc", 4], undefined)).toEqual([4]);
  });
  it("nessuna tratta indicata, nessun id", () => {
    expect(normalizzaSegmentIds(undefined, undefined)).toEqual([]);
    expect(normalizzaSegmentIds(undefined, "")).toEqual([]);
  });
});

describe("numeroDestinatario", () => {
  it("legge lo '0' del WS come numero assente", () => {
    // Il consorzio non lascia mai il campo vuoto: quando il cellulare non c'è
    // scrive "0". Nel mirror resta com'è (copia fedele), ma non è un recapito:
    // né da mostrare in anagrafica né a cui mandare un SMS.
    expect(numeroDestinatario("0")).toBeNull();
    expect(numeroDestinatario(" 000 ")).toBeNull();
  });

  it("tiene un numero che comincia per zero", () => {
    expect(numeroDestinatario("0350123456")).toBe("0350123456");
  });

  it("tiene un cellulare normale e regge il campo assente", () => {
    expect(numeroDestinatario("3331234567")).toBe("3331234567");
    expect(numeroDestinatario(null)).toBeNull();
    expect(numeroDestinatario("  ")).toBeNull();
  });
});

describe("haNumero", () => {
  it("dice sì solo dove c'è un recapito vero", () => {
    // È la condizione con cui «Invia notifica» mostra il badge SMS accanto al
    // canale di posta: se dicesse sì sullo "0" del WS, la colonna prometterebbe
    // un SMS a metà anagrafica e il conteggio sotto la spunta la smentirebbe.
    expect(haNumero("3331234567")).toBe(true);
    expect(haNumero("0350123456")).toBe(true);
    expect(haNumero("0")).toBe(false);
    expect(haNumero("  ")).toBe(false);
    expect(haNumero(null)).toBe(false);
    expect(haNumero(undefined)).toBe(false);
  });
});
