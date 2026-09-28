import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import DataTable from "@/components/data-table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSyncAnagrafiche } from "@/hooks/use-sync-anagrafiche";
import { cn } from "@/lib/utils";
import { AlertTriangle } from "lucide-react";
import { anagraficheApi, consorzioApi } from "@/lib/api";
import type { Colonna } from "@/lib/data-table";
import type { RigaRoggia, RigaRoggiaMadre, RigaDestinatario, RigaLegame } from "@shared/schema";
import { analizzaArray, analizzaConteggi, riassumiConteggi } from "@shared/esito-sync";
import { formattaQuando } from "@/lib/freschezza-anagrafiche";
import { risolviStato, ETICHETTE_STATO } from "@shared/stato-rogge";
import { TRATTINO } from "@shared/righe-anagrafiche";

// Lo stato non arriva dal mirror — lì non esiste — ma dalla rotta degli eventi
// (issue #22). Sta come campo della riga e non come cella calcolata perché
// DataTable filtra e ordina sui campi: una colonna che non si può filtrare, in
// una tabella dove tutte le altre si filtrano, si legge come rotta.
type RigaRoggiaConStato = RigaRoggia & { stato: string };

// La scheda si chiamava «Rogge» ma elenca le tratte di tutti gli impianti:
// rinominata con le sue prime due colonne su richiesta del consorzio (24/09/2026).
const COLONNE_IMPIANTI: Colonna<RigaRoggiaConStato>[] = [
  { chiave: "codiceMadre", etichetta: "Codice impianto" },
  { chiave: "descrizioneMadre", etichetta: "Descrizione impianto" },
  { chiave: "codiceFiglia", etichetta: "Codice roggia figlia" },
  { chiave: "descrizioneFiglia", etichetta: "Descrizione roggia figlia" },
  { chiave: "stato", etichetta: "Stato" },
];

const COLONNE_ROGGE_MADRI: Colonna<RigaRoggiaConStato>[] = [
  { chiave: "codiceMadre", etichetta: "Codice madre" },
  { chiave: "descrizioneMadre", etichetta: "Descrizione madre" },
  { chiave: "codiceFiglia", etichetta: "Codice roggia figlia" },
  { chiave: "descrizioneFiglia", etichetta: "Descrizione roggia figlia" },
  { chiave: "stato", etichetta: "Stato" },
];

const COLONNE_DESTINATARI: Colonna<RigaDestinatario>[] = [
  { chiave: "codice", etichetta: "Codice destinatario" },
  { chiave: "descrizione", etichetta: "Descrizione destinatario" },
  { chiave: "numero", etichetta: "Numero" },
  { chiave: "mail", etichetta: "Mail" },
];

const COLONNE_LEGAMI: Colonna<RigaLegame>[] = [
  { chiave: "codiceDestinatario", etichetta: "Codice destinatario" },
  { chiave: "descrizioneDestinatario", etichetta: "Descrizione destinatario" },
  { chiave: "codiceFiglia", etichetta: "Codice roggia figlia" },
  { chiave: "descrizioneFiglia", etichetta: "Descrizione roggia figlia" },
];

