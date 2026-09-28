import { mkdir, writeFile, rename, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  parseConduttore,
  parseMadreImpianto, parseMadreOrari, parseTrattaImpianto, parseTrattaOrari, parseLegame,
  parseRoggiaMadre, parseRoggiaFiglia,
} from "@shared/ws-consorzio";
import type { WsEntity } from "./config";
import { estraiArray } from "./source";

/**
 * Cartella dei JSON caricati dall'interfaccia. pm2 avvia dist/index.js con la
 * radice del progetto come cwd (vedi pm2_start in deploy.sh), quindi vale sia
 * in sviluppo che in produzione. È gitignorata come backups/.
 */
export const CARTELLA_DATI = resolve(process.cwd(), "dati-ws");

const NOMI_FILE: Record<WsEntity, string> = {
  conduttori: "conduttori.json",
  madriImpianti: "madri-impianti.json",
  madriOrari: "madri-orari.json",
  tratteImpianti: "tratte-impianti.json",
  tratteOrari: "tratte-orari.json",
  legamiLiveImpianti: "legami-live-impianti.json",
  legamiLiveOrari: "legami-live-orari.json",
  legamiStagione: "legami-stagione.json",
  // Non "rogge-madri.json"/"rogge-figlie.json": sono i nomi che il vecchio
  // mirror a prefisso usava per le sue omonime entità, rimasti su disco in
  // dati-ws/ dopo la 0012. Un caricamento da Impostazioni con quei nomi
  // finirebbe sopra un file di un'altra epoca, e chi guarda la cartella non
  // saprebbe più quale dei due è quello vero (vedi migrations/0014).
  roggeMadri: "gerarchia-rogge-madri.json",
  roggeFiglie: "gerarchia-rogge-figlie.json",
};

/**
 * Gli stessi parser che usa sync-all: un file accettato qui è per costruzione
 * un file che il sync sa leggere. I tre legami condividono parseLegame ma
 * differiscono per il metodo, che è contesto del chiamante (in sync-all.ts la
 * stessa scelta è nell'array `daLeggere`). parseTrattaImpianto, parseTrattaOrari
 * e parseLegame tornano tutti `null` per le righe da scartare (A2/correzione
 * post-revisione: parseTrattaOrari non solleva più, è uniforme agli altri due).
 */
const PARSER: Record<WsEntity, (riga: unknown) => Record<string, unknown> | null> = {
  conduttori: (r) => parseConduttore(r),
  madriImpianti: (r) => parseMadreImpianto(r),
  madriOrari: (r) => parseMadreOrari(r),
  tratteImpianti: (r) => parseTrattaImpianto(r),
  tratteOrari: (r) => parseTrattaOrari(r),
  legamiLiveImpianti: (r) => parseLegame(r, "live"),
  legamiLiveOrari: (r) => parseLegame(r, "live"),
  legamiStagione: (r) => parseLegame(r, "stagione"),
  roggeMadri: (r) => parseRoggiaMadre(r),
  roggeFiglie: (r) => parseRoggiaFiglia(r),
};

export type EsitoValidazione = { righe: number; avvisi: string[] };
export type EsitoSalvataggio = EsitoValidazione & { percorso: string };

export function percorsoEntita(entita: WsEntity, cartella: string = CARTELLA_DATI): string {
  return join(cartella, NOMI_FILE[entita]);
}

/** Gli errori Zod hanno un .message che è un JSON intero: qui serve una riga sola. */
function messaggioErrore(e: unknown): string {
  if (e instanceof ZodError) {
    return e.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
  }
  return (e as Error).message;
}

/**
 * Gli export di Windows arrivano spesso con il BOM, che JSON.parse rifiuta.
 * Unica sede della regex: sia validaPayload (che lavora su testo, anche da
 * chi la chiama direttamente nei test) sia salvaFileEntita (che deve scrivere
 * su disco il testo ripulito, non i byte originali) passano da qui.
 */
function senzaBom(testo: string): string {
  return testo.replace(/^﻿/, "");
}

