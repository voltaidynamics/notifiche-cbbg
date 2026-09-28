// La seconda gerarchia del consorzio: le rogge madri `R` e le loro figlie.
//
// Convive con quella degli impianti (`madri`/`tratte`) e non la sostituisce: il
// consorzio le mantiene con endpoint diversi e liste che non coincidono — `R29`
// nell'export del 22/09/2026 è una roggia madre senza nessuna figlia, e nello
// stesso export le sue ~100 tratte sono sparite dall'aggregazione `IM`. Il punto
// di contatto fra le due gerarchie è il codice della tratta, ed è abbastanza:
// `legami` e `notification_targets` lavorano già per codice.
import type { RoggiaMadreInsert, TrattaRoggiaInsert } from "./ws-consorzio";

export type GerarchiaRogge = {
  madri: RoggiaMadreInsert[];
  tratte: TrattaRoggiaInsert[];
};

export type ConteggiGerarchiaRogge = { madri: number; tratte: number };

/** Nomi veri del consorzio, per le righe che altrimenti mostrerebbero il codice. */
export type NomiGerarchiaRogge = {
  madri: Record<string, string>;
  tratte: Record<string, string>;
};

export const NOMI_VUOTI: NomiGerarchiaRogge = { madri: {}, tratte: {} };

/**
 * La gerarchia da scrivere, a partire dalle righe lette dai due endpoint.
 *
 * Una figlia il cui prefisso non è fra le madri lette **si tiene e si conta**
 * (richiesta del consorzio del 24/09/2026): in Anagrafiche compare con la
 * madre ricavata dalle prime 3 cifre e la descrizione «-». La madre **non** si
 * inventa: nessuna riga in `madri_rogge`, quindi Invia notifica — che elenca le
 * madri da lì — non la offre. Fino alla 0015 lo impediva una FK, e la figlia
 * si scartava.
 *
 * Una madre ripetuta invece si scarta: si tiene la prima e **si conta**. Non
 * è un caso teorico — nell'elenco del 22/09/2026 cinque codici arrivano due
 * volte con nomi diversi («R32 - Comprensorio canale adda» e «R32 - Roggia
 * morla di comun nuovo e spirano»), e la chiave primaria di `madri_rogge`
 * farebbe fallire la scrittura. Tenere la prima è una scelta arbitraria fra
 * due nomi che il consorzio dà allo stesso codice: il conteggio è l'unico modo
 * perché qualcuno se ne accorga e chieda quale dei due vale.
 */
export function componiGerarchia(
  madri: RoggiaMadreInsert[],
  figlie: TrattaRoggiaInsert[],
): { gerarchia: GerarchiaRogge; senzaMadre: number; madriDuplicate: number } {
  const note: Record<string, true> = {};
  const madriUniche: RoggiaMadreInsert[] = [];
  let madriDuplicate = 0;
  madri.forEach((m) => {
    if (note[m.codice]) { madriDuplicate++; return; }
    note[m.codice] = true;
    madriUniche.push(m);
  });

  const viste: Record<string, true> = {};
  const tratte: TrattaRoggiaInsert[] = [];
  let senzaMadre = 0;
  figlie.forEach((f) => {
    if (viste[f.keyroggia]) return;
    viste[f.keyroggia] = true;
    if (!note[f.codiceMadre]) senzaMadre++;
    tratte.push(f);
  });

  return { gerarchia: { madri: madriUniche, tratte }, senzaMadre, madriDuplicate };
}

export function nomiDiGerarchia(g: GerarchiaRogge): NomiGerarchiaRogge {
  const madri: Record<string, string> = {};
  const tratte: Record<string, string> = {};
  g.madri.forEach((m) => { if (m.name !== "") madri[m.codice] = m.name; });
  g.tratte.forEach((t) => { if (t.name !== "") tratte[t.keyroggia] = t.name; });
  return { madri, tratte };
}
