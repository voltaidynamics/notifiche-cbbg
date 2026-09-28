import { describe, it, expect } from "vitest";
import {
  statoDi, periodiDiChiusura, componiStati, tratteChiuse, risolviStato,
  componiRispostaStato,
  type EventoStato, type MadriDiTratte,
} from "@shared/stato-rogge";

/**
 * Lo stato aperta/chiusa delle rogge (issue #22).
 *
 * La regola non è scritta in nessuna colonna: si ricava dagli eventi, cioè
 * dalle selezioni delle notifiche già spedite. Questi test sono l'unico posto
 * dove le transizioni scomode — riaperture, chiusure ripetute, ereditarietà
 * dalla madre — hanno una risposta verificabile.
 */

let seq = 0;
function ev(over: Partial<EventoStato> & { codice: string; tipo: EventoStato["tipo"] }): EventoStato {
  seq += 1;
  return {
    id: seq,
    notificaId: seq,
    livello: over.codice.length <= 3 ? "madre" : "tratta",
    quando: new Date("2026-08-01T08:00:00Z"),
    descrizione: null,
    ...over,
  } as EventoStato;
}

const il = (giorno: number) => new Date(`2026-08-${String(giorno).padStart(2, "0")}T08:00:00Z`);

// La madre non e' piu' il prefisso: qui la teniamo comunque uguale al
// prefisso solo perche' e' comoda per i test, non perche' lo sia per regola.
const MADRI: MadriDiTratte = {
  "R01D01000": "R01",
  "R01D02000": "R01",
  "R02D01000": "R02",
  "R10DA0001": "R10",
};

describe("statoDi", () => {
  it("un codice mai nominato è aperto", () => {
    expect(statoDi("R01D01000", "tratta", [], MADRI)).toEqual({
      stato: "aperta", chiusaDal: null, notificaId: null, chiusaDaCodice: null,
    });
  });

  it("una chiusura chiude, e dice da quando e con quale notifica", () => {
    const eventi = [ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3), notificaId: 7 })];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI)).toEqual({
      stato: "chiusa", chiusaDal: il(3), notificaId: 7, chiusaDaCodice: "R01D01000",
    });
  });

  it("una chiusura seguita da un'apertura riapre", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3) }),
      ev({ codice: "R01D01000", tipo: "apertura", quando: il(5) }),
    ];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI).stato).toBe("aperta");
  });

  it("un'apertura su un codice già aperto non cambia niente", () => {
    const eventi = [ev({ codice: "R01D01000", tipo: "apertura", quando: il(3) })];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI).stato).toBe("aperta");
  });

  it("una chiusura ripetuta NON azzera il periodo: resta la data della prima", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3), notificaId: 7 }),
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(6), notificaId: 9 }),
    ];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI)).toMatchObject({
      stato: "chiusa", chiusaDal: il(3), notificaId: 7,
    });
  });

  it("'altro' non muove lo stato", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3) }),
      ev({ codice: "R01D01000", tipo: "altro", quando: il(5) }),
    ];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI).stato).toBe("chiusa");
  });

  it("la chiusura della madre chiude anche la figlia", () => {
    const eventi = [ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) })];
    expect(statoDi("R10DA0001", "tratta", eventi, MADRI)).toMatchObject({
      stato: "chiusa", chiusaDaCodice: "R10",
    });
  });

  it("l'apertura della madre riapre una figlia chiusa singolarmente", () => {
    const eventi = [
      ev({ codice: "R10DA0001", tipo: "chiusura", quando: il(3) }),
      ev({ codice: "R10", livello: "madre", tipo: "apertura", quando: il(5) }),
    ];
    expect(statoDi("R10DA0001", "tratta", eventi, MADRI).stato).toBe("aperta");
  });

  it("una figlia chiusa dopo l'apertura della madre resta chiusa", () => {
    const eventi = [
      ev({ codice: "R10", livello: "madre", tipo: "apertura", quando: il(3) }),
      ev({ codice: "R10DA0001", tipo: "chiusura", quando: il(5) }),
    ];
    expect(statoDi("R10DA0001", "tratta", eventi, MADRI).stato).toBe("chiusa");
  });

  it("lo stato di una madre guarda solo il proprio codice, non le figlie", () => {
    const eventi = [ev({ codice: "R10DA0001", tipo: "chiusura", quando: il(3) })];
    expect(statoDi("R10", "madre", eventi, MADRI).stato).toBe("aperta");
  });

  it("a parità di istante decide l'id: vince l'evento inserito dopo", () => {
    const eventi = [
      { id: 2, notificaId: 2, codice: "R01D01000", livello: "tratta" as const, tipo: "apertura" as const, quando: il(3), descrizione: null },
      { id: 1, notificaId: 1, codice: "R01D01000", livello: "tratta" as const, tipo: "chiusura" as const, quando: il(3), descrizione: null },
    ];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI).stato).toBe("aperta");
  });

  it("non si lascia confondere dagli eventi di un altro codice", () => {
    const eventi = [ev({ codice: "R01D02000", tipo: "chiusura", quando: il(3) })];
    expect(statoDi("R01D01000", "tratta", eventi, MADRI).stato).toBe("aperta");
  });

  it("una tratta che la mappa non conosce non eredita da nessuno", () => {
    const eventi = [ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) })];
    expect(statoDi("R99D99000", "tratta", eventi, MADRI).stato).toBe("aperta");
  });
});

