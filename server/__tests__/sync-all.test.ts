import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import { syncAll } from "../sync/sync-all";
import { SorgenteNonConfigurata, type WsSource } from "../sync/source";
import type { WsEntity } from "../sync/config";
import type { GerarchiaRogge, ConteggiGerarchiaRogge, NomiGerarchiaRogge } from "@shared/gerarchia-rogge";

/**
 * Una MemStorage la cui lettura dei nomi di ripiego (`getNomiGerarchiaRogge`)
 * solleva sempre — come farebbe una PostgreSQLStorage vera quando la
 * migrazione `0013` non è ancora applicata e `madri_rogge` non esiste.
 * Serve al Rilievo 1 della revisione finale: quella lettura sta su DUE punti
 * di uscita di `eseguiGerarchiaRogge` (entità non lette, scrittura fallita), e
 * prima della correzione nessuno dei due era protetto.
 */
class MemStorageNomiGerarchiaRotti extends MemStorage {
  async getNomiGerarchiaRogge(): Promise<NomiGerarchiaRogge> {
    throw new Error('relation "madri_rogge" does not exist');
  }
}

/** Come sopra, ma è la scrittura della gerarchia a fallire (non la lettura). */
class MemStorageScritturaGerarchiaRotta extends MemStorage {
  async replaceGerarchiaRogge(_g: GerarchiaRogge): Promise<ConteggiGerarchiaRogge> {
    throw new Error("connessione al database persa");
  }
  async getNomiGerarchiaRogge(): Promise<NomiGerarchiaRogge> {
    throw new Error('relation "madri_rogge" does not exist');
  }
}

