// I due canali di posta con cui si raggiunge un conduttore: ordinaria e PEC.
//
// Stavano in `server/config-notifiche.ts` e in `server/invio-notifica.ts`, dove
// li vedeva solo chi spedisce. Ma la domanda «questo conduttore è PEC?» se la
// pone anche l'operatore *prima* di premere invio, e la pagina «Invia notifica»
// non può importare da `server/`: o si duplicava la regola, o saliva qui.
// Duplicarla vorrebbe dire che un giorno la colonna in pagina dice «Email» e la
// mail parte dalla PEC — cioè la tabella mente proprio sul dato che serve
// controllare.

export const CANALI_EMAIL = ["normale", "pec"] as const;
export type CanaleEmail = (typeof CANALI_EMAIL)[number];

export const ETICHETTE_CANALE: Record<CanaleEmail, string> = {
  normale: "Email",
  pec: "PEC",
};

// Viola per la PEC, come il badge già in uso nel dettaglio dello Storico: chi
// guarda le due schermate deve riconoscere lo stesso canale allo stesso colore.
// La posta ordinaria non ha badge, è il caso normale.
export const COLORE_CANALE_PEC = "bg-purple-100 text-purple-700";

/**
 * Il canale con cui va raggiunto un conduttore.
 *
 * `tipo_email` arriva dal WS già normalizzato a "normale" | "pec"
 * (`parseConduttore` in `shared/ws-consorzio.ts`); qualunque altro valore vale
 * come posta ordinaria, che è il ripiego meno impegnativo: una PEC spedita per
 * errore da una casella ordinaria è una comunicazione senza valore legale,
 * mentre una mail ordinaria spedita da una PEC costa un messaggio certificato
 * a vuoto.
 */
export function canaleDi(tipoEmail: string | null | undefined): CanaleEmail {
  return (tipoEmail ?? "").trim().toLowerCase() === "pec" ? "pec" : "normale";
}

/**
 * Se questo conduttore ha un indirizzo su cui spedire.
 *
 * Senza, non parte da nessuno dei due canali: non è «posta ordinaria», è
 * niente. Contarlo fra gli ordinari farebbe pretendere le credenziali di una
 * casella che non manderà nulla.
 */
export function haIndirizzo(email: string | null | undefined): boolean {
  return (email ?? "").trim() !== "";
}

/**
 * Quanti destinatari vanno raggiunti su ciascun canale.
 *
 * Una funzione sola perché il numero deve essere lo stesso in due punti: quello
 * che «Invia notifica» mostra come «N via PEC» prima dell'invio, e quello che il
 * server scrive nel rifiuto *«N destinatari su M vanno raggiunti via PEC»*. Due
 * conteggi scritti a mano sarebbero due numeri diversi il giorno in cui uno dei
 * due smette di escludere chi non ha indirizzo — e l'operatore si vedrebbe
 * rifiutare un invio che la pagina dava per tutto ordinario.
 */
export function contaPerCanale(
  destinatari: { email?: string | null; tipoEmail?: string | null }[],
): Record<CanaleEmail, number> {
  const conteggi: Record<CanaleEmail, number> = { normale: 0, pec: 0 };
  for (const d of destinatari) {
    if (!haIndirizzo(d.email)) continue;
    conteggi[canaleDi(d.tipoEmail)] += 1;
  }
  return conteggi;
}
