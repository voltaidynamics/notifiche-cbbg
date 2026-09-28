// I due modi in cui il consorzio lega un conduttore a una tratta (issue #27).
//
// Il web service li esporta separatamente — `legamiLiveImpianti`,
// `legamiLiveOrari` e `legamiStagione` in `shared/wsEntities.ts` — e nel
// mirror finiscono nella stessa tabella `legami`, distinti dalla colonna
// `metodo`.
//
// I codici sono quelli di `legami.metodo`, non le parole della issue
// ("stagione irrigua"): quella è l'etichetta da mostrare, e infatti
// `ETICHETTE_ENTITA` chiama già l'entità «Legami stagione irrigua». Tenere due
// parole per lo stesso concetto — `stagione` nel mirror, `stagione irrigua`
// nelle notifiche — renderebbe ogni confronto fra le due tabelle una
// traduzione, e la traduzione dimenticata da qualche parte è un invio ai
// destinatari sbagliati.
//
// Sta in `shared/` come `classificazione.ts`: gli stessi valori servono alla
// pagina di invio, alla lettura dei destinatari, allo Storico e ai suoi export.

export const TIPI_LEGAME = ["live", "stagione"] as const;
export type TipoLegame = (typeof TIPI_LEGAME)[number];

export const ETICHETTE_LEGAME: Record<TipoLegame, string> = {
  live: "Live",
  stagione: "Stagione irrigua",
};

// Nessuno dei due è più grave dell'altro: sono due elenchi, non due livelli di
// allarme. Colori distinti fra loro e diversi da quelli di tipo e
// classificazione, che nella riga di Storico stanno a fianco a questo.
export const COLORI_LEGAME: Record<TipoLegame, string> = {
  live: "bg-indigo-100 text-indigo-700",
  stagione: "bg-teal-100 text-teal-700",
};

export function isTipoLegame(v: unknown): v is TipoLegame {
  return typeof v === "string" && (TIPI_LEGAME as readonly string[]).includes(v);
}

/**
 * Il legame di una richiesta, o `null` se manca o è fuori elenco.
 *
 * Nessun ripiego su un default: il legame decide *chi* riceve la
 * comunicazione, e sceglierlo per conto dell'operatore significa spedire a un
 * elenco che nessuno ha guardato.
 */
export function validaLegame(v: unknown): TipoLegame | null {
  return isTipoLegame(v) ? v : null;
}
