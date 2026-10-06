// Le regole di una richiesta di invio dalla pagina «Invia notifica» (issue #23).
//
// Stanno qui, condivise, per lo stesso motivo di `shared/classificazione.ts`:
// il client spegne il bottone con le stesse condizioni con cui il server
// rifiuta la richiesta, e due copie della stessa regola sono due occasioni di
// divergere — con il client che promette un invio che il server poi nega.

import { validaClassificazioneInvio, type ClassificazioneNotifica, type TipoNotifica } from "./classificazione";
import { validaLegame, type TipoLegame } from "./legame";

/**
 * Cosa manda il browser per far partire una comunicazione.
 *
 * Solo codici: `keyroggia` delle tratte e `keykey` dei conduttori scelti.
 * Indirizzi email e numeri li rilegge il server dall'anagrafica del consorzio,
 * non li accetta da chi chiama — un destinatario deciso dal browser sarebbe un
 * recapito che il consorzio non ha mai visto.
 */
export interface RichiestaInvioTratte {
  tratte: string[];
  /**
   * Codici madre scelti per intero, senza passare dalle tratte (issue #26).
   *
   * È come si scelgono i pozzi: in pagina le loro tratte non si mostrano, e il
   * server risolve i conduttori di tutti i figli della madre. Resta vuoto per
   * rogge e impianti, dove l'operatore spunta le tratte una a una.
   */
  madri: string[];
  destinatari: string[];
  /** Titolo della comunicazione: è l'oggetto della mail (issue #23). */
  titolo: string;
  messaggio: string;
  /**
   * La versione corta, per il canale SMS (issue #28).
   *
   * Opzionale, e `""` quando l'operatore non l'ha scritta: oggi nessun SMS
   * parte, e pretenderla fermerebbe comunicazioni legittime in cambio di un
   * campo che nessuno consuma. Chi lo salva lo trasforma in `null`.
   */
  messaggioSms: string;
  /**
   * Se la comunicazione va anche per SMS (spunta in pagina, spenta di default).
   *
   * Acceso, `messaggioSms` diventa obbligatorio: un SMS vuoto costa come uno
   * pieno, e a leggerlo sarebbe un messaggio senza contenuto da un mittente
   * che il conduttore non ha in rubrica.
   */
  inviaSms: boolean;
  tipo: TipoNotifica;
  classificazione: ClassificazioneNotifica;
  /**
   * Da quale dei due elenchi del consorzio pescare i destinatari (issue #27).
   *
   * Uno solo: per una tratta non è previsto l'invio sia ai legami live sia a
   * quelli di stagione irrigua.
   */
  legame: TipoLegame;
}

export type EsitoRichiestaInvio =
  | { ok: true; richiesta: RichiestaInvioTratte }
  | { ok: false; errore: string };

const codici = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const puliti: string[] = [];
  for (const x of v) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (t && puliti.indexOf(t) === -1) puliti.push(t);
  }
  return puliti;
};

const testo = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Valida la richiesta di invio interattivo.
 *
 * Il titolo è obbligatorio quanto i due assi: finisce dritto nell'oggetto della
 * mail, e una comunicazione del consorzio senza oggetto è la prima cosa che i
 * client di posta segnalano come sospetta (issue #23).
 */
export function validaRichiestaInvio(raw: {
  tratte?: unknown;
  madri?: unknown;
  destinatari?: unknown;
  titolo?: unknown;
  messaggio?: unknown;
  messaggioSms?: unknown;
  inviaSms?: unknown;
  tipo?: unknown;
  classificazione?: unknown;
  legame?: unknown;
}): EsitoRichiestaInvio {
  const esitoClassificazione = validaClassificazioneInvio(raw);
  if (!esitoClassificazione.ok) return { ok: false, errore: esitoClassificazione.errore };

  const titolo = testo(raw.titolo);
  if (!titolo) return { ok: false, errore: "Titolo della comunicazione mancante" };

  const messaggio = testo(raw.messaggio);
  if (!messaggio) return { ok: false, errore: "Messaggio mancante" };

  // Il testo SMS può mancare finché l'SMS non parte davvero (issue #28); se
  // invece la spunta è accesa diventa obbligatorio.
  const messaggioSms = testo(raw.messaggioSms);
  const inviaSms = raw.inviaSms === true;
  if (inviaSms && !messaggioSms) return { ok: false, errore: "Testo SMS mancante" };

  const tratte = codici(raw.tratte);
  // I pozzi arrivano con le sole madri (issue #26): quel che conta è che
  // qualcosa sia stato scelto, non da quale dei due elenchi.
  const madri = codici(raw.madri);
  if (tratte.length === 0 && madri.length === 0) {
    return { ok: false, errore: "Nessuna tratta selezionata" };
  }

  // Zero destinatari e' lecito: e' l'invio ai soli utenti di test (issue #36).
  // Chi puo' dire se si parte e' `preparaInvio`, che gli utenti di test li
  // legge dall'archivio — qui non si sa nemmeno se ne esistano.
  const destinatari = codici(raw.destinatari);

  // Nessun ripiego su "live": il legame decide *chi* riceve la comunicazione, e
  // sceglierlo per conto di chi chiama è spedire a un elenco che nessuno ha
  // guardato. La issue lo scrive come "stagione irrigua" — quella è l'etichetta,
  // il codice in colonna è quello del mirror.
  const legame = validaLegame(raw.legame);
  if (legame === null) {
    return { ok: false, errore: "Tipo di legame mancante o non valido: attesi Live o Stagione irrigua" };
  }

  return {
    ok: true,
    richiesta: {
      tratte,
      madri,
      destinatari,
      titolo,
      messaggio,
      messaggioSms,
      inviaSms,
      tipo: esitoClassificazione.tipo,
      classificazione: esitoClassificazione.classificazione,
      legame,
    },
  };
}

/**
 * Se questa selezione non raggiunge nessuno.
 *
 * Sta qui, condivisa, per lo stesso motivo del resto del modulo: la pagina
 * spegne il bottone «Invia notifica» con la stessa condizione con cui il server
 * rifiuta. Due copie divergerebbero, e a divergere sarebbe il client, che
 * promette un invio che il server nega.
 *
 * Un utente di test attivo basta da solo: e' precisamente il caso in cui
 * l'operatore ha tolto la spunta a tutti i conduttori per collaudare (issue #36).
 */
export function mancanoDestinatari(n: { conduttori: number; utentiTestAttivi: number }): boolean {
  return n.conduttori === 0 && n.utentiTestAttivi === 0;
}

/**
 * Lo stato della spunta «Invia anche via SMS» in Invia notifica (issue #117).
 *
 * Accesa di default, perché di base una comunicazione parte per mail e per SMS;
 * spenta e non selezionabile finché gli SMS non sono configurati, perché accesa
 * senza credenziali il server rifiuterebbe l'invio per intero e non partirebbe
 * più nemmeno la mail. `smsConfigurato` è `undefined` finché la pagina non l'ha
 * letto; `scelta` è `null` finché l'operatore non ha toccato la spunta.
 */
export function spuntaSms(
  smsConfigurato: boolean | undefined,
  scelta: boolean | null,
): { accesa: boolean; disponibile: boolean } {
  if (smsConfigurato !== true) return { accesa: false, disponibile: false };
  return { accesa: scelta ?? true, disponibile: true };
}
