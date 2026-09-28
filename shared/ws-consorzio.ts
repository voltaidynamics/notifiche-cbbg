// Le otto entità del web service del consorzio, dal JSON alle righe da scrivere.
//
// Qui stanno anche i due filtri che il consorzio ci ha chiesto, e stanno solo
// qui: `getimpiantirogge/all` mescola tre aggregazioni (IM, NM, ZM) e noi
// usiamo la sola IM; i codici a 9 che iniziano per N vanno ignorati ovunque.
import { z } from "zod";
import { categoriaDaTipoIrrigazione, type CategoriaMadre } from "./categorie-madri";

/** Da quale endpoint viene una madre. `servizio` = sintetizzata da noi. */
export const ORIGINI_MADRE = ["impianti", "orari", "servizio"] as const;
export type OrigineMadre = (typeof ORIGINI_MADRE)[number];

export type MetodoLegame = "live" | "stagione";

export type MadreInsert = {
  codice: string;
  name: string;
  categoria: CategoriaMadre;
  tipoIrrigazione: string | null;
  origine: OrigineMadre;
};

export type TrattaInsert = {
  keyroggia: string;
  name: string;
  codiceMadre: string;
};

/** Una riga di `getroggemadri/orarirogge`: una roggia madre, codice R da 3. */
export type RoggiaMadreInsert = { codice: string; name: string };

/** Una riga di `getroggeorari/R`: una figlia, con la madre del suo prefisso. */
export type TrattaRoggiaInsert = { keyroggia: string; name: string; codiceMadre: string };

export type LegameInsert = {
  keykey: string;
  keyroggia: string;
  metodo: MetodoLegame;
};

/** L'aggregazione che il consorzio ha battezzato per noi. */
const PREFISSO_IMPIANTO = "IM";

/** Il prefisso che il consorzio ci ha detto di ignorare. */
const PREFISSO_DA_IGNORARE = "N";

/** Il prefisso delle rogge madri: la seconda gerarchia è tutta `R`. */
const PREFISSO_ROGGIA = "R";

/** Per le sole madri `S`: le prime 3 posizioni del codice a 9. */
export const LUNGHEZZA_CODICE_MADRE = 3;

/** Posizione (0-based) del carattere che dice che tipo di nodo è una tratta S. */
const POSIZIONE_GRUPPO = 6;

const strOrNum = z.union([z.string(), z.number()]).transform((v) => String(v));

