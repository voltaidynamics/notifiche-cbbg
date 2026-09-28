import { FiltroCodici } from "@shared/codici-attivi";
import type { IStorage } from "./storage";

/**
 * Il filtro di Gestione Codici (issue #52) con i dati di adesso.
 *
 * Le due mappe `tratta → madre` si leggono solo se qualcosa è spento: è il
 * caso raro, e senza questa scorciatoia ogni lettura di Invia notifica e di
 * Anagrafiche si porterebbe dietro due tabelle intere per non filtrare niente.
 */
export async function caricaFiltroCodici(
  archivio: Pick<IStorage, "getCodiciSpenti" | "getMappaMadri" | "getMappaMadriRogge">,
): Promise<FiltroCodici> {
  const spenti = await archivio.getCodiciSpenti();
  if (spenti.impianti.length === 0 && spenti.rogge.length === 0) return new FiltroCodici(spenti, {}, {});
  const [impianti, rogge] = await Promise.all([archivio.getMappaMadri(), archivio.getMappaMadriRogge()]);
  return new FiltroCodici(spenti, impianti, rogge);
}
