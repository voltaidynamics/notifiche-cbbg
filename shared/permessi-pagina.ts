/**
 * Chi vede quale pagina.
 *
 * Fino alla issue #45 la risposta veniva da un gruppo: `app_users.group_id`
 * puntava a una riga `groups` con l'elenco delle pagine concedibili, e
 * `resolveAllowedPages()` lo risolveva a ogni login. Gruppi, tabella e scheda
 * del pannello admin sono stati rimossi — nessun gruppo era mai stato creato e
 * nessun utente vi era assegnato — e quello che resta è la sola regola di
 * ruolo, che è esattamente ciò che vedeva un utente senza gruppo.
 *
 * La regola sta qui e non dentro il contesto React perché il setup dei test
 * gira in ambiente node: dentro `AuthContext` sarebbe l'unica decisione di
 * accesso dell'app senza test.
 */

/** Lo slug del pannello «Gestione Utenti». */
export const SLUG_GESTIONE_UTENTI = "admin";

/** Lo slug di «Gestione Codici» (issue #52): decide cosa vede chi spedisce. */
export const SLUG_GESTIONE_CODICI = "gestione-codici";

/**
 * Lo slug di «Impostazioni». Riservata dalla issue #73: ogni rotta che legge o
 * salva le impostazioni è `requireAdmin`, quindi a un utente la pagina mostrava
 * solo campi vuoti, modificabili, e un 403 al salvataggio.
 */
export const SLUG_IMPOSTAZIONI = "impostazioni";

/**
 * «Invia Notifica» e «Storico» avevano lo stesso slug, `notifiche`: separati
 * dalla issue #73, perché l'osservatore deve vedere il secondo e non il primo.
 */
export const SLUG_INVIA_NOTIFICA = "invia-notifica";
export const SLUG_STORICO = "notifiche";

/** Le pagine riservate agli amministratori. */
const PAGINE_AMMINISTRATIVE = [SLUG_GESTIONE_UTENTI, SLUG_GESTIONE_CODICI, SLUG_IMPOSTAZIONI];

/** I ruoli che amministrano l'applicazione, e quindi vedono ogni pagina. */
const RUOLI_AMMINISTRATIVI = ["superadmin", "admin"];

/**
 * Le sole pagine dell'osservatore (issue #73): guarda, non spedisce e non scrive
 * template. È un elenco di pagine aperte e non di pagine chiuse, così una pagina
 * nuova gli resta nascosta finché qualcuno non decide di aggiungerla qui.
 */
const PAGINE_OSSERVATORE = ["dashboard", SLUG_STORICO, "anagrafiche"];

/**
 * Se un utente con quel ruolo può aprire la pagina.
 *
 * Il ruolo arriva come stringa da `app_users.role`: un valore fuori da
 * `APP_ROLES` non deve poter diventare amministratore per caso, quindi il
 * ripiego è l'utente semplice.
 */
export function puoAccedere(role: string, pageSlug: string): boolean {
  if (RUOLI_AMMINISTRATIVI.includes(role)) return true;
  if (role === "osservatore") return PAGINE_OSSERVATORE.includes(pageSlug);
  return PAGINE_AMMINISTRATIVE.indexOf(pageSlug) === -1;
}
