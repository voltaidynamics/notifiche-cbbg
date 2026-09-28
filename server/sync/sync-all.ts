import { storage as storageDefault, type IStorage } from "../storage";
import {
  parseConduttore,
  parseMadreImpianto, parseMadreOrari, parseTrattaImpianto, parseTrattaOrari,
  parseLegame, parseRoggiaMadre, parseRoggiaFiglia, tipoIrrigazioneRiconosciuto, eGruppoDiConsegna,
  type MadreInsert, type TrattaInsert, type LegameInsert, type MetodoLegame,
  type RoggiaMadreInsert, type TrattaRoggiaInsert,
} from "@shared/ws-consorzio";
import { sintetizzaServizio } from "@shared/madri-servizio";
import { componiGerarchia, nomiDiGerarchia, NOMI_VUOTI, type NomiGerarchiaRogge } from "@shared/gerarchia-rogge";
import { dedupByKey } from "./dedup";
import { leggiConfigWs, ETICHETTE_ENTITA, type WsEntity } from "./config";
import { creaSource, estraiArray, SorgenteNonConfigurata, type WsSource } from "./source";

export type SyncDeps = { source: WsSource; storage: IStorage };

export type EsitoSync = {
  syncLogId: number;
  status: "success" | "partial" | "failed";
  conteggi: Record<string, number>;
  errori: string[];
  /** Etichette delle entità non configurate: saltate, non fallite (Correzione 2). */
  saltate: string[];
};

export class SyncGiaInCorso extends Error {
  constructor() {
    super("Sincronizzazione già in corso");
    this.name = "SyncGiaInCorso";
  }
}

// Lucchetto di processo. pm2 esegue l'app in modalità fork (processo singolo),
// quindi è sufficiente. Passando a cluster andrebbe spostato su app_settings.
let inCorso = false;

export function syncInCorso(): boolean {
  return inCorso;
}

async function risolviDeps(deps?: Partial<SyncDeps>): Promise<SyncDeps> {
  const storage = deps?.storage ?? storageDefault;
  if (deps?.source) return { storage, source: deps.source };
  const settings = await storage.getAllSettings();
  return { storage, source: creaSource(leggiConfigWs(settings)) };
}

/** Raccoglie l'esito di un'entità: righe scritte, errore, oppure saltata. */
type Raccolta = {
  conteggi: Record<string, number>;
  errori: string[];
  /** Etichette delle entità saltate perché non configurate (Correzione 2). */
  saltate: string[];
  riuscite: number;
};

function registraErrore(r: Raccolta, entita: WsEntity, e: unknown): void {
  if (e instanceof SorgenteNonConfigurata) {
    // Non configurata = saltata, non un errore vero — ma va comunque tracciata:
    // altrimenti "zero entità configurate" è indistinguibile da "tutto ok" (Correzione 2).
    r.saltate.push(ETICHETTE_ENTITA[entita]);
    return;
  }
  r.errori.push(`${ETICHETTE_ENTITA[entita]}: ${(e as Error).message}`);
}

/** Le sette entità che riempiono madri/tratte/legami. Si scrivono insieme. */
const ENTITA_REGISTRO: WsEntity[] = [
  "madriImpianti", "madriOrari", "tratteImpianti", "tratteOrari",
  "legamiLiveImpianti", "legamiLiveOrari", "legamiStagione",
];

/** Le due entità della seconda gerarchia. Si scrivono insieme, e da sole. */
const ENTITA_ROGGE: WsEntity[] = ["roggeMadri", "roggeFiglie"];

function conta(r: Raccolta, chiave: string, quanti: number): void {
  r.conteggi[chiave] = (r.conteggi[chiave] ?? 0) + quanti;
}

/**
 * La seconda gerarchia: rogge madri R e loro figlie (issue #49).
 *
 * Gruppo a sé, e non un'aggiunta alle sette entità del registro: se fosse lì
 * dentro, finché queste due sorgenti non sono configurate **l'intero registro
 * smetterebbe di aggiornarsi**, che è esattamente lo stato in cui si troverebbe
 * la produzione il giorno del deploy.
 *
 * Restituisce i nomi veri del consorzio, che servono subito dopo alle righe di
 * servizio del registro. Se il gruppo non è stato letto, si rileggono dalle
 * tabelle (quelle di ieri): altrimenti il nome di una madre di servizio farebbe
 * avanti-indietro fra una notte e l'altra a seconda di come è andata la corsa.
 */