describe("periodiDiChiusura", () => {
  it("restituisce l'intervallo chiuso con la sua apertura", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3), notificaId: 7 }),
      ev({ codice: "R01D01000", tipo: "apertura", quando: il(5), notificaId: 8 }),
    ];
    expect(periodiDiChiusura("R01D01000", "tratta", eventi, MADRI)).toEqual([
      { dal: il(3), codiceChiusura: "R01D01000", notificaChiusura: 7, al: il(5), notificaApertura: 8 },
    ]);
  });

  it("l'ultimo periodo resta aperto se non è mai arrivata l'apertura", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3), notificaId: 7 }),
      ev({ codice: "R01D01000", tipo: "apertura", quando: il(5), notificaId: 8 }),
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(9), notificaId: 11 }),
    ];
    const periodi = periodiDiChiusura("R01D01000", "tratta", eventi, MADRI);
    expect(periodi.length).toBe(2);
    expect(periodi[1]).toMatchObject({ dal: il(9), al: null, notificaApertura: null });
  });
});

describe("componiStati", () => {
  it("una riga per ogni codice nominato, ordinata per codice", () => {
    const eventi = [
      ev({ codice: "R02D01000", tipo: "chiusura", quando: il(3), descrizione: "Molinara" }),
      ev({ codice: "R01D01000", tipo: "apertura", quando: il(4) }),
    ];
    const stati = componiStati(eventi, MADRI);
    expect(stati.map((s) => [s.codice, s.stato])).toEqual([
      ["R01D01000", "aperta"],
      ["R02D01000", "chiusa"],
    ]);
  });

  it("la data viaggia in ISO, non come Date", () => {
    const eventi = [ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3) })];
    expect(componiStati(eventi, MADRI)[0].chiusaDal).toBe(il(3).toISOString());
  });

  it("tiene la descrizione più recente del codice", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3), descrizione: "vecchio nome" }),
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(6), descrizione: "nome nuovo" }),
    ];
    expect(componiStati(eventi, MADRI)[0].descrizione).toBe("nome nuovo");
  });
});

describe("tratteChiuse", () => {
  // Issue #58: il box della Dashboard conta le tratte, non le decisioni.
  const codici = (eventi: EventoStato[]) =>
    tratteChiuse(componiStati(eventi, MADRI), MADRI).map((s) => s.codice);

  it("una notifica che chiude 4 tratte ne conta 4", () => {
    const quattro = ["R01D01000", "R01D02000", "R02D01000", "R10DA0001"];
    const eventi = quattro.map((codice) => ev({ codice, tipo: "chiusura", notificaId: 7, quando: il(3) }));
    expect(codici(eventi)).toEqual(quattro);
  });

  it("la madre chiusa conta con le sue tratte, e lei stessa non entra", () => {
    const eventi = [ev({ codice: "R01", livello: "madre", tipo: "chiusura", notificaId: 9, quando: il(3) })];
    const chiuse = tratteChiuse(componiStati(eventi, MADRI), MADRI);
    expect(chiuse.map((s) => s.codice)).toEqual(["R01D01000", "R01D02000"]);
    expect(chiuse[0]).toMatchObject({ livello: "tratta", chiusaDaCodice: "R01", notificaId: 9, chiusaDal: il(3).toISOString() });
  });

  it("una tratta chiusa da sé e dalla madre conta una volta sola", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(1) }),
      ev({ codice: "R01", livello: "madre", tipo: "chiusura", quando: il(3) }),
    ];
    expect(codici(eventi)).toEqual(["R01D01000", "R01D02000"]);
  });

  it("una tratta riaperta dopo la chiusura della madre non conta", () => {
    const eventi = [
      ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) }),
      ev({ codice: "R10DA0001", tipo: "apertura", quando: il(5) }),
    ];
    expect(codici(eventi)).toEqual([]);
  });

  it("le tratte aperte e le madri riaperte non contano", () => {
    const eventi = [
      ev({ codice: "R01", livello: "madre", tipo: "chiusura", quando: il(1) }),
      ev({ codice: "R01", livello: "madre", tipo: "apertura", quando: il(2) }),
      ev({ codice: "R02D01000", tipo: "chiusura", quando: il(1) }),
      ev({ codice: "R02D01000", tipo: "apertura", quando: il(2) }),
    ];
    expect(codici(eventi)).toEqual([]);
  });
});

