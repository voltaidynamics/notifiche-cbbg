import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage } from "../storage";
import { aggregaDestinatari, codiciTratte } from "@shared/destinatari";
import type { RegistroConsorzio } from "@shared/ws-consorzio";

/**
 * Solo per riconoscere nei test la tratta "tutte le consegne" di una madre
 * (suffisso D00000): `shared/rogge.ts`, che aveva questa regola, è sparito col
 * Task 12 insieme al modello a prefisso. Non è più una funzione di dominio,
 * qui serve solo a scegliere quale riga aspettarsi.
 */
function eOmnicomprensiva(t: { keyroggia: string; codicemadre: string | null }): boolean {
  const madre = (t.codicemadre ?? "").trim().toUpperCase();
  return madre !== "" && t.keyroggia.trim().toUpperCase() === madre + "D00000";
}

/**
 * La selezione a cascata di Invia notifica (issue #14).
 *
 * Il vincolo che il collaudo ha chiesto per iscritto — «non venga mai inviata
 * una notifica a un destinatario con flag non attivo» — vive qui: è
 * `getDestinatariPerTratte` a costruire l'elenco che l'operatore vede e da cui
 * poi si spedisce.
 */
describe("selezione per l'invio", () => {
  let s: MemStorage;

  const MADRI: RegistroConsorzio["madri"] = [
    { codice: "R01", name: "R01 - Roggia bolgare e derivate", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" },
    { codice: "R10", name: "R10 - Pozzo bresciana", categoria: "pozzi", tipoIrrigazione: null, origine: "impianti" },
    { codice: "S45", name: "S45 - Impianto fiume adda", categoria: "impianti", tipoIrrigazione: null, origine: "orari" },
  ];

  const TRATTE: RegistroConsorzio["tratte"] = [
    { keyroggia: "R01D01000", name: "Bolgare capofonte", codiceMadre: "R01" },
    { keyroggia: "R01D02000", name: "Bolgare valle", codiceMadre: "R01" },
    { keyroggia: "R10D00000", name: "Pozzo bresciana - tutto", codiceMadre: "R10" },
    { keyroggia: "R10DA0001", name: "Pozzo bresciana - consegna 1", codiceMadre: "R10" },
    { keyroggia: "S45D00000", name: "Impianto Globale Pluvi Adda", codiceMadre: "S45" },
    { keyroggia: "S45DA1C01", name: "Impianto Adda A1 Scarico 1", codiceMadre: "S45" },
  ];

  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro({
      madri: MADRI,
      tratte: TRATTE,
      legami: [
        { keykey: "1", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "1", keyroggia: "R01D01000", metodo: "stagione" },
        { keykey: "1", keyroggia: "R01D02000", metodo: "live" },
        { keykey: "2", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "3", keyroggia: "R01D02000", metodo: "live" },
        { keykey: "9", keyroggia: "R01D01000", metodo: "live" },
        { keykey: "1", keyroggia: "R10D00000", metodo: "live" },
        { keykey: "3", keyroggia: "R10DA0001", metodo: "live" },
        // S45 e' l'anagrafica vera: i legami stanno sulle consegne, e la sua
        // omnicomprensiva S45D00000 non ne ha nemmeno uno. Nel mirror di agosto
        // 2026 nessuna delle 1187 associazioni punta a un codice D00000.
        { keykey: "1", keyroggia: "S45DA1C01", metodo: "live" },
        { keykey: "2", keyroggia: "S45DA1C01", metodo: "live" },
        { keykey: "3", keyroggia: "S45DA1C01", metodo: "live" },
      ],
    });
    await s.replaceConduttori([
      { keykey: "1", descrizione: "Mario Rossi", email: "m@e.it", cellulare: "3311234567", tipoEmail: "normale", flagAttivo: true, dataConsenso: null },
      { keykey: "2", descrizione: "Cessato Luigi", email: "c@e.it", cellulare: "3322345678", tipoEmail: "normale", flagAttivo: false, dataConsenso: null },
      { keykey: "3", descrizione: "Senza Numero", email: "s@e.it", cellulare: "0", tipoEmail: "pec", flagAttivo: true, dataConsenso: null },
    ]);
  });

  describe("getMadriSelezionabili", () => {
    it("classifica ogni madre e le restituisce ordinate per codice", async () => {
      const madri = await s.getMadriSelezionabili();
      expect(madri.map((m) => [m.codicemadre, m.categoria])).toEqual([
        ["R01", "rogge"],
        ["R10", "pozzi"],
        ["S45", "impianti"],
      ]);
    });
  });

  describe("getTratteDiMadri", () => {
    it("unisce le tratte di tutte le madri richieste", async () => {
      const tratte = await s.getTratteDiMadri(["R01", "S45"]);
      expect(tratte.map((t) => t.keyroggia)).toEqual([
        "R01D01000", "R01D02000", "S45D00000", "S45DA1C01",
      ]);
    });

    it("senza madri non interroga nulla", async () => {
      expect(await s.getTratteDiMadri([])).toEqual([]);
    });

    it("una madre inesistente non è un errore, è un elenco vuoto", async () => {
      expect(await s.getTratteDiMadri(["ZZZ"])).toEqual([]);
    });
  });

  describe("getDestinatariPerTratte", () => {
    it("esclude i conduttori con flag non attivo", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D01000"], "live");
      const chiavi = righe.map((r) => r.conduttore.keykey);
      expect(chiavi).toContain("1");
      // "2" è legato alla tratta ma è cessato: non deve comparire, perché questo
      // è l'elenco da cui parte la comunicazione.
      expect(chiavi).not.toContain("2");
    });

    it("un legame verso un conduttore che non esiste più non produce righe", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D01000"], "live");
      expect(righe.map((r) => r.conduttore.keykey)).not.toContain("9");
    });

    it("lo \"0\" del WS non arriva come numero di telefono", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D02000"], "live");
      const senzaNumero = righe.find((r) => r.conduttore.keykey === "3");
      expect(senzaNumero?.conduttore.cellulare).toBeNull();
    });

    it("lo stesso legame in live e stagione non raddoppia la riga", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D01000"], "live");
      expect(righe.filter((r) => r.conduttore.keykey === "1")).toHaveLength(1);
    });

    it("senza tratte non interroga nulla", async () => {
      expect(await s.getDestinatariPerTratte([], "live")).toEqual([]);
    });

    it("chi è legato a due tratte selezionate resta un destinatario solo (issue #5)", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D01000", "R01D02000"], "live");
      expect(righe.filter((r) => r.conduttore.keykey === "1")).toHaveLength(2);

      const destinatari = aggregaDestinatari(
        righe.map((r) => ({ conduttore: r.conduttore, keyroggia: r.keyroggia })),
        (c) => c.keykey,
      );
      const mario = destinatari.filter((d) => d.conduttore.keykey === "1");
      expect(mario).toHaveLength(1);
      expect(codiciTratte(mario[0].tratte)).toBe("R01D01000, R01D02000");
    });
  });

  /**
   * L'omnicomprensiva resta un codice riconoscibile per nome (`eOmnicomprensiva`
   * qui sopra), ma dal modello a registro non è più una scorciatoia di query:
   * selezionarla di per sé non porta più con sé i destinatari della madre
   * (vedi il commento su `condizioneTratte`). «Tutte le tratte» si esprime
   * scegliendo la madre — copertura in `describe("getDestinatariPerMadri")`
   * più sotto.
   */
  describe("i pozzi si scelgono per madre", () => {
    it("la madre di un pozzo ha la sua omnicomprensiva, come le altre", async () => {
      const tratte = await s.getTratteDiMadri(["R10"]);
      expect(tratte.filter((t) => eOmnicomprensiva(t)).map((t) => t.keyroggia)).toEqual([
        "R10D00000",
      ]);
    });

    it("l'omnicomprensiva e' una tratta come le altre: da sola non raggiunge nessuno", async () => {
      // Fino alla issue #27 questa spunta valeva per l'intera madre. Ora «tutte
      // le tratte» e' la madre: selezionare S45D00000, che nel mirror vero non ha
      // nemmeno un legame, non raggiunge piu' nessuno.
      expect(await s.getDestinatariPerTratte(["S45D00000"], "live")).toEqual([]);
      expect((await s.getDestinatariPerMadri(["S45"], "live")).map((r) => r.conduttore.keykey))
        .toEqual(["1", "3"]);
    });
  });

  describe("getDestinatariPerMadri", () => {
    it("prende tutti i conduttori dei figli della madre, non solo l'omnicomprensiva", async () => {
      const righe = await s.getDestinatariPerMadri(["R10"], "live");
      // "1" sta su R10D00000, "3" su R10DA0001: la madre li comprende entrambi.
      expect(righe.map((r) => r.conduttore.keykey).sort()).toEqual(["1", "3"]);
    });

    it("non sconfina nelle altre madri", async () => {
      const righe = await s.getDestinatariPerMadri(["R10"], "live");
      expect(righe.map((r) => r.keyroggia).every((k) => k.startsWith("R10"))).toBe(true);
      // Lo snapshot porta i codici veri dei figli, mai quello della madre
      // (fra sei mesi lo Storico deve dire su quali tratte e' passata).
      expect(righe.map((r) => r.keyroggia)).not.toContain("R10");
    });

    it("esclude i conduttori con flag non attivo, come la scelta per tratte", async () => {
      const righe = await s.getDestinatariPerMadri(["R01"], "live");
      expect(righe.map((r) => r.conduttore.keykey)).not.toContain("2");
    });

    it("una madre senza legami è un elenco vuoto, non un errore", async () => {
      expect(await s.getDestinatariPerMadri(["ZZZ"], "live")).toEqual([]);
    });

    it("senza madri non interroga nulla", async () => {
      expect(await s.getDestinatariPerMadri([], "live")).toEqual([]);
    });
  });

  /**
   * I due numeri che il popup di scelta legame mostra sotto ogni opzione
   * (issue #27). Servono entrambi perché uno zero ha due cause diverse, e
   * dirle come se fossero la stessa è l'errore muto della issue #26.
   */
  describe("conteggiLegami", () => {
    it("conta i conduttori attivi distinti della selezione, per metodo", async () => {
      const c = await s.conteggiLegami(["R01D01000"], []);
      // Su R01D01000 stanno "1" (live e stagione), "2" (cessato) e "9"
      // (inesistente in anagrafica): resta il solo "1" per entrambi i metodi.
      expect(c.live.selezione).toBe(1);
      expect(c.stagione.selezione).toBe(1);
    });

    it("distingue i metodi quando la tratta ne ha uno solo", async () => {
      const c = await s.conteggiLegami(["R01D02000"], []);
      // Su R01D02000 ci sono "1" e "3", entrambi solo live.
      expect(c.live.selezione).toBe(2);
      expect(c.stagione.selezione).toBe(0);
    });

    it("conta anche la selezione per madre, come i pozzi", async () => {
      const c = await s.conteggiLegami([], ["R10"]);
      expect(c.live.selezione).toBe(2); // "1" su R10D00000, "3" su R10DA0001
      expect(c.stagione.selezione).toBe(0);
    });

    it("somma le due strade senza contare due volte lo stesso conduttore", async () => {
      const c = await s.conteggiLegami(["R01D01000"], ["R01"]);
      // "1" è raggiunto da entrambe le strade, "3" solo dalla madre.
      expect(c.live.selezione).toBe(2);
    });

    it("il totale del mirror non dipende dalla selezione", async () => {
      const stretta = await s.conteggiLegami(["R01D01000"], []);
      const larga = await s.conteggiLegami([], ["R01", "R10"]);
      expect(stretta.live.mirror).toBe(larga.live.mirror);
      expect(stretta.stagione.mirror).toBe(1); // l'unica riga stagione del fixture
    });

    it("distingue «export non arrivato» da «nessuno su questa selezione»", async () => {
      // Mirror senza nessun legame di stagione: è la situazione vera di oggi.
      await s.replaceRegistro({ madri: MADRI, tratte: TRATTE, legami: [
        { keykey: "1", keyroggia: "R01D01000", metodo: "live" },
      ] });
      const c = await s.conteggiLegami(["R01D02000"], []);
      expect(c.stagione).toEqual({ selezione: 0, mirror: 0 }); // export mai arrivato
      expect(c.live).toEqual({ selezione: 0, mirror: 1 });     // c'è, ma non qui
    });

    it("senza selezione restituisce i soli totali del mirror", async () => {
      const c = await s.conteggiLegami([], []);
      expect(c.live.selezione).toBe(0);
      expect(c.live.mirror).toBeGreaterThan(0);
    });
  });

  /**
   * Il filtro che fino alla issue #27 non c'era: `destinatariDove` guardava
   * roggia e flag_attivo, mai il metodo, e ogni invio raggiungeva l'unione dei
   * due elenchi senza che nessuno l'avesse scelto.
   */
  describe("filtro per legame", () => {
    it("live e stagione danno insiemi diversi sulla stessa tratta", async () => {
      const live = await s.getDestinatariPerTratte(["R01D02000"], "live");
      const stagione = await s.getDestinatariPerTratte(["R01D02000"], "stagione");
      expect(live.map((r) => r.conduttore.keykey).sort()).toEqual(["1", "3"]);
      expect(stagione).toEqual([]);
    });

    it("il legame di stagione prende solo le righe di stagione", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D01000"], "stagione");
      // Su R01D01000 il solo "1" ha anche il legame di stagione.
      expect(righe.map((r) => r.conduttore.keykey)).toEqual(["1"]);
    });

    it("vale anche sulla strada delle madri, quella dei pozzi", async () => {
      // R10DA0002 va anche aggiunta al registro come tratta: un legame senza
      // una tratta nota non è più risolvibile per madre (il sync garantisce
      // che questo non accada mai nei dati veri, sintetizzando la tratta).
      await s.replaceRegistro({
        madri: MADRI,
        tratte: [...TRATTE, { keyroggia: "R10DA0002", name: "Pozzo bresciana - consegna 2", codiceMadre: "R10" }],
        legami: [
          { keykey: "1", keyroggia: "R10DA0001", metodo: "live" },
          { keykey: "3", keyroggia: "R10DA0002", metodo: "stagione" },
        ],
      });
      expect((await s.getDestinatariPerMadri(["R10"], "live")).map((r) => r.conduttore.keykey))
        .toEqual(["1"]);
      expect((await s.getDestinatariPerMadri(["R10"], "stagione")).map((r) => r.conduttore.keykey))
        .toEqual(["3"]);
    });

    it("continua a escludere i cessati, qualunque sia il legame", async () => {
      const righe = await s.getDestinatariPerTratte(["R01D01000"], "live");
      expect(righe.map((r) => r.conduttore.keykey)).not.toContain("2");
    });
  });
});