async function eseguiGerarchiaRogge(
  r: Raccolta,
  { source, storage }: SyncDeps,
): Promise<NomiGerarchiaRogge> {
  const madri: RoggiaMadreInsert[] = [];
  const figlie: TrattaRoggiaInsert[] = [];
  let lette = 0;
  let scartate = 0;

  /**
   * I nomi di ripiego: quelli di ieri, riletti dalle tabelle. **Deve** poter
   * fallire senza propagare (Rilievo 1 della revisione finale): il caso reale
   * è proprio quello — `0013` non ancora applicata, `madri_rogge` non esiste —
   * e prima di questa rete un'eccezione qui usciva da `eseguiGerarchiaRogge`
   * senza essere raccolta, interrompeva `eseguiCorpo` a metà e il registro dei
   * sette non veniva più scritto: lo stato della produzione il giorno del
   * deploy, con le due entità nuove non ancora configurate.
   */
  async function nomiDiRipiego(): Promise<NomiGerarchiaRogge> {
    try {
      return await storage.getNomiGerarchiaRogge();
    } catch (e) {
      r.errori.push(`Rogge madri: impossibile rileggere i nomi già in tabella (${(e as Error).message}).`);
      return NOMI_VUOTI;
    }
  }

  try {
    const letti: RoggiaMadreInsert[] = [];
    for (const g of estraiArray(await source.fetchRaw("roggeMadri"))) {
      const m = parseRoggiaMadre(g);
      if (m === null) scartate++;
      else letti.push(m);
    }
    madri.push(...letti);
    lette++;
  } catch (e) {
    registraErrore(r, "roggeMadri", e);
  }

  try {
    const letti: TrattaRoggiaInsert[] = [];
    for (const g of estraiArray(await source.fetchRaw("roggeFiglie"))) {
      const f = parseRoggiaFiglia(g);
      if (f === null) scartate++;
      else letti.push(f);
    }
    figlie.push(...letti);
    lette++;
  } catch (e) {
    registraErrore(r, "roggeFiglie", e);
  }

  if (lette < ENTITA_ROGGE.length) {
    if (lette > 0) {
      r.errori.push(
        "Rogge madri: gerarchia non scritta perché una delle due sorgenti non è stata letta. La precedente resta invariata.",
      );
    }
    return await nomiDiRipiego();
  }

  // Rilievo 5 della revisione finale: un `[]`/`null` vero da una delle due
  // sorgenti non deve azzerare in silenzio le due tabelle con `status:
  // success` — si tiene la gerarchia di ieri, si dice quale lista era vuota,
  // e i nomi per le righe di servizio si rileggono da lì. Un consorzio che
  // manda davvero zero figlie (o zero madri) è un caso da vedere a mano, non
  // da subire in silenzio: senza questo controllo la sintesi perderebbe anche
  // il nome vero delle righe di servizio nello stesso giro, e quel nome finisce
  // fotografato in `notification_targets` a ogni invio successivo.
  if (madri.length === 0 || figlie.length === 0) {
    const vuote = [
      madri.length === 0 ? "delle rogge madri" : null,
      figlie.length === 0 ? "delle figlie" : null,
    ].filter((x): x is string => x !== null).join(" e ");
    r.errori.push(
      `Rogge madri: gerarchia non scritta perché la lista ${vuote} è arrivata vuota. La precedente resta invariata.`,
    );
    return await nomiDiRipiego();
  }

  try {
    const { gerarchia, senzaMadre, madriDuplicate } = componiGerarchia(madri, figlie);
    const conteggi = await storage.replaceGerarchiaRogge(gerarchia);
    r.conteggi.madriRogge = conteggi.madri;
    r.conteggi.tratteRogge = conteggi.tratte;
    conta(r, "roggeFiglieScartate", scartate);
    conta(r, "roggeFiglieSenzaMadre", senzaMadre);
    conta(r, "roggeMadriDuplicate", madriDuplicate);
    r.riuscite++;
    return nomiDiGerarchia(gerarchia);
  } catch (e) {
    r.errori.push(`Rogge madri: ${(e as Error).message}`);
    return await nomiDiRipiego();
  }
}