describe("risolviStato", () => {
  it("un codice senza riga è aperto", () => {
    expect(risolviStato("R01D01000", "tratta", [], null).stato).toBe("aperta");
  });

  it("usa la riga del codice quando c'è", () => {
    const stati = componiStati([ev({ codice: "R01D01000", tipo: "chiusura", quando: il(3) })], MADRI);
    expect(risolviStato("R01D01000", "tratta", stati, null).stato).toBe("chiusa");
  });

  it("una figlia senza riga propria eredita dalla madre", () => {
    const stati = componiStati([ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) })], MADRI);
    expect(risolviStato("R10DA0001", "tratta", stati, "R10")).toMatchObject({
      stato: "chiusa", chiusaDaCodice: "R10",
    });
  });

  it("la riga propria vince sulla madre: l'ereditarietà è già stata risolta a monte", () => {
    const stati = componiStati([
      ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) }),
      ev({ codice: "R10DA0001", tipo: "apertura", quando: il(5) }),
    ], MADRI);
    expect(risolviStato("R10DA0001", "tratta", stati, "R10").stato).toBe("aperta");
  });

  it("una madre non eredita da nessuno", () => {
    const stati = componiStati([ev({ codice: "R10DA0001", tipo: "chiusura", quando: il(3) })], MADRI);
    expect(risolviStato("R10", "madre", stati, null).stato).toBe("aperta");
  });

  it("senza codice madre una tratta senza riga propria non eredita", () => {
    const stati = componiStati([ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) })], MADRI);
    expect(risolviStato("R10DA0001", "tratta", stati, null).stato).toBe("aperta");
  });
});

/**
 * `componiStati` (il server, che ha l'intera mappa) e `risolviStato` (il
 * client, che riceve un codice madre già risolto) sono due implementazioni
 * della stessa regola di ereditarietà. Restano i test che coprono i due rami
 * singolarmente, ma qui si confrontano campo per campo: se una delle due
 * divergesse dall'altra su uno di questi scenari, la pagina mostrerebbe uno
 * stato e la Dashboard un altro.
 */
describe("risolviStato e statoDi danno lo stesso verdetto", () => {
  // `statoDi` porta `chiusaDal` come Date, `risolviStato` come stringa ISO
  // (viaggia dentro `StatoCodice`, già serializzato da `componiStati`): li si
  // confronta campo per campo, non con `toEqual`, o la sola differenza di tipo
  // farebbe fallire il test anche a regola corretta.
  function stessoVerdetto(codice: string, livello: "tratta" | "madre", eventi: EventoStato[], madri: MadriDiTratte) {
    const daStatoDi = statoDi(codice, livello, eventi, madri);
    expect(risolviStato(codice, livello, componiStati(eventi, madri), madri[codice] ?? null)).toEqual({
      stato: daStatoDi.stato,
      chiusaDal: daStatoDi.chiusaDal === null ? null : daStatoDi.chiusaDal.toISOString(),
      notificaId: daStatoDi.notificaId,
      chiusaDaCodice: daStatoDi.chiusaDaCodice,
    });
    return daStatoDi;
  }

  it("madre chiusa: la figlia eredita", () => {
    const eventi = [ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) })];
    const atteso = stessoVerdetto("R10DA0001", "tratta", eventi, MADRI);
    expect(atteso.stato).toBe("chiusa");
  });

  it("madre chiusa, poi la figlia riaperta singolarmente", () => {
    const eventi = [
      ev({ codice: "R10", livello: "madre", tipo: "chiusura", quando: il(3) }),
      ev({ codice: "R10DA0001", tipo: "apertura", quando: il(5) }),
    ];
    const atteso = stessoVerdetto("R10DA0001", "tratta", eventi, MADRI);
    expect(atteso.stato).toBe("aperta");
  });

  it("figlia chiusa dopo l'apertura della madre", () => {
    const eventi = [
      ev({ codice: "R10", livello: "madre", tipo: "apertura", quando: il(3) }),
      ev({ codice: "R10DA0001", tipo: "chiusura", quando: il(5) }),
    ];
    const atteso = stessoVerdetto("R10DA0001", "tratta", eventi, MADRI);
    expect(atteso.stato).toBe("chiusa");
  });
});

