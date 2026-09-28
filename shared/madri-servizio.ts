// Le madri che il consorzio non ci manda, e che sintetizziamo per non perdere
// i loro conduttori.
//
// `getconduttoriroggecartoline/R` cita 34 codici che `getimpiantirogge/all`
// non contiene — `R34D02+++`, `R29D10+++`, `R28++++++`, con dei `+` al posto
// delle ultime cifre. Sono 1.373 righe su 6.960, e senza una madre 803
// conduttori (377 attivi e con email) non comparirebbero in nessuna scheda di
// Invia notifica: non «vuoti», proprio assenti, senza che nulla lo dica.
//
// Il raggruppamento è per prefisso a 3 e non in un unico mucchio: `R29` è un
// nome che il consorzio riconosce, e l'operatore che vuole avvisare la R29 non
// deve spuntare 18 codici in mezzo ad altri 16 che non c'entrano.
import { prefissoMadre, type LegameInsert, type MadreInsert, type TrattaInsert } from "./ws-consorzio";
import { NOMI_VUOTI, type NomiGerarchiaRogge } from "./gerarchia-rogge";

export type SintesiServizio = {
  madri: MadreInsert[];
  tratte: TrattaInsert[];
};

function madreDiServizio(codice: string, nome: string | undefined): MadreInsert {
  return {
    codice,
    // Il nome vero del consorzio quando c'è (dalla seconda gerarchia, letta
    // prima del registro), il ripiego altrimenti. Non contraddice la regola
    // «nessun nome inventato»: questo nome lo scrive il consorzio, non noi.
    name: nome ?? `${codice} — non classificata`,
    // `rogge` è una scelta dichiarata, non una conoscenza: i codici orfani
    // iniziano tutti per R e la categoria vera la direbbe l'impianto che non
    // li contiene. Serve però *una* categoria, o Invia notifica — che
    // raggruppa in tre schede — non li mostrerebbe da nessuna parte.
    // `origine: "servizio"` le tiene distinguibili da quelle vere.
    categoria: "rogge",
    tipoIrrigazione: null,
    origine: "servizio",
  };
}

/**
 * Le madri e le tratte da aggiungere perché ogni legame abbia una tratta e ogni
 * tratta una madre.
 *
 * Va chiamata **dopo** aver letto tutti i legami, tutte le tratte e tutte le
 * madri vere: è lì che si scopre chi è orfano. I legami con un `keyroggia` non
 * adottabile sono già stati scartati da `parseLegame`.
 *
 * Una madre di servizio non duplica **mai** una madre vera. Le madri note si
 * seminano sia dalle tratte sia da `madri`, perché una madre può arrivare dal
 * consorzio senza nessuna tratta: nel mirror di agosto `getroggemadri` manda
 * `S02`, `getroggeorari/S` non ha tratte `S02`, e i legami live citano
 * `S02DA0002`. Seminando dalle sole tratte nasceva una seconda `S02`: su
 * PostgreSQL la chiave primaria faceva saltare il registro ogni notte, su
 * MemStorage la sovrascriveva in silenzio. L'invariante la regge questa
 * funzione e non un `dedupByKey` a valle, che coprirebbe una sua regressione.
 *
 * `nomi` porta i nomi veri del consorzio per queste madri e tratte, letti
 * dalla seconda gerarchia (rogge madri R) nello stesso giro di sync, *prima*
 * del registro: dove il consorzio conosce il codice il nome vero sostituisce
 * il ripiego o il codice nudo; dove non lo conosce (`R29`, `R34`…) resta
 * quello di prima. Se la gerarchia non è stata letta, il chiamante passa i
 * nomi rimasti in tabella dalla notte precedente — mai `NOMI_VUOTI` invece di
 * quelli veri, o un nome farebbe avanti e indietro da una notte all'altra.
 */
export function sintetizzaServizio(
  legami: LegameInsert[],
  tratte: TrattaInsert[],
  madri: MadreInsert[],
  nomi: NomiGerarchiaRogge = NOMI_VUOTI,
): SintesiServizio {
  const tratteNote: Record<string, true> = {};
  const madriNote: Record<string, true> = {};
  madri.forEach((m) => {
    madriNote[m.codice] = true;
  });
  tratte.forEach((t) => {
    tratteNote[t.keyroggia] = true;
    madriNote[t.codiceMadre] = true;
  });

  const nuoveTratte: TrattaInsert[] = [];
  const nuoveMadri: MadreInsert[] = [];

  legami.forEach((l) => {
    if (tratteNote[l.keyroggia]) return;
    const madre = prefissoMadre(l.keyroggia);
    if (madre === null) return; // già escluso da parseLegame: rete di sicurezza
    tratteNote[l.keyroggia] = true;
    // Il nome vero della gerarchia R quando c'è, il codice nudo altrimenti:
    // un nome inventato ("Tratta R29D10+++") sarebbe indistinguibile in
    // Storico da uno che viene davvero dal consorzio.
    nuoveTratte.push({ keyroggia: l.keyroggia, name: nomi.tratte[l.keyroggia] ?? l.keyroggia, codiceMadre: madre });
    if (madriNote[madre]) return;
    madriNote[madre] = true;
    nuoveMadri.push(madreDiServizio(madre, nomi.madri[madre]));
  });

  return { madri: nuoveMadri, tratte: nuoveTratte };
}
