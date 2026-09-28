// Regole di selezione delle tratte, isolate dal componente per essere testabili
// senza DOM.
//
// Erano tre funzioni per una sola invariante: l'omnicomprensiva di una madre e
// le sue sorelle non potevano essere selezionate insieme. L'omnicomprensiva era
// il modo di dire «tutte le tratte» in un modello dove il server non sapeva
// quali fossero le tratte di una madre. Ora lo sa, e «tutte» è la madre stessa.

export interface TrattaSelezionata {
  keyroggia: string;
  codicemadre: string | null;
}

/** Accende o spegne una tratta. */
export function toggleTratta(sel: Set<string>, keyroggia: string): Set<string> {
  const next = new Set(sel);
  if (next.has(keyroggia)) next.delete(keyroggia);
  else next.add(keyroggia);
  return next;
}

/** Tutte le tratte in elenco. */
export function selezionaTutte<T extends TrattaSelezionata>(tratte: T[]): Set<string> {
  const next = new Set<string>();
  for (const t of tratte) next.add(t.keyroggia);
  return next;
}

/** Le sole tratte di una madre, lasciando intatto il resto della selezione. */
export function toggleMadre<T extends TrattaSelezionata>(
  sel: Set<string>,
  tratte: T[],
  codicemadre: string,
): Set<string> {
  const sue = tratte.filter((t) => t.codicemadre === codicemadre);
  const tutteAccese = sue.length > 0 && sue.every((t) => sel.has(t.keyroggia));
  const next = new Set(sel);
  for (const t of sue) {
    if (tutteAccese) next.delete(t.keyroggia);
    else next.add(t.keyroggia);
  }
  return next;
}

/**
 * Le madri di cui sono spuntate *tutte* le tratte in elenco, in ordine.
 *
 * È la regola di copertura unica della pagina: la usa il riepilogo per dire
 * «tutte» accanto a una tratta, e la usa `comprimiPerAnteprima` per decidere
 * quali madri mandare al posto delle loro tratte. Due copie direbbero due cose
 * diverse sulla stessa selezione.
 *
 * «Tutte» è rispetto a `elenco`, cioè alle tratte che il server ha dato per le
 * madri selezionate (`getTratteDiMadri`): è lo stesso insieme che il server
 * espande quando riceve la madre.
 */
export function madriComplete(tratte: string[], elenco: TrattaSelezionata[]): string[] {
  const scelte = new Set<string>();
  tratte.forEach((k) => scelte.add(k));
  const complete = new Map<string, boolean>();
  elenco.forEach((t) => {
    if (!t.codicemadre) return;
    const finora = complete.has(t.codicemadre) ? complete.get(t.codicemadre) === true : true;
    complete.set(t.codicemadre, finora && scelte.has(t.keyroggia));
  });
  const out: string[] = [];
  // `forEach`, non `for...of`: col target ES5 una Map non si itera.
  complete.forEach((tutte, madre) => {
    if (tutte) out.push(madre);
  });
  return out.sort();
}

/**
 * La selezione come la vedono le due anteprime in GET — destinatari e
 * conteggi dei legami —, con ogni madre completa al posto delle sue tratte.
 *
 * Gli impianti da soli hanno 542 tratte, e «Seleziona tutti» su 12 madri
 * superava il tetto di 500 codici per query (`server/codici-query.ts`). Le
 * alternative non reggono: in POST gli osservatori, che il guard globale
 * ferma su ogni richiesta non-GET, perderebbero «Mostra Conduttori»; alzare il
 * tetto si scontra con la riga di richiesta da 8 KB di Nginx Proxy Manager.
 * La semantica non cambia: il server espande una madre sulle stesse tratte, e
 * le righe che restituisce portano comunque i codici veri delle tratte.
 *
 * **Solo per le anteprime.** L'invio continua a mandare le tratte spuntate:
 * `notification_targets` resta a livello di tratta, o cambierebbero lo Storico
 * e il conteggio dei chiusi in Dashboard.
 */
export function comprimiPerAnteprima(
  tratte: string[],
  madri: string[],
  elenco: TrattaSelezionata[],
): { tratte: string[]; madri: string[] } {
  const complete = madriComplete(tratte, elenco);
  const madreDi = new Map<string, string>();
  elenco.forEach((t) => {
    if (t.codicemadre) madreDi.set(t.keyroggia, t.codicemadre);
  });

  const tratteViste = new Set<string>();
  const outTratte: string[] = [];
  tratte.forEach((k) => {
    const m = madreDi.get(k);
    if (m !== undefined && complete.indexOf(m) !== -1) return;
    if (tratteViste.has(k)) return;
    tratteViste.add(k);
    outTratte.push(k);
  });

  const madriViste = new Set<string>();
  const outMadri: string[] = [];
  madri.concat(complete).forEach((m) => {
    if (madriViste.has(m)) return;
    madriViste.add(m);
    outMadri.push(m);
  });

  return { tratte: outTratte, madri: outMadri };
}

/**
 * Le madri che una sezione di Invia notifica mostra a sinistra.
 *
 * Le madri di servizio — i codici R da 3 «non classificati» che il sync crea
 * per i legami su tratte che nessun impianto elenca — non si mostrano più in
 * nessuna sezione (mail del consorzio del 24/09/2026: in «Scorrimento», l'unica
 * dove comparivano, si vedono solo i codici `IM`). Le loro tratte si
 * raggiungono dalla sezione «Rogge Madri»: nell'export del 25/09 ne resta una
 * sola, `R28`, e nessun conduttore attivo è raggiungibile solo da lì.
 */
export function madriDellaSezione<T extends { categoria: string; origine: string }>(
  madri: T[],
  categoria: string,
): T[] {
  return madri.filter((m) => m.categoria === categoria && m.origine !== "servizio");
}
