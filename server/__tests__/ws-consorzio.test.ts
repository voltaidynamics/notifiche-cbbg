import { describe, it, expect } from "vitest";
import {
  parseMadreImpianto, parseMadreOrari, parseTrattaImpianto, parseTrattaOrari,
  parseLegame, prefissoMadre, tipoIrrigazioneRiconosciuto, parseConduttore,
  eGruppoDiConsegna, parseRoggiaMadre, parseRoggiaFiglia,
} from "@shared/ws-consorzio";

describe("parseMadreImpianto", () => {
  it("legge un impianto e ne ricava la categoria", () => {
    expect(parseMadreImpianto({
      codiceimpianto: "IM01A",
      codicetipoirrigazione: "2",
      name: "Impianto Bolgare Pioggia",
      tipoirrigazione: "Acque superficiali ed autonomia consortile",
    })).toEqual({
      codice: "IM01A",
      name: "Impianto Bolgare Pioggia",
      categoria: "rogge",
      tipoIrrigazione: "Acque superficiali ed autonomia consortile",
      origine: "impianti",
    });
  });

  it("un tipo irrigazione ignoto non fa sparire la madre", () => {
    // Perderla orfanerebbe le sue tratte, che hanno codice_madre NOT NULL.
    const m = parseMadreImpianto({ codiceimpianto: "IM99A", codicetipoirrigazione: "9", name: "x" });
    expect(m.codice).toBe("IM99A");
    expect(m.categoria).toBe("rogge");
  });
});

describe("parseMadreOrari", () => {
  it("le quattro madri S sono impianti per definizione", () => {
    expect(parseMadreOrari({ codicemadre: "S45", name: "S45 - Impianto fiume adda" })).toEqual({
      codice: "S45",
      name: "S45 - Impianto fiume adda",
      categoria: "impianti",
      tipoIrrigazione: null,
      origine: "orari",
    });
  });
});

describe("parseTrattaImpianto", () => {
  it("la madre di un codice R e' il suo impianto, non il suo prefisso", () => {
    expect(parseTrattaImpianto({
      codiceimpianto: "IM44A", keyroggia: "R34D02S01", name: "R.Trenzano I",
    })).toEqual({ keyroggia: "R34D02S01", name: "R.Trenzano I", codiceMadre: "IM44A" });
  });

  it("scarta le aggregazioni che non sono IM", () => {
    expect(parseTrattaImpianto({ codiceimpianto: "ZM09A", keyroggia: "Z12000000", name: "Z-Pozzo" })).toBeNull();
    expect(parseTrattaImpianto({ codiceimpianto: "NM24A", keyroggia: "N45D01001", name: "Comizio" })).toBeNull();
  });
});

describe("parseTrattaOrari", () => {
  it("per le S la madre e' il prefisso a 3", () => {
    expect(parseTrattaOrari({ keyroggia: "S02D00000", name: "Impianto Globale Pluvi" })).toEqual({
      keyroggia: "S02D00000", name: "Impianto Globale Pluvi", codiceMadre: "S02",
    });
  });

  it("torna null per un keyroggia troppo corto per avere una madre, non solleva", () => {
    // tratte.codice_madre e' NOT NULL: una tratta senza madre non puo'
    // esistere, quindi la riga si scarta com'e' gia' per parseTrattaImpianto
    // e parseLegame — non solleva piu' (vedi correzione post-revisione:
    // prima faceva fallire l'intera lettura dell'entita' in sync-all.ts).
    expect(parseTrattaOrari({ keyroggia: "S4", name: "Codice monco" })).toBeNull();
  });

  it("tiene i gruppi di consegna e scarta sfiati, scarichi, nodi e saracinesche", () => {
    // S45 mescola 63 gruppi (G in settima posizione) a 91 righe che non hanno
    // mai conduttori. Il consorzio ci ha chiesto di tenere solo i gruppi.
    expect(parseTrattaOrari({ keyroggia: "S45DA1G03", name: "G consegna 003" }))
      .toEqual({ keyroggia: "S45DA1G03", name: "G consegna 003", codiceMadre: "S45" });
    expect(parseTrattaOrari({ keyroggia: "S45DA1C01", name: "Scarico" })).toBeNull();
    expect(parseTrattaOrari({ keyroggia: "S45DA1F02", name: "Sfiato" })).toBeNull();
    expect(parseTrattaOrari({ keyroggia: "S45DA1N04", name: "Nodo" })).toBeNull();
    expect(parseTrattaOrari({ keyroggia: "S45DA1H07", name: "Saracinesca" })).toBeNull();
  });

  it("le tratte S con una cifra in settima posizione restano", () => {
    // S02, S08 e S30 non hanno NESSUN codice con la G, e i loro 363 legami
    // stanno tutti lì: la regola letterale «tieni solo i G» le cancellerebbe.
    expect(parseTrattaOrari({ keyroggia: "S02DA0002", name: "Consegna 2" }))
      .toEqual({ keyroggia: "S02DA0002", name: "Consegna 2", codiceMadre: "S02" });
    expect(parseTrattaOrari({ keyroggia: "S08D00000", name: "Globale" }))
      .toEqual({ keyroggia: "S08D00000", name: "Globale", codiceMadre: "S08" });
  });

  it("eGruppoDiConsegna distingue le due cause di scarto", () => {
    expect(eGruppoDiConsegna({ keyroggia: "S45DA1G03", name: "" })).toBe(true);
    expect(eGruppoDiConsegna({ keyroggia: "S02DA0002", name: "" })).toBe(true);
    expect(eGruppoDiConsegna({ keyroggia: "S45DA1C01", name: "" })).toBe(false);
    // Troppo corto: lo scarta l'altra regola, non questa.
    expect(eGruppoDiConsegna({ keyroggia: "S4", name: "" })).toBe(true);
  });
});