function sorgenteFinta(
  risposte: Partial<Record<WsEntity, unknown>>,
): WsSource {
  return {
    async fetchRaw(entita) {
      const r = risposte[entita];
      if (r === undefined) throw new SorgenteNonConfigurata(entita);
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const COMPLETA: Partial<Record<WsEntity, unknown>> = {
  conduttori: [
    { keykey: "1", descrizione: "rossi", email: "r@e.it", cellulare: "333", flag: "", tipo_email: "normale", dataconsenso: "" },
    { keykey: "2", descrizione: "verdi", email: "v@e.it", cellulare: "0", flag: "*", tipo_email: "pec", dataconsenso: "" },
  ],
  madriImpianti: [
    { codiceimpianto: "IM44A", codicetipoirrigazione: "2", name: "Trenzano", tipoirrigazione: "Acque superficiali" },
  ],
  madriOrari: [{ codicemadre: "S45", name: "S45 - Impianto fiume adda" }],
  tratteImpianti: [
    { codiceimpianto: "IM44A", keyroggia: "R34D02S01", name: "R.Trenzano I" },
    { codiceimpianto: "ZM09A", keyroggia: "Z12000000", name: "Z-Pozzo" },
  ],
  tratteOrari: [{ keyroggia: "S45D00001", name: "Comizio 1" }],
  legamiLiveImpianti: [
    { metodo: "live", keykey: "1", keyroggia: "R34D02S01" },
    { metodo: "live", keykey: "1", keyroggia: "N02D40003" },
  ],
  legamiLiveOrari: [{ metodo: "live", keykey: "2", keyroggia: "S45D00001" }],
  legamiStagione: [{ metodo: "cartoline", keykey: "1", keyroggia: "R29D10+++" }],
  roggeMadri: [{ codicemadre: "R29", name: "R29 - Roggia di prova" }],
  roggeFiglie: [
    { keyroggia: "R29D10+++", name: "Ramo aggregato" },
    { keyroggia: "R99D01000", name: "Madre non elencata" },
  ],
};

describe("syncAll — registro completo", () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it("scrive le tre tabelle e conta scarti e sintesi", async () => {
    const e = await syncAll("test", { storage, source: sorgenteFinta(COMPLETA) });
    expect(e.status).toBe("success");
    expect(e.conteggi.conduttori).toBe(2);
    // 1 IM + 1 S + 1 di servizio (R29)
    expect(e.conteggi.madri).toBe(3);
    // 1 IM + 1 S + 1 di servizio (R29D10+++)
    expect(e.conteggi.tratte).toBe(3);
    // 1 live I + 1 live S + 1 stagione; quello su N02 e' scartato
    expect(e.conteggi.legami).toBe(3);
    expect(e.conteggi.tratteScartate).toBe(1);   // ZM09A
    expect(e.conteggi.legamiScartati).toBe(1);   // N02D40003
    expect(e.conteggi.madriDiServizio).toBe(1);
    expect(e.conteggi.tratteDiServizio).toBe(1);
  });

  it("un keyroggia troppo corto in tratteOrari non impedisce la scrittura del registro", async () => {
    // Prima della correzione, parseTrattaOrari sollevava su questo caso:
    // leggiRegistro catturava l'eccezione come errore dell'INTERA entità
    // tratteOrari, `lette` restava a 6/7, e il registro (madri+tratte+legami)
    // non veniva scritto quella notte — non "una riga orfana", un mirror
    // fermo. Ora la riga si scarta e si conta, come le aggregazioni non IM e
    // i codici N: il resto del registro si scrive normalmente.
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({
        ...COMPLETA,
        tratteOrari: [
          { keyroggia: "S45D00001", name: "Comizio 1" },
          { keyroggia: "S4", name: "Codice monco" },
        ],
      }),
    });
    expect(e.status).toBe("success");
    // Stesso conteggio dello scenario base: la riga troppo corta non entra
    // (tratte.codice_madre è NOT NULL) ma non fa fallire le altre.
    expect(e.conteggi.tratte).toBe(3);
    expect(e.conteggi.tratteSenzaMadre).toBe(1);
  });

  it("conta a parte le tratte S che non sono gruppi di consegna", async () => {
    // Due cause diverse di scarto, due contatori: «non è un gruppo di consegna»
    // e «codice troppo corto» non si spiegano con un numero solo.
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({
        ...COMPLETA,
        tratteOrari: [
          { keyroggia: "S45D00001", name: "Comizio 1" },
          { keyroggia: "S45DA1C01", name: "Scarico" },
          { keyroggia: "S4", name: "Codice monco" },
        ],
      }),
    });
    expect(e.status).toBe("success");
    expect(e.conteggi.tratteNonGruppo).toBe(1);
    expect(e.conteggi.tratteSenzaMadre).toBe(1);
  });

  it("la madre di una tratta R e' il suo impianto, non il suo prefisso", async () => {
    await syncAll("test", { storage, source: sorgenteFinta(COMPLETA) });
    expect((await storage.getMappaMadri())["R34D02S01"]).toBe("IM44A");
  });

  it("il codice orfano finisce sotto la madre del suo prefisso", async () => {
    await syncAll("test", { storage, source: sorgenteFinta(COMPLETA) });
    const madre = (await storage.getAllMadri()).find((m) => m.codice === "R29");
    expect(madre?.origine).toBe("servizio");
    expect((await storage.getMappaMadri())["R29D10+++"]).toBe("R29");
  });

  it("un orfano sotto una madre vera senza tratte non duplica la madre", async () => {
    // Lo stato del mirror di agosto: S02 arriva da getroggemadri, nessuna
    // tratta S02 da getroggeorari/S, e un legame live S la cita. Su PostgreSQL
    // una seconda S02 violerebbe la chiave primaria e il registro resterebbe
    // fermo; qui, su MemStorage, sovrascriverebbe la vera in silenzio.
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({
        ...COMPLETA,
        madriOrari: [
          { codicemadre: "S45", name: "S45 - Impianto fiume adda" },
          { codicemadre: "S02", name: "S02 - Impianto" },
        ],
        legamiLiveOrari: [
          { metodo: "live", keykey: "2", keyroggia: "S45D00001" },
          { metodo: "live", keykey: "2", keyroggia: "S02DA0002" },
        ],
      }),
    });
    expect(e.status).toBe("success");
    const s02 = (await storage.getAllMadri()).filter((m) => m.codice === "S02");
    expect(s02.length).toBe(1);
    expect(s02[0].origine).toBe("orari");
    expect((await storage.getMappaMadri())["S02DA0002"]).toBe("S02");
  });

  it("scrive la gerarchia delle rogge madri e conta le figlie senza madre", async () => {
    const e = await syncAll("test", { storage, source: sorgenteFinta(COMPLETA) });
    expect(e.conteggi.madriRogge).toBe(1);
    // R99 non è fra le madri lette: la figlia entra lo stesso (richiesta del
    // 24/09/2026, Anagrafiche la mostra con madre «-»), ma si conta, e la
    // madre non si inventa — non è fra quelle selezionabili.
    expect(e.conteggi.tratteRogge).toBe(2);
    expect(e.conteggi.roggeFiglieSenzaMadre).toBe(1);
    expect((await storage.getRoggeMadri()).map((m) => m.codicemadre)).toEqual(["R29"]);
  });

  it("conta le rogge madri che il consorzio manda due volte", async () => {
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({
        ...COMPLETA,
        roggeMadri: [
          { codicemadre: "R29", name: "R29 - Roggia di prova" },
          { codicemadre: "R29", name: "R29 - Lo stesso codice, altro nome" },
        ],
      }),
    });
    expect(e.conteggi.madriRogge).toBe(1);
    expect(e.conteggi.roggeMadriDuplicate).toBe(1);
    // Vince la prima: il nome che finisce in tabella e nelle righe di servizio.
    expect((await storage.getRoggeMadri())[0].name).toBe("R29 - Roggia di prova");
  });

  it("i nomi veri arrivano alle righe di servizio", async () => {
    await syncAll("test", { storage, source: sorgenteFinta(COMPLETA) });
    const madri = await storage.getAllMadri();
    expect(madri.find((m) => m.codice === "R29")!.name).toBe("R29 - Roggia di prova");
    const tratte = await storage.getAllTratte();
    expect(tratte.find((t) => t.keyroggia === "R29D10+++")!.name).toBe("Ramo aggregato");
  });

  it("se la gerarchia R non si legge, il registro si aggiorna lo stesso", async () => {
    // È il motivo per cui la gerarchia NON sta fra le sette entità del registro:
    // in produzione il mirror gira in modalità file, e finché i due JSON nuovi
    // non arrivano il registro deve continuare ad aggiornarsi ogni notte.
    const senzaR = { ...COMPLETA };
    delete (senzaR as Record<string, unknown>).roggeMadri;
    delete (senzaR as Record<string, unknown>).roggeFiglie;
    const e = await syncAll("test", { storage, source: sorgenteFinta(senzaR) });
    expect(e.conteggi.tratte).toBeGreaterThan(0);
    expect(e.saltate).toContain("Rogge madri (codici R da 3)");
    expect(await storage.getRoggeMadri()).toEqual([]);
    // Senza nomi veri la madre di servizio torna al ripiego, non sparisce.
    expect((await storage.getAllMadri()).find((m) => m.codice === "R29")!.name)
      .toBe("R29 — non classificata");
  });

  it("una sola delle due entità letta non scrive mezza gerarchia", async () => {
    const meta = { ...COMPLETA };
    delete (meta as Record<string, unknown>).roggeFiglie;
    const e = await syncAll("test", { storage, source: sorgenteFinta(meta) });
    expect(await storage.getRoggeMadri()).toEqual([]);
    expect(e.conteggi.madriRogge).toBeUndefined();
    expect(e.status).toBe("partial");
  });
});

