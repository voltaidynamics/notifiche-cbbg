// Lo stato aperta/chiusa di una roggia (issue #22).
//
// Non c'è nessuna colonna `stato`, da nessuna parte. `madri` e `tratte`
// sono lo specchio del consorzio e il sync notturno le riscrive per intero:
// una colonna nostra lì sopravviverebbe solo fino alle 03:00.
//
// Lo stato si ricava invece dagli *eventi*, cioè dalle selezioni delle notifiche
// già spedite (`notification_targets`). Tre conseguenze, tutte volute:
// «tutte aperte al caricamento» non costa né un backfill né una scrittura al
// sync; cancellare una notifica rimette lo stato com'era; e non nasce una
// seconda verità accanto allo Storico che possa divergerne in silenzio.
//
// Sta in `shared/` come `classificazione.ts` e `legame.ts`: la stessa regola
// serve al server (rotta di lettura) e a tre pagine del client, e tre copie
// sarebbero tre occasioni di divergere.

import type { TipoNotifica } from "./classificazione";

export const STATI_ROGGIA = ["aperta", "chiusa"] as const;
export type StatoRoggia = (typeof STATI_ROGGIA)[number];

export const ETICHETTE_STATO: Record<StatoRoggia, string> = {
  aperta: "Aperta",
  chiusa: "Chiusa",
};

// Gli stessi colori di apertura e chiusura in `classificazione.ts`: chi vede
// verde in una riga di Storico deve vedere verde anche nel badge della tratta.
export const COLORI_STATO: Record<StatoRoggia, string> = {
  aperta: "bg-green-100 text-green-700",
  chiusa: "bg-red-100 text-red-700",
};

/**
 * Come è stato scelto il codice al momento dell'invio.
 *
 * Non è ricavabile dalla lunghezza: è la dichiarazione di *come* è stata fatta
 * la selezione — le tratte spuntate a mano (rogge e impianti) o la madre presa
 * per intero (i pozzi, issue #26) — ed è quello a cui si appoggia
 * l'ereditarietà madre → figlia.
 */
export type LivelloCodice = "tratta" | "madre";

/**
 * `keyroggia → codice madre`, per risolvere l'ereditarietà.
 *
 * È un parametro e non una funzione importata perché **la madre è un dato**:
 * per i codici `R` è l'impianto che li rivendica, e nessuna regola sul codice
 * lo predice — 9 prefissi su 34 sono spalmati su più impianti, `R08` da solo
 * ne copre 13. Questo modulo resta così puro e testabile sotto vitest in
 * ambiente node, senza toccare il database.
 */
export type MadriDiTratte = Readonly<Record<string, string>>;

/** Una riga di `notification_targets` insieme al tipo della sua notifica. */
export interface EventoStato {
  /** Id della riga `notification_targets`: rompe la parità di `quando`. */
  id: number;
  notificaId: number;
  codice: string;
  livello: LivelloCodice;
  tipo: TipoNotifica;
  /** `notifications.created_at`, non `sent_at`: quello resta null finché la spedizione non finisce. */
  quando: Date;
  descrizione: string | null;
}

export interface PeriodoChiusura {
  dal: Date;
  /** Il codice dell'evento che ha chiuso: può essere la madre, non il codice chiesto. */
  codiceChiusura: string;
  notificaChiusura: number;
  al: Date | null;
  notificaApertura: number | null;
}

export interface StatoCorrente {
  stato: StatoRoggia;
  chiusaDal: Date | null;
  notificaId: number | null;
  chiusaDaCodice: string | null;
}

/** Lo stato di un codice come viaggia in JSON: la data è una stringa ISO. */
export interface StatoCodice {
  codice: string;
  livello: LivelloCodice;
  descrizione: string | null;
  stato: StatoRoggia;
  chiusaDal: string | null;
  notificaId: number | null;
  chiusaDaCodice: string | null;
}

const APERTA: StatoCorrente = { stato: "aperta", chiusaDal: null, notificaId: null, chiusaDaCodice: null };

/** Solo apertura e chiusura muovono lo stato: "altro" è registrato ma inerte. */
function muoveLoStato(tipo: TipoNotifica): boolean {
  return tipo === "apertura" || tipo === "chiusura";
}

/**
 * Se un evento riguarda un codice.
 *
 * - identità: l'evento è proprio su quel codice;
 * - madre → tratta: chiudere l'impianto chiude le sue tratte. Non il contrario:
 *   chiudere una tratta non chiude l'impianto.
 *
 * Il ramo dell'omnicomprensiva è sparito col modello a prefisso: «tutte le
 * tratte» ora si esprime selezionando la madre, che è già un evento di
 * livello `madre`.
 */