function pulisci(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function nullSeVuoto(v: unknown): string | null {
  const s = pulisci(v);
  return s === "" ? null : s;
}

function canonico(v: string): string {
  return v.trim().toUpperCase();
}

/**
 * Le prime 3 posizioni di un codice, o null se non ne ha abbastanza.
 *
 * Vale per le tratte `S`, dove il consorzio ci ha detto esplicitamente di
 * ricavare la madre così, e per sintetizzare le madri di servizio. **Non vale
 * per le tratte `R`**: lì la madre è l'impianto, e 9 prefissi su 34 sono
 * spalmati su più impianti — `R08` da solo ne copre 13.
 */
export function prefissoMadre(keyroggia: string): string | null {
  const c = canonico(keyroggia);
  if (c.length <= LUNGHEZZA_CODICE_MADRE) return null;
  return c.slice(0, LUNGHEZZA_CODICE_MADRE);
}

const madreImpiantoSchema = z.object({
  codiceimpianto: strOrNum,
  codicetipoirrigazione: z.union([z.string(), z.number()]).optional().nullable(),
  name: z.string().optional().default(""),
  tipoirrigazione: z.string().optional().nullable(),
});

export function parseMadreImpianto(raw: unknown): MadreInsert {
  const r = madreImpiantoSchema.parse(raw);
  return {
    codice: canonico(r.codiceimpianto),
    name: pulisci(r.name),
    // Un tipo ignoto non fa sparire la madre: le sue tratte hanno
    // `codice_madre` NOT NULL e resterebbero senza. Ripiego su "rogge",
    // che è la categoria più numerosa, e il sync lo conta.
    categoria: categoriaDaTipoIrrigazione(pulisci(r.codicetipoirrigazione)) ?? "rogge",
    tipoIrrigazione: nullSeVuoto(r.tipoirrigazione),
    origine: "impianti",
  };
}

const madreOrariSchema = z.object({
  codicemadre: strOrNum,
  name: z.string().optional().default(""),
});

export function parseMadreOrari(raw: unknown): MadreInsert {
  const r = madreOrariSchema.parse(raw);
  return {
    codice: canonico(r.codicemadre),
    name: pulisci(r.name),
    // Tutto ciò che inizia per S è un impianto nell'app: richiesta esplicita
    // del consorzio, non una deduzione dal nome.
    categoria: "impianti",
    tipoIrrigazione: null,
    origine: "orari",
  };
}

const trattaImpiantoSchema = z.object({
  codiceimpianto: strOrNum,
  keyroggia: strOrNum,
  name: z.string().optional().default(""),
});

/** `null` per le aggregazioni `NM..` e `ZM..`, che non usiamo. */
export function parseTrattaImpianto(raw: unknown): TrattaInsert | null {
  const r = trattaImpiantoSchema.parse(raw);
  const madre = canonico(r.codiceimpianto);
  if (madre.indexOf(PREFISSO_IMPIANTO) !== 0) return null;
  return { keyroggia: canonico(r.keyroggia), name: pulisci(r.name), codiceMadre: madre };
}

const trattaOrariSchema = z.object({
  keyroggia: strOrNum,
  name: z.string().optional().default(""),
});

/**
 * Vera se una tratta `S` è un **gruppo di consegna**, cioè uno dei nodi a cui
 * un conduttore può essere legato.
 *
 * Richiesta del consorzio (mail del 16/09/2026): delle ~150 figlie di `S45` ne
 * servono ~60, quelle con `G` in settima posizione; le altre sono sfiati,
 * scarichi, nodi e saracinesche, che non hanno mai conduttori.
 *
 * La regola è scritta al negativo — si scarta solo una **lettera diversa da
 * G** — e non «tieni solo i G», che è la lettera della mail. `S02`, `S08` e
 * `S30` non hanno nessun codice con la G e usano cifre in quella posizione:
 * la regola letterale le cancellerebbe per intero, e con loro 363 legami.
 */
export function eGruppoDiConsegna(raw: unknown): boolean {
  const r = trattaOrariSchema.parse(raw);
  const c = canonico(r.keyroggia);
  if (c.length <= POSIZIONE_GRUPPO) return true; // troppo corto: lo scarta prefissoMadre
  const settimo = c.charAt(POSIZIONE_GRUPPO);
  return settimo === "G" || settimo < "A" || settimo > "Z";
}

/**
 * `null` per un keyroggia troppo corto per ricavarne la madre col prefisso a
 * 3. Non è una tratta che "resta orfana": `tratte.codice_madre` è NOT NULL,
 * quindi una tratta senza madre non può esistere e la riga non entra proprio
 * — a differenza del vecchio modello (rogge_figlie), dove `codicemadre` era
 * nullable e la riga veniva scritta comunque, orfana per davvero.
 */
export function parseTrattaOrari(raw: unknown): TrattaInsert | null {
  const r = trattaOrariSchema.parse(raw);
  const keyroggia = canonico(r.keyroggia);
  const madre = prefissoMadre(keyroggia);
  if (madre === null) return null;
  if (!eGruppoDiConsegna(raw)) return null;
  return { keyroggia, name: pulisci(r.name), codiceMadre: madre };
}

const roggiaMadreSchema = z.object({
  codicemadre: strOrNum,
  name: z.string().optional().default(""),
});

export function parseRoggiaMadre(raw: unknown): RoggiaMadreInsert | null {
  const r = roggiaMadreSchema.parse(raw);
  const codice = canonico(r.codicemadre);
  if (codice.length !== LUNGHEZZA_CODICE_MADRE) return null;
  if (codice.indexOf(PREFISSO_ROGGIA) !== 0) return null;
  return { codice, name: pulisci(r.name) };
}

const roggiaFigliaSchema = z.object({
  keyroggia: strOrNum,
  name: z.string().optional().default(""),
});

/**
 * Una figlia della gerarchia delle rogge madri.
 *
 * **Qui il prefisso a 3 è lecito**, al contrario di `parseTrattaImpianto`: per
 * *questo* endpoint il consorzio dichiara che «la relazione con l'aggregante R
 * si ricava dalle prime 3 cifre». Non contraddice l'avvertimento di
 * `prefissoMadre()`: quello vieta il prefisso per risolvere **l'impianto `IM`**
 * di una tratta R, che è un'altra domanda e ha un'altra risposta (`R08` sta su
 * 13 impianti). Le due gerarchie convivono e non si deducono una dall'altra.
 */
export function parseRoggiaFiglia(raw: unknown): TrattaRoggiaInsert | null {
  const r = roggiaFigliaSchema.parse(raw);
  const keyroggia = canonico(r.keyroggia);
  if (keyroggia.indexOf(PREFISSO_ROGGIA) !== 0) return null;
  const madre = prefissoMadre(keyroggia);
  if (madre === null) return null;
  return { keyroggia, name: pulisci(r.name), codiceMadre: madre };
}

const legameSchema = z.object({
  keykey: strOrNum,
  keyroggia: strOrNum,
  metodo: z.string().optional().nullable(),
});

/**
 * `null` per i legami da scartare: quelli su codici `N` e quelli su un codice
 * troppo corto per avere una madre, che nemmeno una madre di servizio
 * potrebbe adottare.
 *
 * Il `metodo` lo decide il chiamante, non la riga: l'endpoint delle cartoline
 * scrive `"cartoline"`, che non è uno dei nostri due valori.
 */
export function parseLegame(raw: unknown, metodo: MetodoLegame): LegameInsert | null {
  const r = legameSchema.parse(raw);
  const keyroggia = canonico(r.keyroggia);
  if (keyroggia.indexOf(PREFISSO_DA_IGNORARE) === 0) return null;
  if (prefissoMadre(keyroggia) === null) return null;
  return { keykey: canonico(r.keykey), keyroggia, metodo };
}

/**
 * Vera se il WS ha mandato un `codicetipoirrigazione` che sappiamo decodificare.
 *
 * `parseMadreImpianto` ripiega su "rogge" quando non lo sa, perché perdere una
 * madre orfanerebbe le sue tratte. Questa funzione è come il sync se ne accorge
 * e lo conta, invece di lasciare che il ripiego passi inosservato.
 */
export function tipoIrrigazioneRiconosciuto(raw: unknown): boolean {
  const r = madreImpiantoSchema.parse(raw);
  return categoriaDaTipoIrrigazione(pulisci(r.codicetipoirrigazione)) !== null;
}

/** Il registro del consorzio: si sostituisce tutto insieme o niente. */
export type RegistroConsorzio = {
  madri: MadreInsert[];
  tratte: TrattaInsert[];
  legami: LegameInsert[];
};

export type ConteggiRegistro = { madri: number; tratte: number; legami: number };

// ---- Conduttori (spostato da shared/wsSchemas.ts, Task 12) ----

export type ConduttoreInsert = {
  keykey: string;
  descrizione: string;
  email: string | null;
  cellulare: string | null;
  tipoEmail: "normale" | "pec";
  flagAttivo: boolean;
  dataConsenso: string | null;
};

const conduttoreWsSchema = z.object({
  keykey: strOrNum,
  descrizione: z.string().optional().default(""),
  email: z.union([z.string(), z.number()]).optional().nullable(),
  cellulare: z.union([z.string(), z.number()]).optional().nullable(),
  flag: z.string().optional().nullable(),
  tipo_email: z.string().optional().nullable(),
  dataconsenso: z.string().optional().nullable(),
});

export function parseConduttore(raw: unknown): ConduttoreInsert {
  const r = conduttoreWsSchema.parse(raw);
  return {
    keykey: r.keykey.trim(),
    descrizione: (r.descrizione ?? "").trim(),
    email: nullSeVuoto(r.email),
    // Lo "0" con cui il WS indica "nessun numero" resta com'è: il mirror è
    // una copia fedele. A non mostrarlo pensa numeroDestinatario() in lettura.
    cellulare: nullSeVuoto(r.cellulare),
    tipoEmail: (r.tipo_email ?? "").trim().toLowerCase() === "pec" ? "pec" : "normale",
    flagAttivo: (r.flag ?? "").trim() !== "*",
    dataConsenso: nullSeVuoto(r.dataconsenso),
  };
}