/**
 * Corpo del sync: i conduttori per conto loro, il registro tutto insieme.
 *
 * Nessuna eccezione esce di qui: ogni passo che può fallire è dentro un
 * try/catch che alimenta `r.errori`/`r.riuscite`, così l'esito è sempre
 * determinabile e il log può sempre essere chiuso.
 */
async function eseguiCorpo(r: Raccolta, { source, storage }: SyncDeps): Promise<void> {
  // 1. Conduttori: non dipendono dal registro e si scrivono da soli.
  try {
    const righe = dedupByKey(
      estraiArray(await source.fetchRaw("conduttori")).map(parseConduttore),
      (c) => c.keykey,
    );
    r.conteggi.conduttori = await storage.replaceConduttori(righe);
    r.riuscite++;
  } catch (e) {
    registraErrore(r, "conduttori", e);
  }

  // 2. Seconda gerarchia. Va prima del registro perché i suoi nomi servono
  //    alle righe di servizio, che il registro scrive.
  const nomiRogge = await eseguiGerarchiaRogge(r, { source, storage });

  // 3. Registro. Si legge tutto in memoria — 929 tratte e 17.303 legami sui
  //    dati veri — e si scrive in una transazione sola.
  const madri: MadreInsert[] = [];
  const tratte: TrattaInsert[] = [];
  const legami: LegameInsert[] = [];
  let lette = 0;

  /** Legge un'entità del registro, contando esito e scarti. */
  async function leggiRegistro(
    entita: WsEntity,
    consuma: (grezze: unknown[]) => void,
  ): Promise<void> {
    try {
      consuma(estraiArray(await source.fetchRaw(entita)));
      lette++;
    } catch (e) {
      registraErrore(r, entita, e);
    }
  }

  // Ogni lettura bufferizza in un array locale e conta in variabili locali:
  // solo a lettura completata (nessun parse che ha sollevato a metà) quel
  // buffer confluisce negli array condivisi e nei conteggi. Stessa regola
  // per tutte e quattro le letture — non solo per i legami — altrimenti un
  // parse che lancia a metà ciclo lascerebbe righe orfane in `madri`/`tratte`
  // senza il conteggio corrispondente, o viceversa.
  await leggiRegistro("madriImpianti", (grezze) => {
    const letti: MadreInsert[] = [];
    let tipoIgnoto = 0;
    for (const g of grezze) {
      // Un `codicetipoirrigazione` ignoto non fa sparire la madre — le sue
      // tratte hanno codice_madre NOT NULL — ma si conta: è il segnale che il
      // consorzio ha aggiunto un tipo che non sappiamo decodificare.
      if (!tipoIrrigazioneRiconosciuto(g)) tipoIgnoto++;
      letti.push(parseMadreImpianto(g));
    }
    madri.push(...letti);
    conta(r, "madriTipoIgnoto", tipoIgnoto);
  });
  await leggiRegistro("madriOrari", (grezze) => {
    const letti: MadreInsert[] = [];
    for (const g of grezze) letti.push(parseMadreOrari(g));
    madri.push(...letti);
  });
  await leggiRegistro("tratteImpianti", (grezze) => {
    const letti: TrattaInsert[] = [];
    let scartate = 0;
    for (const g of grezze) {
      const t = parseTrattaImpianto(g);
      // Le aggregazioni NM.. e ZM.. che l'endpoint "all" mescola alle IM.
      if (t === null) scartate++;
      else letti.push(t);
    }
    tratte.push(...letti);
    conta(r, "tratteScartate", scartate);
  });
  await leggiRegistro("tratteOrari", (grezze) => {
    const letti: TrattaInsert[] = [];
    let senzaMadre = 0;
    let nonGruppo = 0;
    for (const g of grezze) {
      const t = parseTrattaOrari(g);
      if (t !== null) { letti.push(t); continue; }
      // Due cause, due contatori: «non è un gruppo di consegna» (sfiati,
      // scarichi, nodi, saracinesche) e «codice troppo corto per avere una
      // madre». Un numero solo non spiegherebbe nessuna delle due.
      if (!eGruppoDiConsegna(g)) nonGruppo++;
      else senzaMadre++;
    }
    tratte.push(...letti);
    conta(r, "tratteSenzaMadre", senzaMadre);
    conta(r, "tratteNonGruppo", nonGruppo);
  });

  const daLeggere: Array<[WsEntity, MetodoLegame]> = [
    ["legamiLiveImpianti", "live"],
    ["legamiLiveOrari", "live"],
    ["legamiStagione", "stagione"],
  ];
  for (const [entita, metodo] of daLeggere) {
    await leggiRegistro(entita, (grezze) => {
      const letti: LegameInsert[] = [];
      let scartati = 0;
      for (const g of grezze) {
        const l = parseLegame(g, metodo);
        if (l === null) scartati++;
        else letti.push(l);
      }
      legami.push(...letti);
      conta(r, "legamiScartati", scartati);
    });
  }

  if (lette < ENTITA_REGISTRO.length) {
    // Gli scarti contati su una lettura che non verrà scritta ingannerebbero.
    // Vale sia con `lette === 0` (tutte saltate o fallite) sia con una
    // lettura parziale: in entrambi i casi il registro non si scrive.
    delete r.conteggi.tratteScartate;
    delete r.conteggi.tratteSenzaMadre;
    delete r.conteggi.tratteNonGruppo;
    delete r.conteggi.legamiScartati;
    delete r.conteggi.madriTipoIgnoto;
    if (lette > 0) {
      // Scrivere un registro parziale lo cancellerebbe e la sintesi adotterebbe
      // le tratte perse sotto madri di servizio: un registro completamente
      // diverso, prodotto in silenzio da un guasto di rete. Meglio tenere
      // quello di ieri e dirlo.
      const mancanti = ENTITA_REGISTRO.length - lette;
      r.errori.push(
        `Registro del consorzio: non scritto perché ${mancanti} entità su ${ENTITA_REGISTRO.length} non ${mancanti === 1 ? "è stata letta" : "sono state lette"}. Il mirror precedente resta invariato.`,
      );
    } else if (r.riuscite > 0) {
      // Nessuna delle sette letta, ma i conduttori sì. Le entità non
      // configurate finiscono in `saltate`, non in `errori`: senza questa riga
      // `riuscite=1` ed `errori=[]` danno `success`, e l'email dice
      // «Anagrafiche aggiornate» con madri, tratte e legami vuoti. È lo stato
      // della produzione subito dopo il deploy del modello a impianti.
      //
      // Con `riuscite === 0` si tace: non è stato scritto niente, ed
      // `eseguiSync` dà già il messaggio più chiaro («Nessuna sorgente è
      // configurata…») quando non c'è nessun altro errore.
      r.errori.push(
        `Registro del consorzio: non scritto perché nessuna delle ${ENTITA_REGISTRO.length} entità è stata letta (non configurate o irraggiungibili). Il mirror precedente resta invariato.`,
      );
    }
    return;
  }

  try {
    const madriUniche = dedupByKey(madri, (m) => m.codice);
    const tratteUniche = dedupByKey(tratte, (t) => t.keyroggia);
    const legamiUnici = dedupByKey(legami, (l) => `${l.keykey}|${l.keyroggia}|${l.metodo}`);

    // Le madri e le tratte che il consorzio non manda e che i legami citano.
    // Le madri vere entrano anche loro: una madre senza tratte non deve
    // ricevere un doppione «non classificata» (vedi `sintetizzaServizio`).
    const servizio = sintetizzaServizio(legamiUnici, tratteUniche, madriUniche, nomiRogge);

    const conteggi = await storage.replaceRegistro({
      madri: madriUniche.concat(servizio.madri),
      tratte: tratteUniche.concat(servizio.tratte),
      legami: legamiUnici,
    });
    // Contati solo ora: se replaceRegistro lancia, madri/tratte/legami non
    // vengono valorizzati e questi due non devono restare a fare da numeri
    // orfani (Anagrafiche li mostra accanto ai conteggi veri).
    conta(r, "madriDiServizio", servizio.madri.length);
    conta(r, "tratteDiServizio", servizio.tratte.length);
    r.conteggi.madri = conteggi.madri;
    r.conteggi.tratte = conteggi.tratte;
    r.conteggi.legami = conteggi.legami;
    r.riuscite++;
  } catch (e) {
    r.errori.push(`Registro del consorzio: ${(e as Error).message}`);
  }
}