describe("syncAll — Rilievo 1: la lettura di ripiego dei nomi non blocca mai il registro", () => {
  it("gerarchia R non configurata + lettura di ripiego che solleva: il registro si scrive lo stesso", async () => {
    // Lo scenario del giorno del deploy: le altre otto sorgenti sono sane, le
    // due entità nuove non sono configurate (ramo `lette < ENTITA_ROGGE.length`
    // con `lette === 0`), e prima della correzione la `return await
    // storage.getNomiGerarchiaRogge()` di quel ramo non era in un try: se
    // avesse sollevato (qui: sempre, come farebbe una `madri_rogge` mancante),
    // l'eccezione sarebbe uscita da `eseguiCorpo` senza scrivere il registro.
    const senzaR = { ...COMPLETA };
    delete (senzaR as Record<string, unknown>).roggeMadri;
    delete (senzaR as Record<string, unknown>).roggeFiglie;
    const storage = new MemStorageNomiGerarchiaRotti();

    const e = await syncAll("test", { storage, source: sorgenteFinta(senzaR) });

    expect(e.conteggi.conduttori).toBe(2);
    expect(e.conteggi.madri).toBeGreaterThan(0);
    expect(e.conteggi.tratte).toBeGreaterThan(0);
    expect(e.conteggi.legami).toBeGreaterThan(0);
    expect(e.errori.join(" ")).toMatch(/rileggere i nomi già in tabella/i);
    expect(e.status).toBe("partial");
  });

  it("scrittura della gerarchia R fallita + lettura di ripiego che solleva: il registro si scrive lo stesso", async () => {
    // L'altro punto di uscita non protetto: il `catch` dopo `replaceGerarchiaRogge`.
    const storage = new MemStorageScritturaGerarchiaRotta();

    const e = await syncAll("test", { storage, source: sorgenteFinta(COMPLETA) });

    expect(e.conteggi.conduttori).toBe(2);
    expect(e.conteggi.madri).toBeGreaterThan(0);
    expect(e.conteggi.tratte).toBeGreaterThan(0);
    expect(e.conteggi.legami).toBeGreaterThan(0);
    expect(e.errori.join(" ")).toMatch(/rogge madri/i);
    expect(e.errori.join(" ")).toMatch(/rileggere i nomi già in tabella/i);
    expect(e.status).toBe("partial");
  });
});