export default function Anagrafiche() {
  const isMobile = useIsMobile();

  // Stato, avvio on demand e ricarico delle tabelle a sync concluso stanno
  // nell'hook, condiviso con la pagina di invio (issue #8).
  const sync = useSyncAnagrafiche();

  const { data: rogge = [], isLoading: caricaRogge } = useQuery({
    queryKey: ["/api/anagrafiche/rogge"],
    queryFn: () => anagraficheApi.getRogge(),
  });
  const { data: destinatari = [], isLoading: caricaDestinatari } = useQuery({
    queryKey: ["/api/anagrafiche/destinatari"],
    queryFn: () => anagraficheApi.getDestinatari(),
  });
  const { data: legamiLive = [], isLoading: caricaLive } = useQuery({
    queryKey: ["/api/anagrafiche/legami", "live"],
    queryFn: () => anagraficheApi.getLegami("live"),
  });
  const { data: legamiStagione = [], isLoading: caricaStagione } = useQuery({
    queryKey: ["/api/anagrafiche/legami", "stagione"],
    queryFn: () => anagraficheApi.getLegami("stagione"),
  });

  // Seconda gerarchia (issue #49): le coppie roggia madre R → figlia.
  const { data: roggeMadri = [], isLoading: caricaRoggeMadri } = useQuery({
    queryKey: ["/api/anagrafiche/rogge-madri"],
    queryFn: () => anagraficheApi.getRoggeMadri(),
  });

  const { data: statoRogge } = useQuery({
    queryKey: ["/api/consorzio/stato-rogge"],
    queryFn: () => consorzioApi.getStatoRogge(),
  });

  // La figlia eredita dalla madre quando non ha eventi propri: chiudere un
  // pozzo chiude le sue tratte (issue #22).
  const righeRogge: RigaRoggiaConStato[] = rogge.map((r) => ({
    ...r,
    stato: ETICHETTE_STATO[risolviStato(r.codiceFiglia, "tratta", statoRogge?.stati ?? [], r.codiceMadre).stato],
  }));

  // La figlia eredita dall'impianto che la rivendica, non dalla roggia madre
  // R con cui si seleziona: chiudere il pozzo IM27A deve mostrare chiuse le
  // sue tratte anche guardandole da questa scheda (Rilievo 2 — prima si
  // passava `null` e una tratta chiusa solo per via del suo impianto
  // risultava "Aperta" qui mentre "Rogge" e Invia notifica, sugli stessi
  // dati, dicevano "Chiusa").
  //
  // La riga di una madre senza figlie ha la figlia «-»: non c'è una tratta di
  // cui dire lo stato, e «Aperta» su un trattino sarebbe un dato inventato.
  const righeRoggeMadri: RigaRoggiaConStato[] = roggeMadri.map((r) => ({
    codiceMadre: r.codiceMadre,
    descrizioneMadre: r.descrizioneMadre,
    codiceFiglia: r.codiceFiglia,
    descrizioneFiglia: r.descrizioneFiglia,
    stato: r.codiceFiglia === TRATTINO ? TRATTINO : ETICHETTE_STATO[
      risolviStato(r.codiceFiglia, "tratta", statoRogge?.stati ?? [], r.codiceMadreImpianto).stato
    ],
  }));

  // `ultimoTentativo` è il sync più recente qualunque sia il suo esito: è la
  // fonte di conteggi/errori/entità saltate. Con `ultimoCompletato` (che esclude
  // i falliti) un sync andato male — tipicamente perché nessuna sorgente è
  // configurata, lo stato attuale della produzione — non produrrebbe alcun
  // segnale a schermo, e l'informazione salvata a database non arriverebbe mai
  // all'utente proprio nel caso per cui è stata scritta.
  const { inCorso, ultimoTentativo } = sync;

  // Lettura dei campi JSON e etichette dei conteggi da `shared/esito-sync.ts`,
  // le stesse dell'email di riepilogo e di Impostazioni: una copia locale
  // mostrava a schermo le chiavi grezze («tratteScartate: 373»). Le chiavi dei
  // log precedenti al modello madri/tratte/legami ripiegano sulla chiave stessa.
  //
  // Errori ed entità saltate hanno la stessa forma ma restano due campi: chi
  // legge deve poter distinguere «queste entità non sono mai state
  // configurate» da un guasto di sincronizzazione.
  const errori = analizzaArray(ultimoTentativo?.errors);
  const saltate = analizzaArray(ultimoTentativo?.skippedEntities);
  const conteggi = analizzaConteggi(ultimoTentativo?.entityCounts);

  // Un caricamento in corso non è un problema: mentre gira, i suoi esiti
  // parziali riguardano la corsa precedente e il riquadro tacerebbe a sproposito.
  const problemiDaSegnalare =
    !inCorso &&
    (errori.length > 0 ||
      saltate.length > 0 ||
      ultimoTentativo?.status === "failed" ||
      ultimoTentativo?.status === "partial");

  return (
    <div className={cn("flex h-screen bg-gray-50", isMobile && "flex-col")}>
      <Sidebar />
      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-16 pb-20")}>
        <PageHeader title="Anagrafiche" subtitle="Dati del consorzio caricati a sistema" />

        <div className={isMobile ? "p-4" : "p-6"}>
          {/* La data dell'ultimo aggiornamento e l'avviso "in corso" sono
              nell'header di ogni sezione (issue #13), quindi qui non si
              ripetono. Resta solo il riquadro dei guai: entità mai caricate,
              sincronizzazioni parziali, errori dell'ultimo tentativo. Sono
              informazioni che l'header non può contenere e che, se sparissero,
              lascerebbero senza spiegazione una tabella vuota. */}
          {problemiDaSegnalare && (
            <Card className="mb-5 border-amber-300">
              <CardContent className="p-5 text-sm">
                {ultimoTentativo?.status === "partial" && (
                  <div className="text-xs text-amber-700 flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Ultimo caricamento parziale — {riassumiConteggi(conteggi) || "nessun dato"}
                  </div>
                )}
                {ultimoTentativo?.status === "failed" && (
                  <div className="text-xs text-red-700 font-semibold">
                    L'ultimo tentativo di caricamento ({formattaQuando(ultimoTentativo?.finishedAt)}) non è riuscito:
                  </div>
                )}
                {errori.length > 0 && (
                  <ul className="text-xs text-red-600 mt-1 space-y-0.5">
                    {errori.map((e) => (
                      <li key={e} className="flex items-start gap-1">
                        <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />{e}
                      </li>
                    ))}
                  </ul>
                )}
                {saltate.length > 0 && (
                  <div className="text-xs text-amber-700 mt-1">
                    Non configurate, mai caricate: {saltate.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Le cinque tabelle */}
          <Tabs defaultValue="rogge" className="w-full">
            {/* Una griglia a percentuali fisse (`grid-cols-5`) comprime ogni
                cella a `minmax(0,1fr)`: il bottone, `whitespace-nowrap` e senza
                `truncate` nel componente shadcn, non si stringe con lei, e fra
                640 e ~900px "Legame Stagione Irrigua" arriva a sovrapporsi alla
                scheda vicina. Nemmeno la riga che scorre in orizzontale andava:
                col `justify-center` di shadcn il contenuto più largo della
                barra trabocca da **entrambi** i lati, e su un telefono
                «Impianti» finiva a x = -80, dove lo scroll non arriva (issue
                #41). Qui la barra va a capo: `h-auto` al posto dell'altezza
                fissa, `justify-start`, e ogni bottone resta della sua
                larghezza naturale su una riga nuova quando non ci sta. */}
            <TabsList className={cn("flex flex-wrap h-auto justify-start gap-1 w-full sm:w-auto sm:inline-flex", isMobile ? "mb-4" : "mb-6")}>
              <TabsTrigger value="rogge">Impianti</TabsTrigger>
              <TabsTrigger value="rogge-madri">Rogge madri</TabsTrigger>
              <TabsTrigger value="destinatari">Destinatari</TabsTrigger>
              <TabsTrigger value="live">Legame Live</TabsTrigger>
              <TabsTrigger value="stagione">Legame Stagione Irrigua</TabsTrigger>
            </TabsList>

            <TabsContent value="rogge">
              <Card><CardContent className="p-5">
                <DataTable
                  righe={righeRogge}
                  colonne={COLONNE_IMPIANTI}
                  chiaveRiga={(r) => r.codiceFiglia}
                  caricamento={caricaRogge}
                  messaggioVuoto="Nessun impianto caricato. Lancia un aggiornamento dati."
                />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="rogge-madri">
              <Card><CardContent className="p-5">
                <DataTable
                  righe={righeRoggeMadri}
                  colonne={COLONNE_ROGGE_MADRI}
                  // Non il solo codice figlia: le madri senza figlie hanno tutte «-».
                  chiaveRiga={(r) => `${r.codiceMadre}|${r.codiceFiglia}`}
                  caricamento={caricaRoggeMadri}
                  messaggioVuoto="Nessuna roggia madre caricata. Lancia un aggiornamento dati."
                />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="destinatari">
              <Card><CardContent className="p-5">
                <DataTable
                  righe={destinatari}
                  colonne={COLONNE_DESTINATARI}
                  chiaveRiga={(r) => r.codice}
                  caricamento={caricaDestinatari}
                  messaggioVuoto="Nessun destinatario caricato. Lancia un aggiornamento dati."
                />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="live">
              <Card><CardContent className="p-5">
                <DataTable
                  righe={legamiLive}
                  colonne={COLONNE_LEGAMI}
                  chiaveRiga={(r, i) => `${r.codiceDestinatario}|${r.codiceFiglia}|${i}`}
                  caricamento={caricaLive}
                  messaggioVuoto="Nessun legame live caricato. Lancia un aggiornamento dati."
                />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="stagione">
              <Card><CardContent className="p-5">
                <DataTable
                  righe={legamiStagione}
                  colonne={COLONNE_LEGAMI}
                  chiaveRiga={(r, i) => `${r.codiceDestinatario}|${r.codiceFiglia}|${i}`}
                  caricamento={caricaStagione}
                  messaggioVuoto="Nessun legame stagione irrigua caricato. Lancia un aggiornamento dati."
                />
              </CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
}