function riguarda(codice: string, livello: LivelloCodice, e: EventoStato, madri: MadriDiTratte): boolean {
  if (e.codice === codice) return true;
  if (livello !== "tratta") return false;
  const madre = madri[codice];
  return madre !== undefined && e.livello === "madre" && e.codice === madre;
}

/** Ordine cronologico, con l'id a rompere la parità. */
function inOrdine(eventi: EventoStato[]): EventoStato[] {
  return [...eventi].sort((a, b) => {
    const d = a.quando.getTime() - b.quando.getTime();
    return d !== 0 ? d : a.id - b.id;
  });
}

/**
 * Gli intervalli in cui il codice è risultato chiuso, in ordine.
 *
 * Una chiusura su un codice già chiuso **non** azzera il periodo in corso, e
 * un'apertura su un codice già aperto non apre niente: ripetere una
 * comunicazione è una scelta legittima dell'operatore, non un errore da
 * segnalare, e la ripetizione non deve spostare la data «chiusa dal».
 */
export function periodiDiChiusura(
  codice: string,
  livello: LivelloCodice,
  eventi: EventoStato[],
  madri: MadriDiTratte,
): PeriodoChiusura[] {
  const rilevanti = inOrdine(eventi.filter((e) => muoveLoStato(e.tipo) && riguarda(codice, livello, e, madri)));
  const periodi: PeriodoChiusura[] = [];
  let inCorso: PeriodoChiusura | null = null;

  for (const e of rilevanti) {
    if (e.tipo === "chiusura") {
      if (inCorso === null) {
        inCorso = { dal: e.quando, codiceChiusura: e.codice, notificaChiusura: e.notificaId, al: null, notificaApertura: null };
      }
    } else if (inCorso !== null) {
      inCorso.al = e.quando;
      inCorso.notificaApertura = e.notificaId;
      periodi.push(inCorso);
      inCorso = null;
    }
  }
  if (inCorso !== null) periodi.push(inCorso);
  return periodi;
}

/** Lo stato corrente di un codice. Senza eventi che lo riguardino è aperto. */
export function statoDi(codice: string, livello: LivelloCodice, eventi: EventoStato[], madri: MadriDiTratte): StatoCorrente {
  const periodi = periodiDiChiusura(codice, livello, eventi, madri);
  const ultimo = periodi.length > 0 ? periodi[periodi.length - 1] : null;
  if (ultimo === null || ultimo.al !== null) return APERTA;
  return {
    stato: "chiusa",
    chiusaDal: ultimo.dal,
    notificaId: ultimo.notificaChiusura,
    chiusaDaCodice: ultimo.codiceChiusura,
  };
}

/**
 * Lo stato di ogni codice mai nominato da una notifica.
 *
 * Include anche gli aperti: senza di loro il client non saprebbe distinguere
 * «figlia mai nominata, che eredita dalla madre chiusa» da «figlia riaperta
 * dopo la chiusura della madre», e le mostrerebbe entrambe chiuse.
 */
export function componiStati(eventi: EventoStato[], madri: MadriDiTratte): StatoCodice[] {
  const visti = new Map<string, { codice: string; livello: LivelloCodice; descrizione: string | null; quando: Date; id: number }>();
  for (const e of eventi) {
    const chiave = `${e.livello}|${e.codice}`;
    const precedente = visti.get(chiave);
    // La descrizione più recente vince: il nome nel mirror può essere cambiato
    // fra due invii, e quello vecchio non serve più a nessuno.
    if (precedente === undefined || e.quando.getTime() > precedente.quando.getTime() ||
        (e.quando.getTime() === precedente.quando.getTime() && e.id > precedente.id)) {
      visti.set(chiave, { codice: e.codice, livello: e.livello, descrizione: e.descrizione, quando: e.quando, id: e.id });
    }
  }

  const fuori: StatoCodice[] = [];
  // `forEach` e non `for...of`: iterare una Map con `for...of` richiede
  // `--downlevelIteration` col target ES5 di questo progetto.
  visti.forEach((v) => {
    const s = statoDi(v.codice, v.livello, eventi, madri);
    fuori.push({
      codice: v.codice,
      livello: v.livello,
      descrizione: v.descrizione,
      stato: s.stato,
      chiusaDal: s.chiusaDal === null ? null : s.chiusaDal.toISOString(),
      notificaId: s.notificaId,
      chiusaDaCodice: s.chiusaDaCodice,
    });
  });
  return fuori.sort((a, b) => a.codice.localeCompare(b.codice));
}