/** True se il campo esiste sulla riga grezza (pre-parser) ed è valorizzato. */
function haCampoValorizzato(rigaGrezza: unknown, campo: string): boolean {
  if (typeof rigaGrezza !== "object" || rigaGrezza === null) return false;
  const v = (rigaGrezza as Record<string, unknown>)[campo];
  return v !== null && v !== undefined && String(v).trim() !== "";
}

/** Il valore di un campo, maiuscolo e ripulito — per confrontarlo con un prefisso. */
function valoreCampo(rigaGrezza: unknown, campo: string): string {
  if (typeof rigaGrezza !== "object" || rigaGrezza === null) return "";
  const v = (rigaGrezza as Record<string, unknown>)[campo];
  return v == null ? "" : String(v).trim().toUpperCase();
}

/**
 * Verifica che il testo sia un payload utilizzabile per l'entità. Solleva al
 * primo problema: chi chiama non deve mai scrivere un file che non ha superato
 * questo controllo.
 */
export function validaPayload(entita: WsEntity, testo: string): EsitoValidazione {
  const pulito = senzaBom(testo);

  let grezzo: unknown;
  try {
    grezzo = JSON.parse(pulito);
  } catch (e) {
    throw new Error(`JSON non valido: ${(e as Error).message}`);
  }

  const righe = estraiArray(grezzo);
  if (righe.length === 0) {
    // Un array vuoto supererebbe ogni controllo di forma, ma il mirror
    // sostituisce l'entità in blocco: al primo sync svuoterebbe l'anagrafica
    // in una transazione sola. È quasi sempre un export andato storto.
    throw new Error("Il file non contiene righe");
  }

  const parser = PARSER[entita];
  let scartate = 0; // righe che il parser dell'entità scarta di proposito (A2/A4)
  // Discriminatore per conduttori: si accumula dentro lo stesso giro sulle
  // righe (sul risultato già parsato) invece di un secondo passaggio
  // sull'array.
  let haDescrizioneOContatto = false; // conduttori: almeno una riga con dati reali

  righe.forEach((riga, i) => {
    // Discriminatori per le coppie di entità che i parser tolleranti (per
    // costruzione: pochi campi sono davvero obbligatori) non distinguono da
    // soli. Vanno controllati PRIMA di chiamare il parser: alcuni di questi
    // campi sono obbligatori anche per lo schema dell'entità sbagliata, e se
    // si lasciasse sollevare prima il parser l'utente vedrebbe il generico
    // "Riga N: ... Required" invece del messaggio che gli dice quale file ha
    // probabilmente scelto per sbaglio.
    if (
      (entita === "madriImpianti" || entita === "madriOrari") && haCampoValorizzato(riga, "keyroggia")
    ) {
      const cosa = entita === "madriImpianti" ? "impianti" : "impianti a orari";
      throw new Error(
        `Il file non sembra un'anagrafica di ${cosa}: almeno una riga ha un campo keyroggia. `
        + "Controlla di non aver scelto per sbaglio un file di tratte.",
      );
    }
    if (entita === "tratteImpianti" && !haCampoValorizzato(riga, "codiceimpianto")) {
      throw new Error(
        "Il file non sembra un elenco di tratte con il loro impianto: almeno una riga non ha "
        + "codiceimpianto. Controlla di non aver scelto per sbaglio un file di tratte a orari "
        + "(getroggeorari/S).",
      );
    }
    if (entita === "tratteOrari" && haCampoValorizzato(riga, "codiceimpianto")) {
      throw new Error(
        "Il file non sembra un elenco di tratte a orari: almeno una riga ha un campo "
        + "codiceimpianto. Controlla di non aver scelto per sbaglio un file di tratte con il "
        + "loro impianto (getimpiantirogge/all).",
      );
    }
    // Rilievo 8 della revisione finale: `madriOrari` e `roggeMadri` condividono
    // il campo `codicemadre` (idem `tratteOrari`/`roggeFiglie` su `keyroggia`),
    // e i parser di madriOrari/tratteOrari non validano il prefisso — a
    // differenza di `parseRoggiaMadre`/`parseRoggiaFiglia`, che vogliono `R`.
    // Senza questo controllo un caricamento incrociato supera la validazione
    // e il sync notturno prova a scrivere tratte `R` con la madre ricavata dal
    // prefisso: la regola vietata per le `R` (vedi `prefissoMadre()` in
    // `shared/ws-consorzio.ts`). Non è silenzioso — la FK di `tratte` verso
    // `madri` fa fallire il registro, che resta a ieri — ma è un guasto
    // notturno ricorrente da un errore di due clic al collaudo, dove si
    // caricano quattro file dal nome simile in sequenza.
    if (entita === "madriOrari" && haCampoValorizzato(riga, "codicemadre") && valoreCampo(riga, "codicemadre").indexOf("R") === 0) {
      throw new Error(
        "Il file non sembra un'anagrafica di impianti a orari: i codici delle madri a orari "
        + "iniziano per S, non per R. Controlla di non aver scelto per sbaglio il file delle rogge "
        + "madri della gerarchia R (getroggemadri/orarirogge).",
      );
    }
    if (entita === "tratteOrari" && haCampoValorizzato(riga, "keyroggia") && valoreCampo(riga, "keyroggia").indexOf("R") === 0) {
      throw new Error(
        "Il file non sembra un elenco di tratte a orari: i codici delle tratte a orari iniziano per "
        + "S, non per R. Controlla di non aver scelto per sbaglio il file delle figlie della "
        + "gerarchia rogge madri (getroggeorari/R).",
      );
    }
    if (entita === "legamiLiveImpianti" || entita === "legamiLiveOrari" || entita === "legamiStagione") {
      if (!haCampoValorizzato(riga, "keykey")) {
        throw new Error(
          "Il file non sembra un elenco di legami: almeno una riga non ha keykey. Controlla di "
          + "aver scelto il file giusto.",
        );
      }
      if (!haCampoValorizzato(riga, "keyroggia")) {
        // I conduttori hanno anche loro un keykey: senza questo secondo
        // controllo un file di conduttori (che il WS chiama comunque
        // "getconduttoriroggelive_S.json" — "conduttori" è nel nome) supera
        // il primo e arriva al parser, che solleva un generico "Riga N:
        // keyroggia Required" invece di dire cosa è successo.
        throw new Error(
          "Il file non sembra un elenco di legami: almeno una riga non ha keyroggia. Controlla "
          + "di non aver scelto per sbaglio un file di conduttori.",
        );
      }
    }

    let parsata: Record<string, unknown> | null;
    try {
      parsata = parser(riga);
    } catch (e) {
      // Indice 1-based: "Riga 1" è il primo elemento dell'array, come lo conta
      // chi apre il file, non come lo conta JavaScript.
      throw new Error(`Riga ${i + 1}: ${messaggioErrore(e)}`);
    }

    if (parsata === null) {
      scartate++;
      return;
    }

    if (entita === "conduttori") {
      const descrizione = (parsata.descrizione as string | undefined) ?? "";
      const email = parsata.email as string | null;
      const cellulare = parsata.cellulare as string | null;
      if (descrizione.trim() !== "" || email || cellulare) haDescrizioneOContatto = true;
    }
  });

  if (entita === "conduttori" && !haDescrizioneOContatto) {
    // Un export di legami ha keykey su ogni riga (quindi supera il parser) ma
    // descrizione/email/cellulare sempre vuoti: un'anagrafica conduttori vera
    // non può plausibilmente non averne nessuno.
    throw new Error(
      "Il file non sembra un'anagrafica conduttori: nessuna riga ha descrizione, email o "
      + "cellulare. Controlla di non aver scelto per sbaglio un file di legami.",
    );
  }

  if (scartate > 0 && scartate === righe.length) {
    // Un file in cui ogni riga verrebbe scartata produrrebbe un'entità
    // vuota, e il mirror la sostituisce in blocco: quasi certamente il file
    // sbagliato, non un export legittimo.
    throw new Error(
      `Tutte le ${righe.length} righe verrebbero scartate dal sync: il risultato sarebbe `
      + "un'entità vuota. Controlla di aver scelto il file giusto.",
    );
  }

  const avvisi: string[] = [];
  if (scartate > 0) {
    if (entita === "tratteImpianti") {
      // Le aggregazioni NM.. e ZM.. che l'endpoint "all" mescola alle IM.
      avvisi.push(`${scartate} righe di aggregazioni diverse da IM (NM.., ZM..): verranno ignorate`);
    } else if (
      entita === "legamiLiveImpianti" || entita === "legamiLiveOrari" || entita === "legamiStagione"
    ) {
      // parseLegame scarta per due cause distinte (codici N da ignorare, e
      // keyroggia troppo corti per avere una madre): il conteggio le somma,
      // quindi l'avviso deve nominarle entrambe onestamente, non solo la
      // prima.
      avvisi.push(
        `${scartate} righe su codici da ignorare (che iniziano per N, o troppo corti per avere `
        + "una madre): verranno ignorate",
      );
    } else if (entita === "tratteOrari") {
      // parseTrattaOrari scarta per due cause distinte (codice troppo corto
      // per ricavarne la madre, e codice di lunghezza normale che non è un
      // gruppo di consegna): il conteggio le somma, quindi l'avviso deve
      // nominarle entrambe onestamente.
      avvisi.push(
        `${scartate} righe che non sono gruppi di consegna (sfiati, scarichi, nodi, saracinesche) `
        + "o keyroggia troppo corto per ricavarne la madre: verranno ignorate",
      );
    }
  }

  return { righe: righe.length, avvisi };
}