describe("syncAll — Rilievo 5: una lista vuota dal consorzio non azzera la gerarchia", () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it("roggeFiglie vuota: la gerarchia di ieri resta, l'errore dice quale lista era vuota", async () => {
    await syncAll("primo", { storage, source: sorgenteFinta(COMPLETA) });
    const primaMadri = await storage.getRoggeMadri();
    expect(primaMadri.length).toBeGreaterThan(0);

    const e = await syncAll("secondo", {
      storage,
      source: sorgenteFinta({ ...COMPLETA, roggeFiglie: [] }),
    });

    expect(await storage.getRoggeMadri()).toEqual(primaMadri);
    expect(e.conteggi.madriRogge).toBeUndefined();
    expect(e.errori.join(" ")).toMatch(/lista.*delle figlie.*arrivata vuota/i);
    // Il resto del registro, che non dipende dalla gerarchia R, si scrive comunque.
    expect(e.conteggi.tratte).toBeGreaterThan(0);
    expect(e.status).toBe("partial");
  });

  it("roggeMadri null: stesso trattamento di un array vuoto", async () => {
    await syncAll("primo", { storage, source: sorgenteFinta(COMPLETA) });
    const primaMadri = await storage.getRoggeMadri();

    const e = await syncAll("secondo", {
      storage,
      source: sorgenteFinta({ ...COMPLETA, roggeMadri: null }),
    });

    expect(await storage.getRoggeMadri()).toEqual(primaMadri);
    expect(e.errori.join(" ")).toMatch(/lista.*delle rogge madri.*arrivata vuota/i);
  });

  it("i nomi di servizio si rileggono da quella di ieri, non spariscono", async () => {
    await syncAll("primo", { storage, source: sorgenteFinta(COMPLETA) });

    const e = await syncAll("secondo", {
      storage,
      source: sorgenteFinta({ ...COMPLETA, roggeFiglie: [] }),
    });

    expect(e.status).toBe("partial");
    // R29 è la madre di servizio del run "primo": il suo nome vero deve
    // sopravvivere al secondo run, non tornare al ripiego "non classificata".
    expect((await storage.getAllMadri()).find((m) => m.codice === "R29")!.name)
      .toBe("R29 - Roggia di prova");
  });
});

