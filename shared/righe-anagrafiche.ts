// Regole delle schede di Anagrafiche che non stanno in una sola query: le due
// implementazioni di `IStorage` le applicano identiche passando da qui.
//
// Tutte vengono dalla mail del consorzio del 24/09/2026.
import type { RigaRoggiaMadre } from "./schema";

/** Il segnaposto che il consorzio ha chiesto al posto di un dato che manca. */
export const TRATTINO = "-";

export type FigliaRoggiaMadre = {
  codiceMadre: string;
  codiceFiglia: string;
  descrizioneFiglia: string;
  codiceMadreImpianto: string | null;
};

/**
 * Le righe della scheda «Rogge madri»: una per figlia, più una per ogni madre
 * che non ne ha nessuna.
 *
 * - Una madre senza figlie compare con figlia «-» (codice e descrizione): senza
 *   questa riga sparirebbe dalla scheda, e sono cinque nell'export del 25/09.
 * - Una figlia la cui madre non è in elenco porta come madre le sue prime 3
 *   cifre — già in `codiceMadre`, il sync lo ricava così — e descrizione «-».
 *
 * Ordinate per madre e poi per figlia, così la riga «-» sta al posto della sua
 * madre e non in fondo.
 */
export function componiRigheRoggeMadri(
  figlie: FigliaRoggiaMadre[],
  madri: { codice: string; name: string }[],
): RigaRoggiaMadre[] {
  const nomi = new Map(madri.map((m) => [m.codice, m.name]));
  const conFiglie = new Set<string>();
  const righe: RigaRoggiaMadre[] = figlie.map((f) => {
    conFiglie.add(f.codiceMadre);
    return { ...f, descrizioneMadre: nomi.get(f.codiceMadre) ?? TRATTINO };
  });
  for (const m of madri) {
    if (conFiglie.has(m.codice)) continue;
    righe.push({
      codiceMadre: m.codice,
      descrizioneMadre: m.name,
      codiceFiglia: TRATTINO,
      descrizioneFiglia: TRATTINO,
      codiceMadreImpianto: null,
    });
  }
  return righe.sort((a, b) =>
    a.codiceMadre.localeCompare(b.codiceMadre) || a.codiceFiglia.localeCompare(b.codiceFiglia),
  );
}
