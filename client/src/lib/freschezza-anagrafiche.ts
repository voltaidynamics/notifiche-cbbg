// Quanto sono "vecchi" i dati del consorzio caricati a sistema.
//
// Il caricamento automatico gira una volta a notte (cron delle 03:00 in
// server/scheduler.ts): un dato più vecchio di 24 ore significa che l'ultima
// corsa notturna non è andata a buon fine, ed è esattamente il caso in cui
// all'operatore conviene lanciare l'aggiornamento a mano prima di spedire una
// comunicazione. Sotto la soglia, invece, il caricamento on demand non serve —
// ed è il punto della issue #8: offrire l'opzione senza farla girare sempre.

export const SOGLIA_OBSOLETO_MS = 24 * 60 * 60 * 1000;

export type StatoFreschezza = "assente" | "fresco" | "obsoleto";

export type Freschezza = {
  stato: StatoFreschezza;
  /** Data e ora leggibili dell'ultimo caricamento riuscito, o "mai". */
  quando: string;
};

/** Accetta la forma minima di un SyncLog: serve solo la data di fine. */
type ConFine = { finishedAt?: string | Date | null } | null | undefined;

export function formattaQuando(d: string | Date | null | undefined): string {
  if (!d) return "mai";
  const data = new Date(d);
  if (Number.isNaN(data.getTime())) return "mai";
  return data.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function descriviFreschezza(ultimoCompletato: ConFine, adesso: Date): Freschezza {
  const fine = ultimoCompletato?.finishedAt;
  if (!fine) return { stato: "assente", quando: "mai" };

  const data = new Date(fine);
  // Una data illeggibile non è una prova di aggiornamento: vale come assente,
  // altrimenti l'interfaccia annuncerebbe dati freschi che nessuno ha caricato.
  if (Number.isNaN(data.getTime())) return { stato: "assente", quando: "mai" };

  // Età negativa = orologi client e server disallineati. Non è un dato vecchio,
  // quindi non va segnalato come obsoleto.
  const eta = adesso.getTime() - data.getTime();
  return {
    stato: eta > SOGLIA_OBSOLETO_MS ? "obsoleto" : "fresco",
    quando: formattaQuando(data),
  };
}
