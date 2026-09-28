// Come si classifica una comunicazione (issue #12, card di Invia notifica in #13).
//
// Due assi indipendenti, decisi dal consorzio:
// - TIPO: cosa succede alla tratta — si apre, si chiude, o nessuna delle due.
// - CLASSIFICAZIONE: perché — manovra ordinaria, straordinaria, o inquinamento.
//
// "Altro" non è un ripiego per pigrizia: i due assi sono obbligatori all'invio
// (issue #13) mentre la migrazione del consorzio non è finita, e senza una
// terza casella l'operatore sarebbe costretto a dichiarare un'apertura o una
// chiusura anche per una comunicazione che non è né l'una né l'altra. Meglio
// un "Altro" onesto che una riga di Storico classificata a caso.
//
// Stanno qui e non dentro la pagina perché gli stessi valori servono allo
// Storico Notifiche (colonne e filtri) e, quando l'invio sarà cablato, al
// server: tre copie della stessa lista sarebbero tre occasioni di divergere.
//
// I colori dei badge sono quelli richiesti nella issue, non una scelta estetica:
// Apertura verde, Chiusura rosso, Altro grigio, Ordinaria blu,
// Straordinaria giallo, Inquinamento viola.

export const TIPI_NOTIFICA = ["apertura", "chiusura", "altro"] as const;
export type TipoNotifica = (typeof TIPI_NOTIFICA)[number];

// Il tipo del *template* (issue #18) ha gli stessi tre valori, ma non è lo
// stesso campo: qui serve solo a filtrare la lista dei template, non decide se
// una roggia risulti aperta o chiusa. Per questo in database sta in una colonna
// propria, `tipo_template`, e non in quella della notifica. Due elenchi
// distinti perché un domani possano divergere senza che il template si porti
// dietro la semantica della notifica; etichette e colori restano invece in
// comune, che due palette per gli stessi tre badge sarebbero due occasioni di
// divergere.
export const TIPI_TEMPLATE = ["apertura", "chiusura", "altro"] as const;
export type TipoTemplate = (typeof TIPI_TEMPLATE)[number];

export const CLASSIFICAZIONI_NOTIFICA = ["ordinaria", "straordinaria", "inquinamento"] as const;
export type ClassificazioneNotifica = (typeof CLASSIFICAZIONI_NOTIFICA)[number];

export const ETICHETTE_TIPO: Record<TipoNotifica, string> = {
  apertura: "Apertura",
  chiusura: "Chiusura",
  altro: "Altro",
};

export const ETICHETTE_CLASSIFICAZIONE: Record<ClassificazioneNotifica, string> = {
  ordinaria: "Ordinaria",
  straordinaria: "Straordinaria",
  inquinamento: "Inquinamento",
};

export const COLORI_TIPO: Record<TipoNotifica, string> = {
  apertura: "bg-green-100 text-green-700",
  chiusura: "bg-red-100 text-red-700",
  altro: "bg-gray-100 text-gray-600",
};

export const COLORI_CLASSIFICAZIONE: Record<ClassificazioneNotifica, string> = {
  ordinaria: "bg-blue-100 text-blue-700",
  straordinaria: "bg-yellow-100 text-yellow-800",
  inquinamento: "bg-purple-100 text-purple-700",
};

export function isTipoNotifica(v: string): v is TipoNotifica {
  return (TIPI_NOTIFICA as readonly string[]).includes(v);
}

export function isClassificazioneNotifica(v: string): v is ClassificazioneNotifica {
  return (CLASSIFICAZIONI_NOTIFICA as readonly string[]).includes(v);
}

export function isTipoTemplate(v: string): v is TipoTemplate {
  return (TIPI_TEMPLATE as readonly string[]).includes(v);
}

export type EsitoClassificazione =
  | { ok: true; tipo: TipoNotifica; classificazione: ClassificazioneNotifica }
  | { ok: false; errore: string };

/**
 * Valida i due assi di una richiesta di invio.
 *
 * Sta qui e non dentro la rotta perché nel repo non c'è modo di testare Express:
 * una regola che decide se una comunicazione parte non può restare senza test.
 * Nessun ripiego silenzioso su un default — chi non manda i due campi riceve un
 * 400 e sa perché, altrimenti lo Storico si riempie di righe classificate a caso.
 */
export function validaClassificazioneInvio(raw: {
  tipo?: unknown;
  classificazione?: unknown;
}): EsitoClassificazione {
  const tipo = typeof raw.tipo === "string" ? raw.tipo : "";
  const classificazione = typeof raw.classificazione === "string" ? raw.classificazione : "";

  if (!isTipoNotifica(tipo)) {
    return { ok: false, errore: "Tipo mancante o non valido: attesi Apertura, Chiusura o Altro" };
  }
  if (!isClassificazioneNotifica(classificazione)) {
    return {
      ok: false,
      errore: "Classificazione mancante o non valida: attese Ordinaria, Straordinaria o Inquinamento",
    };
  }
  return { ok: true, tipo, classificazione };
}