describe("parseLegame", () => {
  it("legge un legame live", () => {
    expect(parseLegame({ metodo: "live", keykey: "233", keyroggia: "S02DA0002" }, "live"))
      .toEqual({ keykey: "233", keyroggia: "S02DA0002", metodo: "live" });
  });

  it("il metodo di contesto vince sul campo, che dice 'cartoline'", () => {
    expect(parseLegame({ metodo: "cartoline", keykey: "11521", keyroggia: "R01D01S01" }, "stagione"))
      .toEqual({ keykey: "11521", keyroggia: "R01D01S01", metodo: "stagione" });
  });

  it("scarta i codici N, che il consorzio ci ha detto di ignorare", () => {
    expect(parseLegame({ metodo: "live", keykey: "1246", keyroggia: "N02D40003" }, "live")).toBeNull();
  });

  it("scarta un keyroggia troppo corto per avere una madre", () => {
    expect(parseLegame({ metodo: "live", keykey: "1", keyroggia: "R01" }, "live")).toBeNull();
  });
});

describe("parseRoggiaMadre", () => {
  it("legge una roggia madre R da 3", () => {
    expect(parseRoggiaMadre({ codicemadre: "R08", name: "R08 - Roggia serio e derivate" }))
      .toEqual({ codice: "R08", name: "R08 - Roggia serio e derivate" });
  });

  it("scarta un codice che non è una R da 3", () => {
    expect(parseRoggiaMadre({ codicemadre: "S45", name: "Adda" })).toBeNull();
    expect(parseRoggiaMadre({ codicemadre: "R080000", name: "Troppo lungo" })).toBeNull();
    expect(parseRoggiaMadre({ codicemadre: "R", name: "Troppo corto" })).toBeNull();
  });
});

describe("parseRoggiaFiglia", () => {
  it("la madre di una figlia R è il suo prefisso a 3, per questo endpoint", () => {
    expect(parseRoggiaFiglia({ keyroggia: "R08D02S01", name: "R.Serio Roggia Nuova Ramo A" }))
      .toEqual({ keyroggia: "R08D02S01", name: "R.Serio Roggia Nuova Ramo A", codiceMadre: "R08" });
  });

  it("tiene anche i codici con i +, che nessun impianto rivendica", () => {
    expect(parseRoggiaFiglia({ keyroggia: "R02D10+++", name: "Fosso Calcinate EX RONCAGLINO" }))
      .toEqual({ keyroggia: "R02D10+++", name: "Fosso Calcinate EX RONCAGLINO", codiceMadre: "R02" });
  });

  it("scarta ciò che non è una R o non ha abbastanza caratteri", () => {
    expect(parseRoggiaFiglia({ keyroggia: "S45DA1G03", name: "Adda" })).toBeNull();
    expect(parseRoggiaFiglia({ keyroggia: "R08", name: "È una madre" })).toBeNull();
  });
});

describe("prefissoMadre", () => {
  it("le prime 3 posizioni, e null sotto i 4 caratteri", () => {
    expect(prefissoMadre("R29D10+++")).toBe("R29");
    expect(prefissoMadre("R29")).toBeNull();
  });
});

describe("tipoIrrigazioneRiconosciuto", () => {
  it("distingue un tipo noto da uno che il consorzio ha aggiunto", () => {
    expect(tipoIrrigazioneRiconosciuto({ codiceimpianto: "IM01A", codicetipoirrigazione: "6", name: "x" })).toBe(true);
    expect(tipoIrrigazioneRiconosciuto({ codiceimpianto: "IM01A", codicetipoirrigazione: "9", name: "x" })).toBe(false);
  });
});

describe("parseConduttore", () => {
  const raw = {
    cellulare: "333555666777",
    dataconsenso: "10/01/1901",
    descrizione: "rossi mario",
    email: "email@email.com",
    flag: "*",
    keykey: "12179",
    tipo_email: "normale",
  };

  it("normalizes a full record", () => {
    expect(parseConduttore(raw)).toEqual({
      keykey: "12179",
      descrizione: "rossi mario",
      email: "email@email.com",
      cellulare: "333555666777",
      tipoEmail: "normale",
      flagAttivo: false, // flag "*" => inattivo
      dataConsenso: "10/01/1901",
    });
  });

  it("marks flagAttivo true when flag is not '*'", () => {
    expect(parseConduttore({ ...raw, flag: "" }).flagAttivo).toBe(true);
    expect(parseConduttore({ ...raw, flag: undefined }).flagAttivo).toBe(true);
  });

  it("maps tipo_email 'pec' (case-insensitive) and defaults to 'normale'", () => {
    expect(parseConduttore({ ...raw, tipo_email: "PEC" }).tipoEmail).toBe("pec");
    expect(parseConduttore({ ...raw, tipo_email: undefined }).tipoEmail).toBe("normale");
  });

  it("turns empty email/cellulare into null and coerces numeric keykey", () => {
    const out = parseConduttore({ ...raw, keykey: 12179, email: "  ", cellulare: "" });
    expect(out.keykey).toBe("12179");
    expect(out.email).toBeNull();
    expect(out.cellulare).toBeNull();
  });

  it("keeps a cellulare of '0' as the WS sent it", () => {
    // Il WS non lascia mai il campo vuoto: quando il numero non c'è scrive "0"
    // (2475 conduttori su 4963 nell'export di luglio 2026). Il mirror resta
    // una copia fedele e lo conserva; a nasconderlo pensa la lettura, con
    // numeroDestinatario() in shared/destinatari.ts.
    expect(parseConduttore({ ...raw, cellulare: "0" }).cellulare).toBe("0");
    expect(parseConduttore({ ...raw, cellulare: 0 }).cellulare).toBe("0");
  });
});