describe("componiRispostaStato", () => {
  it("porta gli stati e le date delle chiusure recenti", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(10) }),
      ev({ codice: "R02D01000", tipo: "apertura", quando: il(11) }),
    ];
    const r = componiRispostaStato(eventi, il(1), MADRI);
    expect(r.stati.map((s) => s.codice)).toEqual(["R01D01000", "R02D01000"]);
    expect(r.chiusure).toEqual([il(10).toISOString()]);
  });

  it("le chiusure più vecchie della finestra non entrano, ma lo stato resta", () => {
    const eventi = [ev({ codice: "R01D01000", tipo: "chiusura", quando: il(2) })];
    const r = componiRispostaStato(eventi, il(20), MADRI);
    expect(r.chiusure).toEqual([]);
    expect(r.stati[0].stato).toBe("chiusa");
  });

  it("una chiusura ripetuta conta due volte fra le chiusure comunicate", () => {
    const eventi = [
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(10) }),
      ev({ codice: "R01D01000", tipo: "chiusura", quando: il(12) }),
    ];
    expect(componiRispostaStato(eventi, il(1), MADRI).chiusure.length).toBe(2);
  });

  it("porta le tratte chiuse, comprese quelle ereditate dalla madre", () => {
    const eventi = [ev({ codice: "R01", livello: "madre", tipo: "chiusura", quando: il(10) })];
    expect(componiRispostaStato(eventi, il(1), MADRI).tratteChiuse.map((s) => s.codice)).toEqual(["R01D01000", "R01D02000"]);
  });
});

describe("ereditarieta' senza prefisso", () => {
  // La madre di R01D01S02 e' IM01A: nessun prefisso lo direbbe. Nomi locali a
  // questo describe per non confliggere con la MADRI generica usata sopra.
  const MADRI_IMPIANTI: MadriDiTratte = {
    "R01D01S02": "IM01A",
    "R01D10S01": "IM38A",
  };

  function evento(p: Partial<EventoStato> & { codice: string; livello: "tratta" | "madre"; tipo: "apertura" | "chiusura" }): EventoStato {
    return { id: p.id ?? 1, notificaId: p.notificaId ?? 1, quando: p.quando ?? new Date("2026-09-01T10:00:00Z"), descrizione: p.descrizione ?? null, ...p };
  }

  it("chiudere l'impianto chiude le sue tratte", () => {
    const eventi = [evento({ codice: "IM01A", livello: "madre", tipo: "chiusura" })];
    expect(statoDi("R01D01S02", "tratta", eventi, MADRI_IMPIANTI).stato).toBe("chiusa");
  });

  it("una tratta con lo stesso prefisso ma un'altra madre resta aperta", () => {
    // Con la regola vecchia entrambe avrebbero madre "R01" e si sarebbero
    // chiuse insieme. E' esattamente il bug che questo task chiude.
    const eventi = [evento({ codice: "IM01A", livello: "madre", tipo: "chiusura" })];
    expect(statoDi("R01D10S01", "tratta", eventi, MADRI_IMPIANTI).stato).toBe("aperta");
  });

  it("chiudere una tratta non chiude l'impianto", () => {
    const eventi = [evento({ codice: "R01D01S02", livello: "tratta", tipo: "chiusura" })];
    expect(statoDi("IM01A", "madre", eventi, MADRI_IMPIANTI).stato).toBe("aperta");
  });

  it("una tratta che la mappa non conosce non eredita da nessuno", () => {
    const eventi = [evento({ codice: "IM01A", livello: "madre", tipo: "chiusura" })];
    expect(statoDi("R99D99S99", "tratta", eventi, MADRI_IMPIANTI).stato).toBe("aperta");
  });

  it("risolviStato riceve la madre, non la deduce", () => {
    const stati = componiStati([evento({ codice: "IM01A", livello: "madre", tipo: "chiusura" })], MADRI_IMPIANTI);
    expect(risolviStato("R01D01S02", "tratta", stati, "IM01A").stato).toBe("chiusa");
    expect(risolviStato("R01D10S01", "tratta", stati, "IM38A").stato).toBe("aperta");
    expect(risolviStato("R01D01S02", "tratta", stati, null).stato).toBe("aperta");
  });
});
