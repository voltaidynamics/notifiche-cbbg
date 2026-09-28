import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { syncApi } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { descriviFreschezza, type Freschezza } from "@/lib/freschezza-anagrafiche";
import type { StatoSync } from "@shared/schema";

/**
 * Il caricamento "on demand" delle anagrafiche del consorzio (issue #8).
 *
 * Il sync NON parte mai da solo: gira una volta a notte (cron in
 * server/scheduler.ts) e, per il resto, solo quando l'operatore lo chiede.
 * Questo hook raccoglie tutto ciò che serve a offrire quell'opzione — stato,
 * avvio, ricarico delle tabelle a fine corsa — così le pagine che la offrono
 * (Anagrafiche e Invia notifica) si comportano allo stesso modo invece di
 * reimplementarla ognuna a modo suo.
 */

/** Le tabelle che rispecchiano i dati del consorzio: da ricaricare a sync finito. */
const CHIAVI_ANAGRAFICHE: QueryKey[] = [
  ["/api/anagrafiche/rogge"],
  ["/api/anagrafiche/destinatari"],
  ["/api/anagrafiche/legami"],
  // Seconda gerarchia (issue #49, Rilievo 3): senza questa chiave la scheda
  // «Rogge madri» non si ricaricava a sync concluso — le altre quattro sì —
  // e sembrava che la gerarchia non fosse mai stata letta anche quando lo era.
  ["/api/anagrafiche/rogge-madri"],
];

export type UsoSyncAnagrafiche = {
  stato: StatoSync | undefined;
  inCorso: boolean;
  /** Ultimo sync riuscito o parziale: la fonte della data "dati aggiornati al…". */
  ultimoCompletato: StatoSync["ultimoCompletato"];
  /** Il tentativo più recente qualunque sia l'esito: la fonte di conteggi ed errori. */
  ultimoTentativo: StatoSync["ultimo"];
  freschezza: Freschezza;
  avvia: () => void;
  avvioInCorso: boolean;
};

/**
 * La sola lettura dello stato, senza avvio né invalidazioni.
 *
 * Serve all'header (issue #13): la data dell'ultimo aggiornamento sta in cima a
 * ogni sezione, comprese quelle che col sync non c'entrano nulla, e lì non deve
 * arrivare anche il resto del macchinario. La query è la stessa, quindi le due
 * varianti condividono cache e refetch invece di interrogare il server due volte.
 */
export function useStatoAnagrafiche() {
  const { data: stato } = useQuery({
    queryKey: ["/api/sync/status"],
    queryFn: () => syncApi.stato(),
    // Mentre il sync gira, ricontrolla ogni 3 secondi; a riposo, ogni 60.
    refetchInterval: (query) => (query.state.data?.inCorso ? 3000 : 60000),
  });

  const ultimoCompletato = stato?.ultimoCompletato ?? null;

  return {
    stato,
    inCorso: stato?.inCorso ?? false,
    ultimoCompletato,
    ultimoTentativo: stato?.ultimo ?? null,
    freschezza: descriviFreschezza(ultimoCompletato, new Date()),
  };
}

export function useSyncAnagrafiche(chiaviExtra: QueryKey[] = []): UsoSyncAnagrafiche {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const lettura = useStatoAnagrafiche();
  const { stato } = lettura;

  const mutazione = useMutation({
    mutationFn: () => syncApi.avvia(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sync/status"] });
      toast({ title: "Sincronizzazione avviata", description: "L'aggiornamento dei dati è in corso." });
    },
    onError: (e: Error) => {
      toast({ title: "Sincronizzazione non avviata", description: e.message, variant: "destructive" });
    },
  });

  // A sync concluso, ricarica le tabelle che ne dipendono. Non usiamo una
  // useQuery fittizia per questo effetto collaterale (staleTime: Infinity sarebbe
  // fragile e useQuery serve a leggere dati, non a invalidarne altri): un
  // useEffect ancorato all'id dell'ultimo sync completato è più diretto.
  //
  // Il discriminante di "prima osservazione" è se la query di stato ha già
  // risposto almeno una volta (stato !== undefined), non se l'id osservato è
  // nullo: in questa installazione il DB parte senza alcun sync registrato, per
  // cui il primo sync in assoluto produce proprio una transizione null -> id, e
  // deve invalidare le tabelle esattamente come ogni transizione successiva.
  // idPrecedenteRef resta alla sentinella `undefined` finché l'effetto non ha
  // mai girato con uno `stato` risolto; da quel momento contiene sempre
  // l'ultimo id osservato (numero o null).
  const idPrecedenteRef = useRef<number | null | undefined>(undefined);
  // Le chiavi extra arrivano come array nuovo a ogni render: tenerle in una ref
  // evita di rieseguire l'effetto (e quindi di invalidare) a ogni render del
  // chiamante, senza costringerlo a memoizzarle.
  const chiaviExtraRef = useRef(chiaviExtra);
  chiaviExtraRef.current = chiaviExtra;

  useEffect(() => {
    if (stato === undefined) return; // query di stato non ancora risolta: non è un'osservazione
    const idCorrente = stato.ultimoCompletato?.id ?? null;
    const precedente = idPrecedenteRef.current;
    idPrecedenteRef.current = idCorrente;
    if (precedente === undefined) return; // prima osservazione reale: non invalidare nulla
    if (precedente !== idCorrente) {
      for (const queryKey of [...CHIAVI_ANAGRAFICHE, ...chiaviExtraRef.current]) {
        queryClient.invalidateQueries({ queryKey });
      }
    }
  }, [stato, queryClient]);

  return {
    ...lettura,
    avvia: () => mutazione.mutate(),
    avvioInCorso: mutazione.isPending,
  };
}