/**
 * Le tratte che risultano chiuse, una riga per tratta (issue #58).
 *
 * È il numero del box «Tratte chiuse» della Dashboard: una notifica che chiude
 * quattro tratte lo fa salire di quattro, e chiudere un pozzo lo fa salire di
 * quante tratte ha il pozzo. La madre non entra come riga a sé: non è una
 * tratta, e contarla accanto alle sue figlie conterebbe due volte la stessa
 * chiusura.
 *
 * Le figlie di una madre chiusa che nessuna notifica ha mai nominato non hanno
 * una riga in `stati`: si ricavano da `madri`, con la data e la notifica della
 * madre e `descrizione` null (il nome lo aggiunge la rotta, che ha il
 * registro). Una figlia che ha la sua riga la tiene: `componiStati` ha già
 * risolto l'ereditarietà, quindi una tratta riaperta dopo la madre resta
 * aperta.
 */
export function tratteChiuse(stati: StatoCodice[], madri: MadriDiTratte): StatoCodice[] {
  const conRiga = new Set<string>();
  const fuori: StatoCodice[] = [];
  for (const s of stati) {
    if (s.livello !== "tratta") continue;
    conRiga.add(s.codice);
    if (s.stato === "chiusa") fuori.push(s);
  }

  const madriChiuse = new Map<string, StatoCodice>();
  for (const s of stati) {
    if (s.livello === "madre" && s.stato === "chiusa") madriChiuse.set(s.codice, s);
  }
  if (madriChiuse.size > 0) {
    for (const codice of Object.keys(madri)) {
      const madre = madriChiuse.get(madri[codice]);
      if (madre === undefined || conRiga.has(codice)) continue;
      fuori.push({
        codice,
        livello: "tratta",
        descrizione: null,
        stato: "chiusa",
        chiusaDal: madre.chiusaDal,
        notificaId: madre.notificaId,
        chiusaDaCodice: madre.codice,
      });
    }
  }
  return fuori.sort((a, b) => a.codice.localeCompare(b.codice));
}

/**
 * Lo stato di un codice a partire dalla risposta della rotta.
 *
 * La riga propria vince sempre: l'ereditarietà è già stata risolta da
 * `componiStati`, e riapplicarla qui riporterebbe chiusa una tratta riaperta
 * dopo la chiusura della madre.
 *
 * `codiceMadre` arriva dal chiamante perché il chiamante ce l'ha già: le tratte
 * in pagina vengono da `/api/consorzio/tratte`, che porta `codicemadre` su ogni
 * riga. Dedurla qui richiederebbe di spedire al client l'intera mappa del
 * registro per rispondere a una domanda che riguarda un codice solo.
 */
export function risolviStato(
  codice: string,
  livello: LivelloCodice,
  stati: StatoCodice[],
  codiceMadre: string | null,
): { stato: StatoRoggia; chiusaDal: string | null; notificaId: number | null; chiusaDaCodice: string | null } {
  const propria = stati.find((s) => s.codice === codice && s.livello === livello);
  if (propria !== undefined) {
    return { stato: propria.stato, chiusaDal: propria.chiusaDal, notificaId: propria.notificaId, chiusaDaCodice: propria.chiusaDaCodice };
  }
  if (livello === "tratta" && codiceMadre !== null) {
    const daMadre = stati.find((s) => s.codice === codiceMadre && s.livello === "madre");
    if (daMadre !== undefined && daMadre.stato === "chiusa") {
      return { stato: "chiusa", chiusaDal: daMadre.chiusaDal, notificaId: daMadre.notificaId, chiusaDaCodice: daMadre.codice };
    }
  }
  return { stato: "aperta", chiusaDal: null, notificaId: null, chiusaDaCodice: null };
}

/**
 * Quel che la rotta di lettura restituisce.
 *
 * `stati` è bounded dai codici mai nominati da una notifica — poche centinaia,
 * non l'intera anagrafica. `chiusure` sono le date delle chiusure comunicate in
 * una finestra recente, e servono solo al grafico della Dashboard: mandare
 * tutti gli eventi di sempre farebbe crescere la risposta senza limite, per una
 * pagina che ne guarda trenta giorni.
 */
export interface RispostaStatoRogge {
  stati: StatoCodice[];
  chiusure: string[];
  /** Vedi `tratteChiuse`: il box della Dashboard, già espanso dalle madri. */
  tratteChiuse: StatoCodice[];
}

export function componiRispostaStato(eventi: EventoStato[], da: Date, madri: MadriDiTratte): RispostaStatoRogge {
  const chiusure = eventi
    .filter((e) => e.tipo === "chiusura" && e.quando.getTime() >= da.getTime())
    .map((e) => e.quando.toISOString())
    .sort();
  const stati = componiStati(eventi, madri);
  return { stati, chiusure, tratteChiuse: tratteChiuse(stati, madri) };
}
