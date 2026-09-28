// Gestione Codici (issue #52): quali madri sono accese.
//
// L'admin spegne un impianto o una roggia madre, e da quel momento il codice
// non si consulta in Anagrafiche né riceve comunicazioni da Invia notifica.
// Lo Storico e la Dashboard non si filtrano: raccontano cosa è successo, e una
// notifica partita ieri verso un codice spento oggi è partita lo stesso.
//
// Sta in `shared/` come `stato-rogge.ts`: la regola la applicano le rotte di
// lettura, la rotta di invio e i test, e tre copie sarebbero tre occasioni di
// rispondere in modo diverso a «questa tratta si può usare?».

export const GERARCHIE_CODICI = ["impianti", "rogge"] as const;
export type GerarchiaCodice = (typeof GERARCHIE_CODICI)[number];

/** Le etichette dei due tab di Gestione Codici. */
export const ETICHETTE_GERARCHIA: Record<GerarchiaCodice, string> = {
  impianti: "Impianti",
  rogge: "Rogge Madri",
};

export function isGerarchiaCodice(v: unknown): v is GerarchiaCodice {
  return typeof v === "string" && (GERARCHIE_CODICI as readonly string[]).includes(v);
}

/**
 * I codici spenti, per gerarchia.
 *
 * - `impianti`: codici della tabella `madri` — impianti, pozzi, rogge a
 *   scorrimento, madri `S` e madri di servizio;
 * - `rogge`: codici della tabella `madri_rogge`, la seconda gerarchia.
 */
export interface CodiciSpenti {
  impianti: string[];
  rogge: string[];
}

/** Una riga di Gestione Codici. */
export interface RigaGestioneCodice {
  codice: string;
  descrizione: string;
  attivo: boolean;
}

export interface RispostaGestioneCodici {
  impianti: RigaGestioneCodice[];
  rogge: RigaGestioneCodice[];
}

/**
 * La regola, con le due mappe `tratta → madre` delle due gerarchie.
 *
 * **Una tratta è attiva se almeno una delle sue madri è accesa.** Le due
 * gerarchie si guardano ciascuna per sé — spegnere `IM01A` toglie le sue
 * tratte dalle schede Scorrimento/Impianti/Pozzi, ma quelle che la roggia
 * madre `R01` rivendica restano in «Rogge Madri» finché `R01` è accesa — e il
 * server non sa da quale bottone è partita una selezione, quindi accetta una
 * tratta se *qualche* strada visibile la offre. Legami di Anagrafiche e
 * controllo dell'invio usano la stessa risposta: una tratta che si può ancora
 * spedire si deve anche poter consultare.
 *
 * Una tratta che nessuna delle due mappe conosce non ha un codice da spegnere,
 * e resta attiva.
 */
export class FiltroCodici {
  private readonly impiantiSpenti: Set<string>;
  private readonly roggeSpente: Set<string>;

  constructor(
    spenti: CodiciSpenti,
    private readonly madreImpianto: Readonly<Record<string, string>>,
    private readonly madreRoggia: Readonly<Record<string, string>>,
  ) {
    this.impiantiSpenti = new Set(spenti.impianti);
    this.roggeSpente = new Set(spenti.rogge);
  }

  /** Nessun codice spento: ogni filtro lascia passare tutto. */
  get vuoto(): boolean {
    return this.impiantiSpenti.size === 0 && this.roggeSpente.size === 0;
  }

  madreAttiva(codice: string): boolean {
    return !this.impiantiSpenti.has(codice);
  }

  roggiaMadreAttiva(codice: string): boolean {
    return !this.roggeSpente.has(codice);
  }

  trattaAttiva(keyroggia: string): boolean {
    const im = this.madreImpianto[keyroggia];
    const r = this.madreRoggia[keyroggia];
    if (im === undefined && r === undefined) return true;
    return (im !== undefined && this.madreAttiva(im)) || (r !== undefined && this.roggiaMadreAttiva(r));
  }

  /**
   * I codici di una richiesta di invio che non si possono usare, nell'ordine
   * in cui arrivano. Vuoto = la richiesta passa.
   */
  bloccati(tratte: string[], madri: string[]): string[] {
    return [
      ...madri.filter((m) => !this.madreAttiva(m)),
      ...tratte.filter((t) => !this.trattaAttiva(t)),
    ];
  }
}
