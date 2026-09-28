/**
 * Il contratto con Active Directory, e nient'altro.
 *
 * Esiste separato dall'implementazione LDAP per una ragione operativa: la
 * macchina di sviluppo non vedrà mai il domain controller del consorzio, quindi
 * tutto il flusso di login deve poter essere provato contro una finta. Il primo
 * contatto con AD vero sarà il collaudo in sede.
 */

export type EsitoAd =
  | { esito: "ok" }
  | { esito: "credenzialiNonValide" }
  | { esito: "passwordScaduta" }
  | { esito: "accountDisabilitato" }
  | { esito: "accountBloccato" }
  | { esito: "nonRaggiungibile"; dettaglio: string };

export interface VerificatoreAd {
  verifica(username: string, password: string): Promise<EsitoAd>;
}

/**
 * Il simple bind LDAP con password vuota RIESCE: la specifica lo prevede come
 * "unauthenticated bind" e molti server lo accettano restituendo successo.
 * Senza questo controllo, chiunque digiti uno username di dominio valido
 * lasciando la password in bianco entrerebbe nell'app.
 */
export function passwordVuota(password: string): boolean {
  return password.trim() === "";
}

type EsitoSenzaDettaglio = Exclude<EsitoAd, { esito: "nonRaggiungibile" }>["esito"];

/**
 * Un bind fallito torna sempre errore 49; il perché sta in un codice `data`
 * dentro il messaggio. Se ne distinguono solo tre, quelli che altrimenti
 * generano una telefonata all'assistenza. `525` (utente inesistente) resta
 * deliberatamente indistinguibile da una password sbagliata.
 */
const CODICI_DATA: Record<string, EsitoSenzaDettaglio> = {
  "532": "passwordScaduta",
  "773": "passwordScaduta",
  "533": "accountDisabilitato",
  "701": "accountDisabilitato",
  "775": "accountBloccato",
};

export function esitoDaErroreLdap(err: unknown): EsitoAd {
  const e = err as { code?: number | string; message?: string } | null;
  const messaggio = e?.message ?? String(err);

  if (String(e?.code) === "49") {
    const trovato = /data ([0-9a-f]+)/i.exec(messaggio);
    const esito = trovato ? CODICI_DATA[trovato[1].toLowerCase()] : undefined;
    return esito ? { esito } : { esito: "credenzialiNonValide" };
  }

  // Tutto ciò che non è un rifiuto di credenziali è il DC che non risponde.
  // Tenerli distinti vale ore in collaudo.
  return { esito: "nonRaggiungibile", dettaglio: messaggio };
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