async function eseguiSync(
  syncLogId: number,
  deps: SyncDeps,
): Promise<EsitoSync> {
  const r: Raccolta = { conteggi: {}, errori: [], saltate: [], riuscite: 0 };

  try {
    await eseguiCorpo(r, deps);
  } catch (e) {
    // Guasto non ricondotto a una singola entità (es. un errore imprevisto
    // fuori da uno dei try locali): non deve far rifiutare la promise, altrimenti
    // il chiamante di syncAll riceverebbe un'eccezione invece di un EsitoSync
    // e il log resterebbe "running" per sempre (Rilievo 1).
    r.errori.push(`Sincronizzazione: ${(e as Error).message}`);
  }

  // Se nessuna entità è stata scritta e non c'è un guasto vero, il motivo è
  // che nessuna sorgente è configurata (lo stato attuale della produzione):
  // non va confuso con un successo su un database vuoto, altrimenti la pagina
  // mostra una spunta verde con una data credibile e il cron lo ripete ogni
  // notte in silenzio (Correzione 2).
  let status: EsitoSync["status"];
  if (r.riuscite === 0) {
    if (r.errori.length === 0) {
      r.errori.push("Nessuna sorgente è configurata: nessuna anagrafica è stata sincronizzata.");
    }
    status = "failed";
  } else {
    status = r.errori.length === 0 ? "success" : "partial";
  }

  try {
    await deps.storage.updateSyncLog(syncLogId, {
      finishedAt: new Date(),
      status,
      entityCounts: JSON.stringify(r.conteggi),
      errors: JSON.stringify(r.errori),
      skippedEntities: JSON.stringify(r.saltate),
    });
  } catch {
    // Se anche la chiusura del log fallisce non c'è più nulla da fare qui:
    // meglio restituire comunque un EsitoSync coerente con quanto raccolto
    // piuttosto che far rifiutare la promise (Rilievo 1/2).
  }

  return { syncLogId, status, conteggi: r.conteggi, errori: r.errori, saltate: r.saltate };
}

