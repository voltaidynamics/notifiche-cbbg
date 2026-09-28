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

/** Le pagine riservate agli amministratori. */
const PAGINE_AMMINISTRATIVE = [SLUG_GESTIONE_UTENTI, SLUG_GESTIONE_CODICI];

/** I ruoli che amministrano l'applicazione, e quindi vedono ogni pagina. */
const RUOLI_AMMINISTRATIVI = ["superadmin", "admin"];

/**
 * Se un utente con quel ruolo può aprire la pagina.
 *
 * Il ruolo arriva come stringa da `app_users.role`: un valore fuori da
 * `APP_ROLES` non deve poter diventare amministratore per caso, quindi il
 * ripiego è il ruolo meno potente.
 */
export function puoAccedere(role: string, pageSlug: string): boolean {
  if (RUOLI_AMMINISTRATIVI.includes(role)) return true;
  return PAGINE_AMMINISTRATIVE.indexOf(pageSlug) === -1;
}
