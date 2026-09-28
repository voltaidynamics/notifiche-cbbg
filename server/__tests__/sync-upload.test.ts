import {
  mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { validaPayload, percorsoEntita, salvaFileEntita, CARTELLA_DATI } from "../sync/upload";
import { WS_ENTITIES, leggiConfigWs, type WsEntity } from "../sync/config";
import { creaSource, estraiArray } from "../sync/source";

// Dati veri consegnati dal consorzio (vedi task-7b-brief.md): usarli come fixture
// per i test di plausibilità è meglio che inventarne, perché sono esattamente
// ciò che l'utente caricherà dall'interfaccia.
const CARTELLA_FIXTURE = resolve(process.cwd(), "dati-ws/tester-2026-09");
function fixture(nome: string): string {
  return readFileSync(join(CARTELLA_FIXTURE, nome), "utf8");
}

// Riga minima e valida per ciascuna entità: usata come base "genererica" nei
// test di meccanica (forme accettate, BOM, salvataggio) che prima usavano
// l'entità "comuni", non più fra le otto.
const MADRE_IMPIANTO_VALIDA = { codiceimpianto: "IM01A", name: "Impianto Bolgare" };
const MADRE_ORARI_VALIDA = { codicemadre: "S02", name: "Impianto Pluvirriguo Borgogna" };
const TRATTA_IMPIANTO_VALIDA = { codiceimpianto: "IM01A", keyroggia: "R01D01S02", name: "Tratta" };
const TRATTA_ORARI_VALIDA = { keyroggia: "S02D00000", name: "Impianto Globale" };
const LEGAME_VALIDO = { keykey: "1", keyroggia: "S02DA0002" };

describe("percorsoEntita", () => {
  it("dà a ogni entità un file diverso", () => {
    const percorsi = WS_ENTITIES.map((e) => percorsoEntita(e));
    expect(new Set(percorsi).size).toBe(WS_ENTITIES.length);
  });

  it("mette i file dentro CARTELLA_DATI", () => {
    expect(percorsoEntita("conduttori")).toBe(`${CARTELLA_DATI}/conduttori.json`);
  });

  it("CARTELLA_DATI punta davvero alla cartella dati-ws", () => {
    // La prova sopra confronta la costante con se stessa e passerebbe anche
    // se CARTELLA_DATI fosse "/etc": qui si verifica il valore vero.
    expect(CARTELLA_DATI.endsWith("dati-ws")).toBe(true);
  });

  it("accetta una cartella alternativa", () => {
    expect(percorsoEntita("madriImpianti", "/tmp/x")).toBe("/tmp/x/madri-impianti.json");
  });
});

describe("validaPayload — forme accettate", () => {
  it("accetta un array puro", () => {
    const testo = JSON.stringify([MADRE_IMPIANTO_VALIDA]);
    expect(validaPayload("madriImpianti", testo).righe).toBe(1);
  });

  it("accetta un oggetto che contiene l'array", () => {
    const testo = JSON.stringify({ data: [MADRE_IMPIANTO_VALIDA] });
    expect(validaPayload("madriImpianti", testo).righe).toBe(1);
  });

  it("tollera il BOM in testa al file", () => {
    const testo = "﻿" + JSON.stringify([MADRE_IMPIANTO_VALIDA]);
    expect(validaPayload("madriImpianti", testo).righe).toBe(1);
  });

  it("accetta i numeri dove il WS manda stringhe", () => {
    const testo = JSON.stringify([{ codiceimpianto: 17, name: "Alfa" }]);
    expect(validaPayload("madriImpianti", testo).righe).toBe(1);
  });
});

describe("validaPayload — rifiuti", () => {
  it("rifiuta un JSON malformato", () => {
    expect(() => validaPayload("madriImpianti", "{non json")).toThrow(/JSON non valido/i);
  });

  it("rifiuta una forma senza array", () => {
    expect(() => validaPayload("madriImpianti", '"pippo"')).toThrow(/non riconosciuta/i);
  });

  it("rifiuta un array vuoto", () => {
    expect(() => validaPayload("madriImpianti", "[]")).toThrow(/non contiene righe/i);
  });

  it("rifiuta una riga non conforme indicandone la posizione 1-based", () => {
    const testo = JSON.stringify([
      MADRE_IMPIANTO_VALIDA,
      { codiceimpianto: "IM02A", name: "Borgogna" },
      { name: "senza codice" },
    ]);
    expect(() => validaPayload("madriImpianti", testo)).toThrow(/Riga 3/);
  });
});

describe("validaPayload — parser per entità", () => {
  // Riga quasi vuota, ma sufficiente a superare i discriminatori (A3) e
  // arrivare fino al parser: tratteImpianti ha un campo obbligatorio ai fini
  // del discriminatore (codiceimpianto) che una riga completamente vuota non
  // porterebbe mai. I tre legami ne hanno DUE (keykey e keyroggia, dalla
  // correzione post-revisione): una riga con entrambi supera i discriminatori
  // e arriva a un parser che la accetta per intero, senza sollevare — motivo
  // per cui il test qui sotto non pretende più che ogni entità sollevi un
  // errore "Riga 1:", solo che non sollevi mai per un parser mancante.
  const RIGA_QUASI_VUOTA: Partial<Record<WsEntity, Record<string, unknown>>> = {
    tratteImpianti: { codiceimpianto: "IM01A" },
    legamiLiveImpianti: LEGAME_VALIDO,
    legamiLiveOrari: LEGAME_VALIDO,
    legamiStagione: LEGAME_VALIDO,
  };

  it("ogni entità di WS_ENTITIES ha un file e un parser", () => {
    // Test di completezza: una nona entità aggiunta in futuro deve far
    // fallire la suite, non restare silenziosamente non caricabile.
    //
    // La prova è "not a function": se PARSER[e] fosse mancante, `parser`
    // sarebbe `undefined` e chiamarlo solleverebbe un TypeError con quel
    // testo, indipendentemente dal fatto che la riga scelta venga poi
    // accettata o rifiutata per altri motivi — è quell'eccezione, non un
    // generico "Riga 1: ...", il segnale che il test cerca davvero.
    WS_ENTITIES.forEach((e) => {
      expect(percorsoEntita(e)).toMatch(/\.json$/);

      const riga = RIGA_QUASI_VUOTA[e] ?? {};
      let messaggio = "";
      try {
        validaPayload(e, JSON.stringify([riga]));
      } catch (err) {
        messaggio = (err as Error).message;
      }
      expect(messaggio).not.toMatch(/not a function/);
    });
  });
});

describe("validaPayload — avvisi sulle righe scartate (A4)", () => {
  it("tratteImpianti: avvisa sulle aggregazioni non IM senza rifiutare (dati veri)", () => {
    // dati-ws/tester-2026-09/LEGAME_RDA9_MADRE_I_getimpiantirogge_all.json:
    // 1104 righe, di cui 731 IM, 312 ZM e 61 NM (373 da scartare).
    const esito = validaPayload("tratteImpianti", fixture("LEGAME_RDA9_MADRE_I_getimpiantirogge_all.json"));
    expect(esito.righe).toBe(1104);
    expect(esito.avvisi).toHaveLength(1);
    expect(esito.avvisi[0]).toMatch(/373/);
    expect(esito.avvisi[0]).toMatch(/aggregazioni diverse da IM/i);
  });

  it("tratteImpianti: nessun avviso quando tutte le righe sono IM", () => {
    const testo = JSON.stringify([TRATTA_IMPIANTO_VALIDA]);
    expect(validaPayload("tratteImpianti", testo).avvisi).toEqual([]);
  });

  it("tratteImpianti: rifiuta il file quando ogni riga verrebbe scartata", () => {
    const testo = JSON.stringify([
      { codiceimpianto: "NM01", keyroggia: "R01D01S02", name: "Scartata" },
      { codiceimpianto: "ZM02", keyroggia: "R01D01S03", name: "Scartata anche lei" },
    ]);
    expect(() => validaPayload("tratteImpianti", testo)).toThrow(/verrebbero scartate/i);
  });

  it("legamiLiveOrari: nessun avviso su un vero export senza codici N (dati veri)", () => {
    // dati-ws/tester-2026-09/LEGAME_LIVE_S_getconduttoriroggelive_S.json: 1479
    // righe, nessuna su un codice che comincia per N.
    const esito = validaPayload("legamiLiveOrari", fixture("LEGAME_LIVE_S_getconduttoriroggelive_S.json"));
    expect(esito.righe).toBe(1479);
    expect(esito.avvisi).toEqual([]);
  });

  it("legamiLiveOrari: avvisa sui codici N senza rifiutare", () => {
    const testo = JSON.stringify([
      LEGAME_VALIDO,
      { keykey: "2", keyroggia: "N45D00001" },
      { keykey: "3", keyroggia: "N45D00002" },
    ]);
    const esito = validaPayload("legamiLiveOrari", testo);
    expect(esito.righe).toBe(3);
    expect(esito.avvisi).toHaveLength(1);
    expect(esito.avvisi[0]).toMatch(/2/);
    expect(esito.avvisi[0]).toMatch(/iniziano per N/i);
  });

  it("legamiLiveOrari: l'avviso nomina entrambe le cause di scarto, non solo i codici N", () => {
    // parseLegame scarta sia i codici N sia i keyroggia troppo corti per
    // avere una madre, e li somma in un unico contatore: l'avviso deve
    // nominare entrambe le cause, altrimenti un file con solo la seconda
    // farebbe leggere una diagnosi falsa ("codici N" quando non ce n'è
    // nessuno).
    const testo = JSON.stringify([
      LEGAME_VALIDO,
      { keykey: "9", keyroggia: "R0" }, // troppo corto, non un codice N
    ]);
    const esito = validaPayload("legamiLiveOrari", testo);
    expect(esito.avvisi).toHaveLength(1);
    expect(esito.avvisi[0]).toMatch(/1/);
    expect(esito.avvisi[0]).toMatch(/iniziano per N/i);
    expect(esito.avvisi[0]).toMatch(/troppo cort/i);
  });

  it("legamiLiveOrari: rifiuta il file quando ogni riga è su un codice N", () => {
    const testo = JSON.stringify([
      { keykey: "1", keyroggia: "N45D00001" },
      { keykey: "2", keyroggia: "N45D00002" },
    ]);
    expect(() => validaPayload("legamiLiveOrari", testo)).toThrow(/verrebbero scartate/i);
  });

  it("tratteOrari: avvisa sui non-gruppi di consegna nel vero export (dati veri)", () => {
    // dati-ws/tester-2026-09/ELENCO_SDA9_getroggeorari_S.json: 198 righe, ma
    // 91 di quelle non sono gruppi di consegna (scarichi, sfiati, nodi,
    // saracinesche: il consorzio ci ha chiesto di scartarle).
    const esito = validaPayload("tratteOrari", fixture("ELENCO_SDA9_getroggeorari_S.json"));
    expect(esito.righe).toBe(198);
    expect(esito.avvisi).toHaveLength(1);
    // Il messaggio nomina entrambe le cause, non solo "troppo corto"
    expect(esito.avvisi[0]).toMatch(/91/);
    expect(esito.avvisi[0]).toMatch(/non sono gruppi di consegna/i);
    expect(esito.avvisi[0]).toMatch(/troppo corto/i);
  });

  it("tratteOrari: avvisa sui keyroggia troppo corti senza rifiutare", () => {
    const testo = JSON.stringify([
      TRATTA_ORARI_VALIDA,
      { keyroggia: "S4", name: "Codice monco" },
    ]);
    const esito = validaPayload("tratteOrari", testo);
    expect(esito.righe).toBe(2);
    expect(esito.avvisi).toHaveLength(1);
    expect(esito.avvisi[0]).toMatch(/1/);
    expect(esito.avvisi[0]).toMatch(/troppo corto/i);
  });

  it("tratteOrari: rifiuta il file quando ogni riga ha un keyroggia troppo corto", () => {
    // "R0" del test originale iniziava per R e ricadeva anche lui nel nuovo
    // controllo di prefisso (Rilievo 8): qui serve un codice troppo corto ma
    // non confondibile con la gerarchia R, quindi "S0".
    const testo = JSON.stringify([{ keyroggia: "S4" }, { keyroggia: "S0" }]);
    expect(() => validaPayload("tratteOrari", testo)).toThrow(/verrebbero scartate/i);
  });

  it("non produce avvisi per le entità senza righe scartabili", () => {
    const testo = JSON.stringify([MADRE_IMPIANTO_VALIDA]);
    expect(validaPayload("madriImpianti", testo).avvisi).toEqual([]);
  });
});

describe("salvaFileEntita", () => {
  const buffer = (v: unknown) => Buffer.from(JSON.stringify(v), "utf8");
  const madriValide = [MADRE_IMPIANTO_VALIDA];

  it("scrive il file e ne restituisce percorso e conteggio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    const esito = await salvaFileEntita("madriImpianti", buffer(madriValide), dir);

    expect(esito.righe).toBe(1);
    expect(esito.percorso).toBe(join(dir, "madri-impianti.json"));
    expect(JSON.parse(readFileSync(esito.percorso, "utf8"))).toEqual(madriValide);
  });

  it("crea la cartella se non esiste", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "upload-")), "annidata", "dati-ws");
    const esito = await salvaFileEntita("madriImpianti", buffer(madriValide), dir);
    expect(existsSync(esito.percorso)).toBe(true);
  });

  it("sovrascrive il file precedente", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    await salvaFileEntita("madriImpianti", buffer(madriValide), dir);
    await salvaFileEntita("madriImpianti", buffer([
      { codiceimpianto: "IM02A", name: "Borgogna" },
      { codiceimpianto: "IM03A", name: "Cologno" },
    ]), dir);

    const scritto = JSON.parse(readFileSync(join(dir, "madri-impianti.json"), "utf8"));
    expect(scritto).toHaveLength(2);
  });

  it("NON tocca il file buono quando il nuovo payload è rifiutato", async () => {
    // La garanzia centrale: un upload sbagliato non deve poter distruggere
    // l'anagrafica già caricata.
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    await salvaFileEntita("madriImpianti", buffer(madriValide), dir);
    const primaDelTentativo = readFileSync(join(dir, "madri-impianti.json"), "utf8");

    await expect(salvaFileEntita("madriImpianti", Buffer.from("{rotto", "utf8"), dir))
      .rejects.toThrow(/JSON non valido/i);
    await expect(salvaFileEntita("madriImpianti", buffer([]), dir))
      .rejects.toThrow(/non contiene righe/i);
    await expect(salvaFileEntita("madriImpianti", buffer([{ name: "senza codice" }]), dir))
      .rejects.toThrow(/Riga 1/);

    expect(readFileSync(join(dir, "madri-impianti.json"), "utf8")).toBe(primaDelTentativo);
  });

  it("un rifiuto in validazione non crea nessun file (nemmeno temporaneo)", async () => {
    // Questo caso fallisce prima di ogni I/O (validaPayload viene chiamata
    // prima di mkdir/writeFile), quindi non dice nulla sul cleanup del
    // temporaneo: quella garanzia è verificata dal test successivo, che fa
    // fallire il rename dopo che il temporaneo è stato scritto davvero.
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    await salvaFileEntita("madriImpianti", buffer(madriValide), dir);
    await expect(salvaFileEntita("madriImpianti", Buffer.from("{rotto", "utf8"), dir)).rejects.toThrow();

    expect(readdirSync(dir)).toEqual(["madri-impianti.json"]);
  });

  it("pulisce il temporaneo quando il rename fallisce per I/O", async () => {
    // Il test precedente copre solo fallimenti di validazione (prima dell'I/O).
    // Questo testa l'unlink nel catch quando writeFile riesce ma rename fallisce.
    // Creiamo una directory dove il file dovrebbe andare, così rename avrà EISDIR/ENOTDIR.
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    mkdirSync(join(dir, "madri-impianti.json"));

    await expect(salvaFileEntita("madriImpianti", buffer(madriValide), dir))
      .rejects.toThrow();

    // Verifica che nella cartella non ci sia nessun file .tmp rimasto
    const files = readdirSync(dir);
    expect(files).toEqual(["madri-impianti.json"]); // Solo la directory, no .tmp
    expect(files.some((f) => f.includes(".tmp"))).toBe(false);
  });

  it("propaga gli avvisi della validazione", async () => {
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    const esito = await salvaFileEntita("tratteOrari", buffer([
      TRATTA_ORARI_VALIDA,
      { keyroggia: "S4", name: "Codice monco" },
    ]), dir);
    expect(esito.avvisi[0]).toMatch(/troppo corto/i);
  });

  it("scrive un file che creaSource sa rileggere", async () => {
    // Il patto fra upload e sync: quello che accettiamo qui, il sync lo legge.
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    const esito = await salvaFileEntita("madriImpianti", buffer({ data: madriValide }), dir);

    const source = creaSource(leggiConfigWs({
      "ws.madriImpianti.mode": "file",
      "ws.madriImpianti.path": esito.percorso,
    }));
    expect(estraiArray(await source.fetchRaw("madriImpianti"))).toHaveLength(1);
  });

  it("un payload con BOM sopravvive fino a creaSource (Correzione 1)", async () => {
    // validaPayload ripuliva il BOM solo su una copia in memoria, ma
    // salvaFileEntita scriveva su disco il buffer originale: il file restava
    // col BOM, l'upload diceva "riuscito", e il sync notturno (che legge con
    // un JSON.parse senza gestione del BOM, vedi source.ts) falliva. Senza il
    // fix in salvaFileEntita questo test fallisce qui sotto, sull'ultima
    // asserzione, con "Unexpected token" — non sulla validazione.
    const dir = mkdtempSync(join(tmpdir(), "upload-"));
    const conBom = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(JSON.stringify(madriValide), "utf8"),
    ]);
    const esito = await salvaFileEntita("madriImpianti", conBom, dir);
    expect(esito.righe).toBe(1);

    const source = creaSource(leggiConfigWs({
      "ws.madriImpianti.mode": "file",
      "ws.madriImpianti.path": esito.percorso,
    }));
    expect(estraiArray(await source.fetchRaw("madriImpianti"))).toHaveLength(1);
  });
});

