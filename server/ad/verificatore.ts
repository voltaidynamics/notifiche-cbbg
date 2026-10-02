/**
 * Il contratto con Active Directory, e nient'altro.
 *
 * Esiste separato dall'implementazione HTTP (`./http.ts`) per una ragione
 * operativa: la macchina di sviluppo non vedrà mai l'endpoint del consorzio,
 * quindi tutto il flusso di login deve poter essere provato contro una finta.
 */

// L'endpoint getuserAD dice solo vero o falso (issue #96): password scaduta,
// account bloccato o disabilitato sul dominio sono tutti «false».
export type EsitoAd =
  | { esito: "ok" }
  | { esito: "credenzialiNonValide" }
  | { esito: "nonRaggiungibile"; dettaglio: string };

export interface VerificatoreAd {
  verifica(username: string, password: string): Promise<EsitoAd>;
}

/**
 * Una password vuota non arriva mai all'endpoint: produrrebbe un URL con un
 * segmento vuoto (`…/getuserAD/m.rossi/`), di cui non conosciamo il
 * comportamento. Era anche la regola più pericolosa del bind LDAP, dove il
 * bind con password vuota riesce.
 */
export function passwordVuota(password: string): boolean {
  return password.trim() === "";
}

/** Il verificatore dei test. Non implementa nessuna regola: le regole si testano altrove. */
export class FakeVerificatoreAd implements VerificatoreAd {
  public chiamate: { username: string; password: string }[] = [];
  private esiti = new Map<string, EsitoAd>();

  constructor(private predefinito: EsitoAd = { esito: "credenzialiNonValide" }) {}

  imposta(username: string, esito: EsitoAd): void {
    this.esiti.set(username, esito);
  }

  async verifica(username: string, password: string): Promise<EsitoAd> {
    this.chiamate.push({ username, password });
    return this.esiti.get(username) ?? this.predefinito;
  }
}
