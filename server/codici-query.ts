/**
 * Lettura dei codici passati in query alle rotte `/api/consorzio` (issue #14).
 *
 * Sta in un modulo suo, e non inline nella rotta, perché il tetto è la parte che
 * vale la pena verificare: senza, una selezione molto larga produce una URL più
 * lunga di quanto Node accetti in un header e il client riceve un errore di
 * trasporto illeggibile invece di un messaggio.
 */

/** 500 codici da 9 caratteri stanno larghi nel limite di header di Node (16 KB). */
export const MAX_CODICI_QUERY = 500;

export class TroppiCodici extends Error {
  constructor(quanti: number) {
    super(`Troppi codici selezionati: ${quanti}, il massimo è ${MAX_CODICI_QUERY}`);
    this.name = "TroppiCodici";
  }
}

/**
 * Da `"S45DA1C01, s45da1c02"` a `["S45DA1C01", "S45DA1C02"]`.
 *
 * Normalizza come il resto dell'app (trim + maiuscolo) e toglie i duplicati:
 * i codici arrivano canonici dal mirror, ma una URL scritta a mano no. Il tetto
 * si applica ai codici *letti*, prima della deduplica, perché è la lunghezza
 * della URL a essere il problema.
 */
export function leggiCodici(grezzo: unknown): string[] {
  const codici = String(grezzo ?? "")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
  if (codici.length > MAX_CODICI_QUERY) throw new TroppiCodici(codici.length);
  return Array.from(new Set(codici));
}