describe("syncAll — guasti", () => {
  let storage: MemStorage;
  beforeEach(() => { storage = new MemStorage(); });

  it("se un'entita' del registro fallisce, il registro NON viene scritto", async () => {
    // Scriverlo lo cancellerebbe e la sintesi adotterebbe le tratte perse
    // sotto madri di servizio: un registro diverso, prodotto in silenzio.
    await syncAll("primo", { storage, source: sorgenteFinta(COMPLETA) });
    const primaMadri = (await storage.getAllMadri()).length;

    const e = await syncAll("secondo", {
      storage,
      source: sorgenteFinta({ ...COMPLETA, tratteImpianti: new Error("rete giu'") }),
    });
    expect(e.status).toBe("partial");
    expect(e.errori.join(" ")).toMatch(/registro/i);
    expect((await storage.getAllMadri()).length).toBe(primaMadri);
    expect(e.conteggi.madri).toBeUndefined();
  });

  it("i conduttori si scrivono comunque: non dipendono dal registro", async () => {
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({ ...COMPLETA, tratteOrari: new Error("rete giu'") }),
    });
    expect(e.conteggi.conduttori).toBe(2);
    expect((await storage.getAllConduttori()).length).toBe(2);
  });

  it("nessuna sorgente configurata = failed, non un successo su zero righe", async () => {
    const e = await syncAll("test", { storage, source: sorgenteFinta({}) });
    expect(e.status).toBe("failed");
    // 1 conduttori + 7 registro + 2 seconda gerarchia (roggeMadri/roggeFiglie).
    expect(e.saltate.length).toBe(10);
    // Il messaggio più chiaro resta l'unico: l'errore sul registro non scritto
    // si aggiunge solo quando i conduttori sono stati scritti.
    expect(e.errori).toEqual(["Nessuna sorgente è configurata: nessuna anagrafica è stata sincronizzata."]);
  });

  it("conduttori scritti e registro tutto saltato = partial, non un successo", async () => {
    // È lo stato della produzione subito dopo il deploy: i conduttori sono
    // configurati, le sette entità nuove no. Con `success` l'email direbbe
    // «Anagrafiche aggiornate» mentre madri, tratte e legami sono vuoti — e chi
    // deve spedire non troverebbe nessuna roggia.
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({ conduttori: COMPLETA.conduttori }),
    });
    expect(e.status).toBe("partial");
    expect(e.errori.join(" ")).toMatch(/registro/i);
    expect(e.errori.join(" ")).toMatch(/nessuna delle 7/);
    // 7 entità del registro + 2 della seconda gerarchia, anche lei non configurata.
    expect(e.saltate.length).toBe(9);
  });

  it("le quattro delete ripuliscono le diagnostiche quando il registro non viene scritto", async () => {
    // Lo scenario è sei entità su sette lette (legamiStagione fallisce): il
    // ramo `lette < ENTITA_REGISTRO.length` con `lette > 0`, cioè una
    // lettura PARZIALE. Esercita le quattro `delete` sul ramo parziale, non
    // il caso "nessuna entità letta" (lette === 0) che il nome originale
    // lasciava intendere. (Diventate quattro con l'aggiunta di
    // `tratteSenzaMadre`: prima erano tre.)
    const e = await syncAll("test", {
      storage,
      source: sorgenteFinta({ ...COMPLETA, legamiStagione: new Error("rete giu'") }),
    });
    expect(e.conteggi.tratteScartate).toBeUndefined();
    expect(e.conteggi.tratteSenzaMadre).toBeUndefined();
    expect(e.conteggi.legamiScartati).toBeUndefined();
    expect(e.conteggi.madriTipoIgnoto).toBeUndefined();
  });

  it("un registro che fallisce in scrittura non lascia conteggi di sintesi orfani", async () => {
    class StorageConRegistroRotto extends MemStorage {
      async replaceRegistro(): Promise<{ madri: number; tratte: number; legami: number }> {
        throw new Error("db giu'");
      }
    }
    const rotto = new StorageConRegistroRotto();
    const e = await syncAll("test", { storage: rotto, source: sorgenteFinta(COMPLETA) });
    expect(e.conteggi.madri).toBeUndefined();
    expect(e.conteggi.madriDiServizio).toBeUndefined();
    expect(e.conteggi.tratteDiServizio).toBeUndefined();
    expect(e.errori.join(" ")).toMatch(/registro/i);
  });
});