describe("validaPayload — discrimina coppie di entità che i parser tolleranti confondono", () => {
  it("rifiuta un file di legami scelto per conduttori", () => {
    // Ogni riga ha keykey (l'unico campo obbligatorio del parser conduttori)
    // ma nessuna descrizione/email/cellulare: è la forma di un export di
    // legami, non di conduttori.
    const legami = JSON.stringify([
      { keykey: "1", keyroggia: "S02DA0002" },
      { keykey: "2", keyroggia: "S02DA0003" },
    ]);
    expect(() => validaPayload("conduttori", legami))
      .toThrow(/non sembra un'anagrafica conduttori/i);
  });

  it("accetta un vero export di conduttori anche se solo alcune righe hanno l'email", () => {
    // Deve bastare UNA riga con dati reali: il controllo non è "tutte le
    // righe", altrimenti un export legittimo con email parziali verrebbe
    // rifiutato a torto.
    const conduttori = JSON.stringify([
      { keykey: "1", descrizione: "Rossi Mario", email: null, cellulare: null },
      { keykey: "2", descrizione: "", email: "verdi@example.com", cellulare: null },
      { keykey: "3", descrizione: "", email: null, cellulare: null },
    ]);
    expect(validaPayload("conduttori", conduttori).righe).toBe(3);
  });

  it("rifiuta un file di tratte (impianto) scelto per madri impianti", () => {
    // Ogni riga ha codiceimpianto (l'unico campo obbligatorio del parser
    // madriImpianti) ma anche keyroggia, che una riga di madre vera non porta.
    const tratte = JSON.stringify([TRATTA_IMPIANTO_VALIDA]);
    expect(() => validaPayload("madriImpianti", tratte))
      .toThrow(/non sembra un'anagrafica di impianti/i);
  });

  it("accetta un vero export di madri impianti (dati veri)", () => {
    // dati-ws/tester-2026-09/ANAGRAFICA_I_getimpianti.json: 62 impianti.
    const esito = validaPayload("madriImpianti", fixture("ANAGRAFICA_I_getimpianti.json"));
    expect(esito.righe).toBe(62);
  });

  it("rifiuta un file di tratte (orari) scelto per madri orari", () => {
    // Ogni riga ha codicemadre? No: ha keyroggia, che una riga di madre a
    // orari vera non porta.
    const tratte = JSON.stringify([TRATTA_ORARI_VALIDA]);
    expect(() => validaPayload("madriOrari", tratte))
      .toThrow(/non sembra un'anagrafica di impianti a orari/i);
  });

  it("accetta un vero export di madri a orari (dati veri)", () => {
    // dati-ws/tester-2026-09/ANAGRAFICA_S_getroggemadri_orarigruppiconsegna.json: 4 madri.
    const esito = validaPayload("madriOrari", fixture("ANAGRAFICA_S_getroggemadri_orarigruppiconsegna.json"));
    expect(esito.righe).toBe(4);
  });

  it("rifiuta un file di tratte a orari (getroggeorari/S) scelto per tratte con impianto", () => {
    // ELENCO_SDA9 non porta codiceimpianto su nessuna riga.
    expect(() => validaPayload("tratteImpianti", fixture("ELENCO_SDA9_getroggeorari_S.json")))
      .toThrow(/getroggeorari\/S/);
  });

  it("rifiuta un file di tratte con impianto (getimpiantirogge/all) scelto per tratte a orari", () => {
    // Esempio del brief: LEGAME_RDA9 porta codiceimpianto su ogni riga, e
    // tratteOrari non lo vuole su nessuna.
    expect(() => validaPayload("tratteOrari", fixture("LEGAME_RDA9_MADRE_I_getimpiantirogge_all.json")))
      .toThrow(/getimpiantirogge\/all/);
  });

  it("rifiuta un file di tratte (senza keykey) scelto per legami", () => {
    // ELENCO_SDA9 non porta keykey su nessuna riga: non è un file di legami.
    expect(() => validaPayload("legamiLiveOrari", fixture("ELENCO_SDA9_getroggeorari_S.json")))
      .toThrow(/non sembra un elenco di legami/i);
  });

  it("rifiuta un file di conduttori scelto per legami (dati veri, correzione post-revisione)", () => {
    // Scambio plausibile segnalato dal revisore: i conduttori hanno anche
    // loro un keykey (il primo discriminatore non basta a distinguerli), e
    // il file dei legami si chiama "getconduttoriroggelive_S.json" — la
    // parola "conduttori" è nel nome dell'endpoint. Senza il controllo su
    // keyroggia, l'utente vedrebbe "Riga 1: keyroggia: Invalid input" invece
    // del messaggio che gli dice cosa ha probabilmente sbagliato.
    // dati-ws/tester-2026-09/ANAGRAFICA_CONDUTTORI_getconduttoriconemailetelefono.json:
    // 4981 conduttori, nessuno con un campo keyroggia.
    expect(() => validaPayload(
      "legamiLiveOrari",
      fixture("ANAGRAFICA_CONDUTTORI_getconduttoriconemailetelefono.json"),
    )).toThrow(/non sembra un elenco di legami.*conduttori/is);
  });

  // Rilievo 8 della revisione finale: `madriOrari`/`roggeMadri` condividono il
  // campo `codicemadre`, e `tratteOrari`/`roggeFiglie` condividono `keyroggia`.
  // Senza un controllo sul prefisso, caricare il file della gerarchia R nella
  // casella sbagliata supera la validazione, e il sync notturno prova a
  // scrivere tratte R con la madre ricavata dal prefisso — la regola vietata
  // per le R.
  it("rifiuta un file di rogge madri (R) scelto per madri a orari", () => {
    const roggeMadri = JSON.stringify([
      { codicemadre: "R02", name: "R02 - Roggia borgogna e derivate" },
      { codicemadre: "R08", name: "R08 - Roggia serio e derivate" },
    ]);
    expect(() => validaPayload("madriOrari", roggeMadri))
      .toThrow(/iniziano per S, non per R.*getroggemadri\/orari/is);
  });

  it("rifiuta un file di figlie della gerarchia R scelto per tratte a orari", () => {
    const roggeFiglie = JSON.stringify([
      { keyroggia: "R08D02S01", name: "Roggia Nuova Ramo A" },
      { keyroggia: "R02D10+++", name: "Fosso Calcinate" },
    ]);
    expect(() => validaPayload("tratteOrari", roggeFiglie))
      .toThrow(/iniziano per S, non per R.*getroggeorari\/R/is);
  });

  it("accetta comunque un vero export di madri e tratte a orari (dati veri)", () => {
    // Le fixture vere hanno tutte i loro codici S: il nuovo controllo non deve
    // toccarle.
    expect(validaPayload("madriOrari", fixture("ANAGRAFICA_S_getroggemadri_orarigruppiconsegna.json")).righe)
      .toBe(4);
    expect(validaPayload("tratteOrari", fixture("ELENCO_SDA9_getroggeorari_S.json")).righe)
      .toBeGreaterThan(0);
  });
});
