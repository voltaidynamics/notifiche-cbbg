import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";

const GERARCHIA = {
  madri: [
    { codice: "R02", name: "R02 - Roggia borgogna e derivate" },
    { codice: "R08", name: "R08 - Roggia serio e derivate" },
  ],
  tratte: [
    { keyroggia: "R08D02S01", name: "Roggia Nuova Ramo A", codiceMadre: "R08" },
    { keyroggia: "R02D10+++", name: "Fosso Calcinate", codiceMadre: "R02" },
  ],
};

describe("gerarchia delle rogge madri — MemStorage", () => {
  let s: MemStorage;
  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceGerarchiaRogge(GERARCHIA);
  });

  it("sostituisce la gerarchia per intero", async () => {
    const c = await s.replaceGerarchiaRogge(GERARCHIA);
    expect(c).toEqual({ madri: 2, tratte: 2 });
    expect((await s.getRoggeMadri()).map((m) => m.codicemadre)).toEqual(["R02", "R08"]);
  });

  it("le figlie di una madre, in ordine di codice", async () => {
    const t = await s.getTratteDiRoggeMadri(["R02", "R08"]);
    expect(t.map((x) => x.keyroggia)).toEqual(["R02D10+++", "R08D02S01"]);
    expect(t[0].codicemadre).toBe("R02");
  });

  it("una selezione vuota non torna tutto", async () => {
    expect(await s.getTratteDiRoggeMadri([])).toEqual([]);
  });

  it("porta anche l'impianto della tratta, quando esiste", async () => {
    // Serve all'ereditarietà dello stato: chiudere il pozzo chiude le sue
    // tratte anche guardandole dal quarto bottone.
    await s.replaceRegistro({
      madri: [{ codice: "IM08A", name: "Impianto Serio", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" }],
      tratte: [{ keyroggia: "R08D02S01", name: "Roggia Nuova Ramo A", codiceMadre: "IM08A" }],
      legami: [],
    });
    const t = await s.getTratteDiRoggeMadri(["R02", "R08"]);
    const perCodice = new Map(t.map((x) => [x.keyroggia, x]));
    expect(perCodice.get("R08D02S01")!.codicemadreimpianto).toBe("IM08A");
    // Nessun impianto rivendica questo codice: null, non una madre inventata.
    expect(perCodice.get("R02D10+++")!.codicemadreimpianto).toBeNull();
  });

  it("i nomi veri, per le righe di servizio e per i target", async () => {
    const nomi = await s.getNomiGerarchiaRogge();
    expect(nomi.madri["R02"]).toBe("R02 - Roggia borgogna e derivate");
    expect(nomi.tratte["R02D10+++"]).toBe("Fosso Calcinate");
  });
});

describe("destinatari e conteggi dalla gerarchia R", () => {
  let s: MemStorage;

  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceGerarchiaRogge(GERARCHIA);
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Rossi", email: "r@e.it", cellulare: "333", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
      { keykey: "2", descrizione: "Verdi", email: "v@e.it", cellulare: "0", tipoEmail: "pec", flagAttivo: false, dataConsenso: null },
    ]);
    await s.replaceRegistro({
      madri: [{ codice: "IM08A", name: "Impianto Serio", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" }],
      tratte: [{ keyroggia: "R08D02S01", name: "Roggia Nuova Ramo A", codiceMadre: "IM08A" }],
      legami: [
        { keykey: "1", keyroggia: "R08D02S01", metodo: "live" },
        { keykey: "2", keyroggia: "R08D02S01", metodo: "live" },
      ],
    });
  });

  it("risolve i conduttori di una roggia madre passando dalle sue figlie", async () => {
    const d = await s.getDestinatariPerRoggeMadri(["R08"], "live");
    // Il cessato non passa: il filtro sugli attivi vale anche da qui.
    expect(d.map((x) => x.conduttore.keykey)).toEqual(["1"]);
    expect(d[0].keyroggia).toBe("R08D02S01");
  });

  it("una roggia madre senza figlie legate non trova nessuno", async () => {
    expect(await s.getDestinatariPerRoggeMadri(["R02"], "live")).toEqual([]);
  });

  it("i conteggi contano anche la selezione per roggia madre", async () => {
    const c = await s.conteggiLegami([], [], ["R08"]);
    expect(c.live.selezione).toBe(1);
    expect(c.live.mirror).toBe(2);
  });

  it("scegliere la roggia madre e una sua figlia non conta due volte lo stesso conduttore", async () => {
    const c = await s.conteggiLegami(["R08D02S01"], [], ["R08"]);
    expect(c.live.selezione).toBe(1);
  });

  it("le righe di Anagrafiche accoppiano madre R e figlia, in ordine di codice", async () => {
    const righe = await s.getRigheRoggeMadri();
    // L'ordine di inserimento di GERARCHIA è [R08D02S01, R02D10+++]: se questa
    // asserzione passasse anche senza ordinare, l'ordine non starebbe cambiando
    // niente. Deve uscire ordinato per codice, come in PostgreSQLStorage.
    expect(righe.filter((x) => x.codiceFiglia !== "-").map((x) => x.codiceFiglia)).toEqual(["R02D10+++", "R08D02S01"]);
    const r = righe.find((x) => x.codiceFiglia === "R02D10+++")!;
    expect(r.codiceMadre).toBe("R02");
    expect(r.descrizioneMadre).toBe("R02 - Roggia borgogna e derivate");
    expect(r.descrizioneFiglia).toBe("Fosso Calcinate");
  });

  it("Rilievo 2: le righe di Anagrafiche portano anche l'impianto, per l'ereditarietà dello stato", async () => {
    // R08D02S01 è rivendicata dall'impianto IM08A nel registro degli impianti
    // (vedi il beforeEach di questo describe); R02D10+++ no. Senza questo
    // campo la scheda «Rogge madri» risolveva lo stato passando sempre `null`
    // come madre, e una tratta chiusa solo perché è chiuso il suo impianto
    // risultava "Aperta" qui mentre "Rogge" e Invia notifica, sugli stessi
    // dati, dicevano "Chiusa".
    const righe = await s.getRigheRoggeMadri();
    const r08 = righe.find((x) => x.codiceFiglia === "R08D02S01")!;
    const r02 = righe.find((x) => x.codiceFiglia === "R02D10+++")!;
    expect(r08.codiceMadreImpianto).toBe("IM08A");
    expect(r02.codiceMadreImpianto).toBeNull();
  });

  it("una figlia che nessun impianto rivendica porta comunque il suo nome", async () => {
    // R02D10+++ non è in `tratte` (nessun impianto la rivendica), solo in
    // `tratte_rogge`. Se il ripiego sulla seconda gerarchia si rompesse, il
    // conduttore riceverebbe comunque la comunicazione ma la sua riga
    // perderebbe la descrizione della roggia — e il filtro «Roggia» dello
    // Storico cerca anche lì: una ricerca che, mesi dopo, non troverebbe più
    // niente, senza nessun errore da nessuna parte.
    await s.replaceRegistro({
      madri: [],
      tratte: [],
      legami: [{ keykey: "1", keyroggia: "R02D10+++", metodo: "live" }],
    });
    const d = await s.getDestinatariPerRoggeMadri(["R02"], "live");
    expect(d).toHaveLength(1);
    expect(d[0].roggiaDescrizione).toBe("Fosso Calcinate");
  });
});
