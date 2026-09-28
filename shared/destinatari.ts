// Un conduttore può essere legato a N tratte (issue #5): se l'invio ne seleziona
// due che lo riguardano entrambe, il destinatario resta uno solo e riceve una
// sola comunicazione, con l'elenco delle tratte interessate.
//
// La regola vive qui, condivisa fra la tabella dei conduttori (client) e il
// codice che spedisce davvero (server): due copie divergerebbero.

/** Separatore con cui più tratte finiscono in un unico campo di snapshot. */
export const SEPARATORE_TRATTE = ", ";

/**
 * Il cellulare di un conduttore, oppure null se non ce n'è uno.
 *
 * Il WS del consorzio non lascia mai il campo vuoto: quando il numero non c'è
 * scrive "0", e lo fa per 2475 conduttori su 4963 (export di luglio 2026).
 * Nel mirror quello "0" resta — le tabelle anagrafiche sono una copia fedele
 * del consorzio e non è compito nostro correggerle — ma un recapito non è, e
 * chi legge non deve mostrarlo né provare a scriverci.
 *
 * Sta qui, accanto alle altre regole sui destinatari, perché serve a entrambi
 * i lati: alla tabella che mostra i conduttori e, quando l'invio sarà
 * agganciato all'anagrafica vera, al codice che spedisce gli SMS.
 *
 * Solo zeri significa "manca"; un numero che comincia per zero è un numero.
 */
export function numeroDestinatario(cellulare: string | null | undefined): string | null {
  if (cellulare == null) return null;
  const numero = cellulare.trim();
  if (numero === "" || /^0+$/.test(numero)) return null;
  return numero;
}

/**
 * Se questo conduttore ha un numero su cui mandare un SMS.
 *
 * Il gemello di `haIndirizzo()` per l'altro canale, e passa dalla stessa
 * `numeroDestinatario()` che ripulisce lo "0" del WS: senza, un conduttore
 * senza numero comparirebbe come raggiungibile via SMS proprio perché il
 * consorzio scrive uno zero dove il numero manca.
 *
 * Serve in due punti della stessa schermata — il conteggio «N destinatari
 * hanno un numero» e il badge SMS riga per riga — e i due devono contare la
 * stessa cosa, o la tabella smentisce il conteggio che le sta sopra.
 */
export function haNumero(cellulare: string | null | undefined): boolean {
  return numeroDestinatario(cellulare) !== null;
}

/** Quel poco che serve di un conduttore per fotografarlo nello storico. */
export interface AnagraficaConduttore {
  codiceConsorzio?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/** Codice e descrizione del conduttore conservati sul destinatario. */
export interface SnapshotConduttore {
  keykey: string | null;
  conduttoreDescrizione: string | null;
}

/**
 * Fotografia anagrafica del conduttore al momento dell'invio.
 *
 * Lo Storico cerca i destinatari per codice **o** per descrizione (issue #12) e
 * legge solo da qui, mai dall'anagrafica viva: le tabelle del consorzio sono
 * riscritte a ogni sync, e senza questa copia lo storico cambierebbe da solo
 * col passare del tempo. Un campo che manca qui è un filtro che non trova più
 * nulla — è già successo con il codice conduttore, mai scritto da nessun
 * percorso di invio.
 *
 * I campi assenti restano `null` e non diventano stringa vuota: la ricerca è
 * per sottostringa, e una stringa vuota combacerebbe con qualunque cosa.
 */
export function snapshotConduttore(c: AnagraficaConduttore): SnapshotConduttore {
  const pulisci = (v: string | null | undefined) => (v ?? "").trim();
  const descrizione = [pulisci(c.firstName), pulisci(c.lastName)].filter(Boolean).join(" ");
  return {
    keykey: pulisci(c.codiceConsorzio) || null,
    conduttoreDescrizione: descrizione || null,
  };
}

export interface Tratta {
  /** Codice tratta; null quando la tratta non è più risolvibile. */
  keyroggia: string | null;
  roggiaDescrizione?: string | null;
}

export interface CoppiaDestinatario<C> extends Tratta {
  conduttore: C;
}

export interface DestinatarioUnico<C> {
  conduttore: C;
  /** Tratte che raggiungono questo conduttore, senza ripetizioni, ordinate per codice. */
  tratte: Tratta[];
}

/**
 * Da coppie (conduttore, tratta) a un destinatario per conduttore.
 * `chiave` decide l'identità del conduttore (keykey lato consorzio, id lato DB).
 * L'ordine di uscita è quello di prima comparsa, così l'elenco resta prevedibile.
 */
export function aggregaDestinatari<C>(
  coppie: CoppiaDestinatario<C>[],
  chiave: (conduttore: C) => string,
): DestinatarioUnico<C>[] {
  const perChiave = new Map<string, DestinatarioUnico<C>>();
  const ordine: string[] = [];

  for (const coppia of coppie) {
    const k = chiave(coppia.conduttore);
    let voce = perChiave.get(k);
    if (!voce) {
      voce = { conduttore: coppia.conduttore, tratte: [] };
      perChiave.set(k, voce);
      ordine.push(k);
    }
    if (voce.tratte.some((t) => t.keyroggia === coppia.keyroggia)) continue;
    voce.tratte.push({
      keyroggia: coppia.keyroggia,
      roggiaDescrizione: coppia.roggiaDescrizione ?? null,
    });
  }

  for (const k of ordine) {
    perChiave
      .get(k)!
      .tratte.sort((a, b) => (a.keyroggia ?? "").localeCompare(b.keyroggia ?? ""));
  }
  return ordine.map((k) => perChiave.get(k)!);
}

const unisci = (valori: (string | null | undefined)[]): string | null => {
  const puliti: string[] = [];
  for (const v of valori) {
    const t = (v ?? "").trim();
    if (t && puliti.indexOf(t) === -1) puliti.push(t);
  }
  return puliti.length > 0 ? puliti.join(SEPARATORE_TRATTE) : null;
};

/** Codici delle tratte in un unico campo (`null` se non ce n'è nessuno). */
export function codiciTratte(tratte: Tratta[]): string | null {
  return unisci(tratte.map((t) => t.keyroggia));
}

/** Descrizioni delle tratte in un unico campo (`null` se non ce n'è nessuna). */
export function descrizioniTratte(tratte: Tratta[]): string | null {
  return unisci(tratte.map((t) => t.roggiaDescrizione));
}

/** Inverso di `codiciTratte`: rilegge i codici da un campo di snapshot. */
export function separaTratte(testo: string | null | undefined): string[] {
  return (testo ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}
