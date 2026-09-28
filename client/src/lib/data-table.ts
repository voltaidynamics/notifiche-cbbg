export type Colonna<T> = {
  chiave: Extract<keyof T, string>;
  etichetta: string;
};

function testo(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Filtri per colonna, combinati in AND. Un filtro vuoto non filtra.
 *
 * Dentro un filtro conta ogni parola, non la stringa intera: «mario rossi»
 * trova «Rossi Mario». Prima si cercava la frase così com'era scritta, e il
 * consorzio doveva indovinare l'ordine cognome nome (richiesta del 24/09/2026).
 */
export function filtraRighe<T extends Record<string, unknown>>(
  righe: T[],
  filtri: Record<string, string>,
): T[] {
  const attivi = Object.entries(filtri)
    .map(([chiave, valore]) => [chiave, valore.toLowerCase().split(/\s+/).filter((p) => p !== "")] as const)
    .filter(([, parole]) => parole.length > 0);
  if (attivi.length === 0) return righe;
  return righe.filter((riga) =>
    attivi.every(([chiave, parole]) => {
      const cella = testo(riga[chiave]).toLowerCase();
      return parole.every((p) => cella.includes(p));
    }),
  );
}

/**
 * Ordina senza modificare l'array di partenza. I valori nulli finiscono sempre
 * in fondo, anche in ordine decrescente: altrimenti una colonna con molti campi
 * vuoti nasconderebbe i dati utili in cima.
 */
export function ordinaRighe<T extends Record<string, unknown>>(
  righe: T[],
  chiave: string | null,
  crescente: boolean,
): T[] {
  if (!chiave) return [...righe];
  const vuoto = (v: unknown) => v === null || v === undefined || v === "";
  return [...righe].sort((a, b) => {
    const va = a[chiave], vb = b[chiave];
    if (vuoto(va) && vuoto(vb)) return 0;
    if (vuoto(va)) return 1;
    if (vuoto(vb)) return -1;
    const sa = testo(va).toLowerCase(), sb = testo(vb).toLowerCase();
    if (sa < sb) return crescente ? -1 : 1;
    if (sa > sb) return crescente ? 1 : -1;
    return 0;
  });
}
