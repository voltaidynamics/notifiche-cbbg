/**
 * Ricerca sulla tabella dei conduttori di «Invia notifica».
 *
 * Sta qui, e non nella pagina, per la stessa ragione di `selezione-tratte.ts`:
 * è la regola su *chi* si vede e su *chi* agiscono «Seleziona / Deseleziona
 * tutti», e va potuta provare senza montare la pagina.
 *
 * Il tipo è strutturale di proposito: la pagina passa le sue `Row` intere e le
 * riottiene indietro, senza rimappare niente.
 */
type RigaConduttore = {
  conduttore: { keykey: string; descrizione: string; email: string | null };
};

/**
 * Le righe che corrispondono alla ricerca, nell'ordine in cui arrivano.
 *
 * Cerca sul nome e sull'indirizzo, i due campi con cui l'operatore riconosce
 * una persona. Query vuota (o di soli spazi) vuol dire «nessun filtro»: è la
 * condizione normale della pagina, non un caso limite.
 */
export function filtraConduttori<T extends RigaConduttore>(righe: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return righe;
  return righe.filter((r) => {
    const nome = r.conduttore.descrizione.toLowerCase();
    // Chi non ha indirizzo non deve sparire quando a corrispondere è il nome,
    // né comparire quando si cerca una chiocciola.
    const email = (r.conduttore.email ?? "").toLowerCase();
    return nome.includes(q) || email.includes(q);
  });
}

/** Le chiavi delle righe passate: su queste, e solo su queste, agisce il tasto. */
export function chiaviDi(righe: RigaConduttore[]): Set<string> {
  return new Set(righe.map((r) => r.conduttore.keykey));
}