/**
 * La selezione a cascata dopo l'ereditarietà madre → impianto (issue del
 * 2026-09-10): la madre di un codice a 9 caratteri non è più le sue prime 3
 * posizioni. Per i codici R è l'impianto `IM..` che li rivendica, e 9
 * prefissi su 34 sono spalmati su più impianti — `R08` da solo ne copre 13.
 */
const REGISTRO: RegistroConsorzio = {
  madri: [
    { codice: "IM01A", name: "Bolgare", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" },
    { codice: "IM38A", name: "Bolgare Alta", categoria: "rogge", tipoIrrigazione: null, origine: "impianti" },
    { codice: "S45", name: "Fiume Adda", categoria: "impianti", tipoIrrigazione: null, origine: "orari" },
    { codice: "R29", name: "R29 — non classificata", categoria: "rogge", tipoIrrigazione: null, origine: "servizio" },
  ],
  tratte: [
    // Stesso prefisso R01, due impianti diversi: e' il caso che la regola
    // vecchia sbagliava.
    { keyroggia: "R01D01S02", name: "Bolgare I", codiceMadre: "IM01A" },
    { keyroggia: "R01D10S01", name: "Bolgare Alta I", codiceMadre: "IM38A" },
    { keyroggia: "S45D00001", name: "Comizio 1", codiceMadre: "S45" },
    { keyroggia: "R29D10+++", name: "R29D10+++", codiceMadre: "R29" },
  ],
  legami: [
    { keykey: "1", keyroggia: "R01D01S02", metodo: "live" },
    { keykey: "2", keyroggia: "R01D10S01", metodo: "live" },
    { keykey: "3", keyroggia: "S45D00001", metodo: "live" },
    { keykey: "9", keyroggia: "R01D01S02", metodo: "live" }, // cessato
    { keykey: "1", keyroggia: "R01D01S02", metodo: "stagione" },
  ],
};

const CONDUTTORI = [
  { keykey: "1", descrizione: "rossi", email: "r@e.it", cellulare: "333", tipoEmail: "normale" as const, flagAttivo: true, dataConsenso: null },
  { keykey: "2", descrizione: "verdi", email: "v@e.it", cellulare: "0", tipoEmail: "pec" as const, flagAttivo: true, dataConsenso: null },
  { keykey: "3", descrizione: "bianchi", email: "b@e.it", cellulare: null, tipoEmail: "pec" as const, flagAttivo: true, dataConsenso: null },
  { keykey: "9", descrizione: "cessato", email: "c@e.it", cellulare: null, tipoEmail: "normale" as const, flagAttivo: false, dataConsenso: null },
];

describe("selezione per madre — la madre non e' il prefisso", () => {
  let s: MemStorage;
  beforeEach(async () => {
    s = new MemStorage();
    await s.replaceRegistro(REGISTRO);
    await s.replaceConduttori(CONDUTTORI);
  });

  it("due impianti con lo stesso prefisso R01 restano due madri distinte", async () => {
    const t1 = await s.getTratteDiMadri(["IM01A"]);
    expect(t1.map((t) => t.keyroggia)).toEqual(["R01D01S02"]);
    const t2 = await s.getTratteDiMadri(["IM38A"]);
    expect(t2.map((t) => t.keyroggia)).toEqual(["R01D10S01"]);
  });

  it("i destinatari di una madre sono quelli delle sue tratte, non del prefisso", async () => {
    const d = await s.getDestinatariPerMadri(["IM01A"], "live");
    expect(d.map((x) => x.conduttore.keykey)).toEqual(["1"]);
    // Se risolvesse per prefisso prenderebbe anche il 2, che sta su IM38A.
  });

  it("un conduttore cessato non compare mai", async () => {
    const d = await s.getDestinatariPerMadri(["IM01A"], "live");
    expect(d.map((x) => x.conduttore.keykey)).not.toContain("9");
  });

  it("lo 0 del WS non arriva come numero", async () => {
    const d = await s.getDestinatariPerMadri(["IM38A"], "live");
    expect(d[0].conduttore.cellulare).toBeNull();
  });

  it("il legame filtra: stagione non vede i legami live", async () => {
    expect((await s.getDestinatariPerMadri(["S45"], "stagione")).length).toBe(0);
    expect((await s.getDestinatariPerMadri(["S45"], "live")).length).toBe(1);
  });

  it("la descrizione della tratta arriva nello snapshot", async () => {
    const d = await s.getDestinatariPerTratte(["R01D01S02"], "live");
    expect(d[0].roggiaDescrizione).toBe("Bolgare I");
  });

  it("le madri selezionabili portano categoria e origine", async () => {
    const m = await s.getMadriSelezionabili();
    expect(m.find((x) => x.codicemadre === "S45")).toEqual({
      codicemadre: "S45", name: "Fiume Adda", categoria: "impianti", origine: "orari",
    });
    expect(m.find((x) => x.codicemadre === "R29")?.origine).toBe("servizio");
  });

  it("due tratte selezionate, anche di madri diverse, restano una comunicazione sola", async () => {
    const s2 = new MemStorage();
    await s2.replaceRegistro({
      madri: REGISTRO.madri,
      tratte: REGISTRO.tratte,
      legami: [
        { keykey: "1", keyroggia: "R01D01S02", metodo: "live" },
        { keykey: "1", keyroggia: "R01D10S01", metodo: "live" },
      ],
    });
    await s2.replaceConduttori(CONDUTTORI);
    const righe = await s2.getDestinatariPerMadri(["IM01A", "IM38A"], "live");
    expect(righe.length).toBe(2);            // due coppie (conduttore, tratta)
    // `aggregaDestinatari` vuole la chiave esplicita (keykey): non ha un
    // ripiego implicito, a differenza di quanto suggerito nel brief.
    expect(aggregaDestinatari(righe, (c) => c.keykey).length).toBe(1);  // una comunicazione (issue #5)
  });
});

/**
 * Il testo SMS nel dettaglio dello Storico (issue #28).
 *
 * Il dettaglio letto dalla modale di Storico Notifiche porta `messaggioSms`
 * accanto a `messaggio`: senza questo campo il testo scritto nel riquadro SMS
 * di Invia notifica non si vedeva più da nessuna parte una volta salvato.
 */
describe("getNotificationHistoryDetail", () => {
  it("porta il testo SMS quando la notifica ce l'ha", async () => {
    const s = new MemStorage();
    const n = await s.createNotification({
      tipo: "chiusura",
      classificazione: "ordinaria",
      subject: "Chiusura tratta",
      message: "Testo email",
      messageSms: "Testo SMS breve",
    });
    const dettaglio = await s.getNotificationHistoryDetail(n.id);
    expect(dettaglio?.messaggioSms).toBe("Testo SMS breve");
  });

  it("resta null su una notifica senza testo SMS", async () => {
    const s = new MemStorage();
    const n = await s.createNotification({
      tipo: "chiusura",
      classificazione: "ordinaria",
      subject: "Chiusura tratta",
      message: "Testo email",
    });
    const dettaglio = await s.getNotificationHistoryDetail(n.id);
    expect(dettaglio?.messaggioSms).toBeNull();
  });
});
