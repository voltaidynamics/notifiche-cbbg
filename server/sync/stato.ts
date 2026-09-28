// server/sync/stato.ts
import type { SyncLog, StatoSync } from "@shared/schema";

export type { StatoSync };

/** `recenti` deve arrivare ordinato dal più recente al più vecchio. */
export function componiStatoSync(recenti: SyncLog[], inCorso: boolean): StatoSync {
  return {
    inCorso,
    ultimo: recenti[0] ?? null,
    // "Concluso con successo o parziale": un log "failed" non è un aggiornamento
    // riuscito dei dati, quindi non deve mai comparire come "ultimo aggiornamento
    // dati" — altrimenti chiudiSyncInterrotti, chiudendo come failed i log
    // orfani a ogni riavvio del server, farebbe annunciare alla pagina che i
    // dati sono aggiornati all'ora del riavvio (Correzione 3).
    ultimoCompletato: recenti.find((l) => l.status === "success" || l.status === "partial") ?? null,
  };
}