/** Esegue il sync e attende la fine. Usato dal cron e dai test. */
export async function syncAll(trigger: string, deps?: Partial<SyncDeps>): Promise<EsitoSync> {
  if (inCorso) throw new SyncGiaInCorso();
  inCorso = true;
  try {
    const risolte = await risolviDeps(deps);
    const log = await risolte.storage.createSyncLog({ trigger });
    return await eseguiSync(log.id, risolte);
  } finally {
    inCorso = false;
  }
}

/**
 * Avvia il sync in background e restituisce subito l'id del log.
 *
 * `eseguiSync` non rifiuta mai (assorbe internamente ogni guasto e chiude
 * comunque il log): il `.catch(() => {})` finale resta comunque come rete di
 * sicurezza, perché una promise di background lasciata senza handler che
 * rifiuta produce un `unhandledRejection` che su Node moderno termina il
 * processo — il lucchetto verrebbe rilasciato ma il server cadrebbe lo
 * stesso (Rilievo 3).
 */
export async function avviaSync(trigger: string, deps?: Partial<SyncDeps>): Promise<number> {
  if (inCorso) throw new SyncGiaInCorso();
  inCorso = true;
  const risolte = await risolviDeps(deps).catch((e) => { inCorso = false; throw e; });
  const log = await risolte.storage.createSyncLog({ trigger }).catch((e) => {
    inCorso = false;
    throw e;
  });
  void eseguiSync(log.id, risolte)
    .finally(() => { inCorso = false; })
    .catch(() => {});
  return log.id;
}

/**
 * Un riavvio a metà sync lascia il log in "running" e l'interfaccia mostrerebbe
 * per sempre una sincronizzazione in corso. All'avvio li chiudiamo.
 */
export async function chiudiSyncInterrotti(deps?: Partial<SyncDeps>): Promise<number> {
  const storage = deps?.storage ?? storageDefault;
  const recenti = await storage.getRecentSyncLogs(20);
  let chiusi = 0;
  for (const log of recenti) {
    if (log.status !== "running") continue;
    await storage.updateSyncLog(log.id, {
      finishedAt: new Date(),
      status: "failed",
      errors: JSON.stringify(["Interrotta da un riavvio del server"]),
    });
    chiusi++;
  }
  return chiusi;
}
