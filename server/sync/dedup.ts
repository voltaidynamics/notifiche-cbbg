
/**
 * Deduplica per chiave naturale mantenendo l'ULTIMA occorrenza e l'ordine di
 * prima apparizione.
 *
 * Obbligatorio prima di ogni `storage.replace*`: PostgreSQL solleva una
 * violazione di chiave primaria sui duplicati, MemStorage invece li assorbe
 * silenziosamente. Senza questo passaggio il sync funziona in test e fallisce
 * in produzione.
 */
export function dedupByKey<T>(righe: T[], chiave: (riga: T) => string): T[] {
  const posizione = new Map<string, number>();
  const out: T[] = [];
  for (const riga of righe) {
    const k = chiave(riga);
    const i = posizione.get(k);
    if (i === undefined) {
      posizione.set(k, out.length);
      out.push(riga);
    } else {
      out[i] = riga;
    }
  }
  return out;
}