/**
 * Valida e poi scrive. L'ordine è la garanzia: un payload rifiutato non arriva
 * mai al disco, quindi il file buono già presente sopravvive a ogni upload
 * sbagliato — stessa regola di scripts/backup-db.sh, che non cancella copie
 * buone in cambio di una rotta. Il nome del temporaneo è unico per chiamata
 * (con UUID) perché due salvaFileEntita sulla stessa entità concorrenti non
 * si calpestino: ognuno ha il suo temporaneo, il rename atomico protegge
 * il file finale.
 */
export async function salvaFileEntita(
  entita: WsEntity,
  contenuto: Buffer,
  cartella: string = CARTELLA_DATI,
): Promise<EsitoSalvataggio> {
  // Decodifica e ripulizia dal BOM una volta sola: lo stesso testo va sia a
  // validaPayload sia, se accettato, al disco. Scrivere `contenuto` (i byte
  // originali, ancora col BOM) come faceva prima lasciava un file che questa
  // stessa validazione accetta ma che JSON.parse in source.ts — usato dal
  // sync notturno, senza gestione del BOM — non sa più leggere: l'upload
  // risultava "riuscito" e il sync delle 03:00 falliva su quell'entità.
  const testoPulito = senzaBom(contenuto.toString("utf8"));
  const esito = validaPayload(entita, testoPulito);

  const percorso = percorsoEntita(entita, cartella);
  const temporaneo = `${percorso}.${process.pid}-${randomUUID()}.tmp`;

  await mkdir(cartella, { recursive: true });
  try {
    await writeFile(temporaneo, testoPulito, "utf8");
    // rename è atomico sullo stesso filesystem. Scrivere direttamente su
    // `percorso` lascerebbe, se la scrittura si interrompe, un file troncato
    // che il cron delle 03:00 leggerebbe come buono, sostituendo un'anagrafica
    // intera con la sua metà.
    await rename(temporaneo, percorso);
  } catch (e) {
    // Il fallimento del cleanup non deve mascherare l'errore originale (per
    // questo si continua a inghiottirlo), ma senza un log non resterebbe
    // traccia da nessuna parte del perché un .tmp è rimasto orfano su disco.
    await unlink(temporaneo).catch((errUnlink) => {
      console.error(`Impossibile rimuovere il file temporaneo ${temporaneo}:`, errUnlink);
    });
    throw e;
  }

  return { ...esito, percorso };
}
