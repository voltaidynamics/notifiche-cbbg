// Gli utenti di test degli invii (issue #36).
//
// Sta in `shared/` perché la stessa regola serve al form di Impostazioni e alla
// rotta che salva: due copie divergerebbero, e la divergenza si scoprirebbe il
// giorno del collaudo, quando un utente censito non riceve niente e nessuno sa
// dire perché.

/** Da quale casella parte la comunicazione verso questo utente di test. */
export const TIPI_EMAIL_TEST = ["normale", "pec"] as const;
export type TipoEmailTest = (typeof TIPI_EMAIL_TEST)[number];

/**
 * Vero se questo utente di test non ha nessun recapito.
 *
 * Non riceverebbe niente da nessun canale, e comparirebbe nell'elenco come se
 * il collaudo lo raggiungesse. Uno solo dei due basta: c'è chi si censisce per
 * il solo SMS e chi per la sola mail.
 */
export function recapitoMancante(u: { email?: string | null; telefono?: string | null }): boolean {
  return (u.email ?? "").trim() === "" && (u.telefono ?? "").trim() === "";
}

/**
 * Se questo utente di test è raggiungibile da *questa* comunicazione.
 *
 * Non basta che abbia un recapito: un utente censito col solo telefono non
 * riceve niente da un invio in cui la spunta SMS è spenta. Contarlo lo stesso
 * farebbe partire un invio che non raggiunge nessuno — e che lascerebbe dietro
 * di sé una riga di Storico e una roggia chiusa in Dashboard.
 *
 * Prende dei booleani e non i recapiti perché la deve applicare anche la
 * pagina di invio, a cui i recapiti non vengono mai mandati.
 */
export function utenteTestRaggiungibile(
  u: { haEmail: boolean; haTelefono: boolean },
  inviaSms: boolean,
): boolean {
  return u.haEmail || (inviaSms && u.haTelefono);
}
