// Le tre sezioni di Invia notifica: Rogge, Impianti, Pozzi.
//
// Nei dati veri del consorzio la categoria NON è deducibile dal codice: i pozzi
// non hanno un prefisso proprio, stanno fra le madri `R..` e si riconoscono solo
// dal nome (`R10 - Pozzo bresciana`, `R17 - Pozzo ortaglie`). La regola
// "P.. = pozzo" valeva solo per le vecchie fixture di esempio.

export const CATEGORIE_MADRE = ["rogge", "impianti", "pozzi"] as const;
export type CategoriaMadre = (typeof CATEGORIE_MADRE)[number];

/**
 * La categoria di una madre secondo `codicetipoirrigazione` del WS.
 *
 * La decodifica è del consorzio (`Decodifica_impianti.txt`, confermata dalla
 * colonna Note della tabella endpoint): 1/2 rogge, 3/4/5 pozzi, 6 impianti —
 * il 4 è passato ai pozzi con la correzione del consorzio del 16/09/2026,
 * prima era fra le rogge.
 * È un dato, non un'euristica: sostituisce `categoriaMadre()`, che leggeva il
 * nome perché il WS non mandava ancora questo campo.
 *
 * `null` per un codice mai visto: chi chiama decide il ripiego, e deve
 * contarlo — perdere una madre significherebbe orfanare le sue tratte.
 */
export function categoriaDaTipoIrrigazione(codice: string): CategoriaMadre | null {
  switch ((codice ?? "").trim()) {
    case "1": case "2": return "rogge";
    case "3": case "4": case "5": return "pozzi";
    case "6": return "impianti";
    default: return null;
  }
}
