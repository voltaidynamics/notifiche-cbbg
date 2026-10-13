import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { bounceApi, type EsitoLetturaBounce, type PatchConfigBounce } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { messaggioErrore } from "@/lib/messaggio-errore";
import { formatDateTime, scaricaCsv } from "@/components/dettaglio-notifica";
import { descriviBounce, type RigaBounce } from "@shared/bounce";
import { codiceNotifica } from "@shared/storico-notifiche";
import { AlertTriangle, Download, Loader2, RefreshCw } from "lucide-react";

const GIORNI_PREAVVISO = 30;

const CLASSI_ESITO = {
  verde: "bg-green-50 text-green-800 border-green-200",
  ambra: "bg-amber-50 text-amber-800 border-amber-200",
  rosso: "bg-red-50 text-red-700 border-red-200",
} as const;

type Bozza = {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  casella: string;
  secretScadenza: string;
  riepilogo: boolean;
  destinatari: string;
};

function Esito({ colore, children }: { colore: keyof typeof CLASSI_ESITO; children: React.ReactNode }) {
  return <div className={`text-sm rounded px-3 py-2 border ${CLASSI_ESITO[colore]}`}>{children}</div>;
}

function UltimaLettura({ esito }: { esito: EsitoLetturaBounce | null }) {
  if (!esito) return <p className="text-xs text-gray-500">Nessuna lettura eseguita finora.</p>;
  return (
    <Esito colore={esito.riuscita ? "verde" : "rosso"}>
      Ultima lettura {formatDateTime(esito.quando)}: {esito.messaggio}
    </Esito>
  );
}

function AvvisoScadenza({ giorni }: { giorni: number | null }) {
  if (giorni === null || giorni > GIORNI_PREAVVISO) return null;
  return (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex gap-2">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      {giorni < 0
        ? `Il client secret è scaduto da ${-giorni} ${giorni === -1 ? "giorno" : "giorni"}: la lettura non funziona finché non ne inserisci uno nuovo.`
        : `Il client secret scade fra ${giorni} ${giorni === 1 ? "giorno" : "giorni"}: generane uno nuovo in Entra ID e inseriscilo qui.`}
    </p>
  );
}

function ElencoBounce() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["bounce", "elenco"],
    queryFn: bounceApi.elenco,
    staleTime: 0,
  });

  const esporta = (righe: RigaBounce[]) =>
    scaricaCsv("mail_non_recapitate.csv", [
      ["Ricevuto", "Indirizzo", "Codice conduttore", "Conduttore", "Comunicazione", "Oggetto", "Motivo", "Codice", "Diagnostica"],
      ...righe.map((r) => [
        formatDateTime(r.ricevutoAt),
        r.destinatario,
        r.codiceConduttore,
        r.descrizioneConduttore,
        r.notificationId === null ? "" : codiceNotifica(r.notificationId),
        r.oggettoComunicazione,
        descriviBounce(null, r.tipo),
        r.codice,
        r.diagnostica,
      ]),
    ]);

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Mail non recapitate</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className="mr-1" />
            Aggiorna
          </Button>
          <Button variant="outline" size="sm" onClick={() => data && esporta(data)} disabled={!data || data.length === 0}>
            <Download size={14} className="mr-1" />
            Scarica CSV
          </Button>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Gli indirizzi restano nell'anagrafica del consorzio e continuano a ricevere le comunicazioni: questo
        elenco serve a farli correggere alla fonte.
      </p>
      {isLoading && <p className="text-sm text-gray-500">Carico…</p>}
      {isError && <Esito colore="rosso">{messaggioErrore(error)}</Esito>}
      {data && data.length === 0 && <p className="text-sm text-gray-400 py-4 text-center">Nessun bounce registrato.</p>}
      {data && data.length > 0 && (
        <div className="max-h-[400px] overflow-auto border rounded-lg">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {["Ricevuto", "Indirizzo", "Conduttore", "Comunicazione", "Motivo"].map((h) => (
                  <th key={h} className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.ricevutoAt)}</td>
                  <td className="px-3 py-2 break-all">{r.destinatario ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.codiceConduttore ? (
                      <>
                        <span className="font-mono text-xs">{r.codiceConduttore}</span>
                        <div>{r.descrizioneConduttore}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.notificationId === null ? (
                      <span className="text-gray-400">Non abbinata</span>
                    ) : (
                      <>
                        <span className="font-mono text-xs">{codiceNotifica(r.notificationId)}</span>
                        <div>{r.oggettoComunicazione}</div>
                        {/* Abbinata per indirizzo e non per Message-ID: è
                            l'ultima comunicazione spedita lì, probabilmente
                            quella giusta ma non garantito. */}
                        {r.abbinamento === "indirizzo" && (
                          <div className="text-[11px] text-amber-700">abbinata per indirizzo</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className={`px-3 py-2 ${r.tipo === "temporaneo" ? "text-gray-500" : "text-red-700"}`}>
                    {descriviBounce(r.codice, r.tipo)}
                    {r.diagnostica && <div className="text-[11px] text-gray-500 break-words">{r.diagnostica}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Lettura dei bounce dalla casella Microsoft 365 delle notifiche (issue #126).
 *
 * L'app registrata in Entra ID dal consorzio ha il solo permesso Mail.Read,
 * ristretto a quella casella: qui si inseriscono le sue credenziali. Il secret
 * non torna mai indietro dal server; lasciato vuoto, resta quello salvato.
 */
export function SchedaBounce() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [esitoProva, setEsitoProva] = useState<{ riuscita: boolean; messaggio: string } | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["settings", "bounce"],
    queryFn: bounceApi.get,
  });

  // Popola i campi solo la prima volta, come SchedaAd: il refetch dopo un
  // Salva non deve cancellare una modifica fatta mentre era in volo.
  const inizializzato = useRef(false);
  useEffect(() => {
    if (data === undefined || inizializzato.current) return;
    inizializzato.current = true;
    setBozza({
      enabled: data.enabled,
      tenantId: data.tenantId,
      clientId: data.clientId,
      clientSecret: "",
      casella: data.casella,
      secretScadenza: data.secretScadenza,
      riepilogo: data.riepilogo,
      destinatari: data.destinatari.join(", "),
    });
  }, [data]);

  const salva = useMutation({
    mutationFn: (p: PatchConfigBounce) => bounceApi.save(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "bounce"] });
      setBozza((b) => (b ? { ...b, clientSecret: "" } : b));
      toast({ title: "Configurazione salvata" });
    },
    onError: (err: Error) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const prova = useMutation({
    mutationFn: bounceApi.test,
    onSuccess: (e) => setEsitoProva(e),
    onError: (err) => setEsitoProva({ riuscita: false, messaggio: messaggioErrore(err) }),
  });

  const leggiOra = useMutation({
    mutationFn: bounceApi.leggiOra,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "bounce"] });
      queryClient.invalidateQueries({ queryKey: ["bounce", "elenco"] });
      // Un bounce cambia l'esito di una mail nello Storico.
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/storico/dettaglio"] });
    },
    onError: (err: Error) => toast({ title: "Lettura non eseguita", description: err.message, variant: "destructive" }),
  });

  const riepilogoProva = useMutation({
    mutationFn: bounceApi.riepilogoProva,
    onSuccess: (r) => toast({ title: r.message }),
    onError: (err: Error) => toast({ title: "Riepilogo non inviato", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-gray-500 py-6">Carico…</p>;

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm rounded px-3 py-2 bg-red-50 text-red-700 border border-red-200">
        <span>Non riesco a leggere la configurazione: {messaggioErrore(error)}</span>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw size={14} className="mr-1" />
          Riprova
        </Button>
      </div>
    );
  }

  if (!bozza || !data) return <p className="text-sm text-gray-500 py-6">Carico…</p>;

  const b = bozza;
  const set = (patch: Partial<Bozza>) => {
    setBozza({ ...b, ...patch });
    setEsitoProva(null);
  };

  const casella = b.casella.trim().toLowerCase();
  const mittente = data.mittenteEmail.trim().toLowerCase();

  const handleSalva = () =>
    salva.mutate({
      enabled: b.enabled,
      tenantId: b.tenantId,
      clientId: b.clientId,
      clientSecret: b.clientSecret,
      casella: b.casella,
      secretScadenza: b.secretScadenza,
      riepilogo: b.riepilogo,
      destinatari: b.destinatari,
    });

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        L'app legge, in sola lettura, la casella Microsoft 365 da cui partono le notifiche e ci cerca le mail tornate
        indietro (indirizzo inesistente, casella piena, rifiuto per spam). Ogni 10 minuti, se attiva. Una mail tornata
        indietro compare come «Non recapitata» nel dettaglio dello Storico.
      </p>

      <div className="flex items-center gap-2">
        <Switch checked={b.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        <Label>Lettura dei bounce attiva</Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Tenant ID (Directory ID)</Label>
          <Input value={b.tenantId} placeholder="xxxxxxxx-xxxx-…" onChange={(e) => set({ tenantId: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Client ID (Application ID)</Label>
          <Input value={b.clientId} placeholder="xxxxxxxx-xxxx-…" onChange={(e) => set({ clientId: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label>Client secret (colonna «Value»)</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={b.clientSecret}
            placeholder={data.secretImpostato ? "•••••••• impostato — lascia vuoto per non cambiarlo" : "Non impostato"}
            onChange={(e) => set({ clientSecret: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Scadenza del client secret</Label>
          <Input type="date" value={b.secretScadenza} onChange={(e) => set({ secretScadenza: e.target.value })} />
          <p className="text-xs text-gray-500">
            Quella scelta in Entra ID alla creazione: l'app non la può leggere da Microsoft. Serve ad avvisare un mese
            prima.
          </p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Casella da leggere</Label>
          <Input value={b.casella} placeholder="notifiche@cbbg.it" onChange={(e) => set({ casella: e.target.value })} />
          {casella !== "" && mittente !== "" && casella !== mittente && (
            <p className="text-xs text-amber-800">
              Le notifiche partono da <b>{data.mittenteEmail}</b> (scheda Email): i bounce tornano lì, non a {casella}.
            </p>
          )}
        </div>
      </div>

      <AvvisoScadenza giorni={data.giorniAllaScadenza} />

      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <Switch checked={b.riepilogo} onCheckedChange={(v) => set({ riepilogo: v })} />
          <Label>Riepilogo via email, ogni mattina alle 7</Label>
        </div>
        <p className="text-xs text-gray-500">
          Parte solo se c'è qualcosa da dire: mail non recapitate dal riepilogo precedente, una lettura della casella
          che non funziona, il secret vicino alla scadenza.
        </p>
        <div className="space-y-1">
          <Label>Destinatari del riepilogo</Label>
          <Textarea
            rows={2}
            value={b.destinatari}
            placeholder="uno o più indirizzi, separati da virgola"
            onChange={(e) => set({ destinatari: e.target.value })}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => riepilogoProva.mutate()} disabled={riepilogoProva.isPending}>
          {riepilogoProva.isPending && <Loader2 className="mr-2 animate-spin" size={14} />}
          Invia un riepilogo di prova
        </Button>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSalva} disabled={salva.isPending}>
          {salva.isPending ? "Salvo…" : "Salva"}
        </Button>
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-medium">Prova e lettura</p>
        <p className="text-xs text-gray-500">
          Usano la configurazione già salvata, anche con l'interruttore spento. «Prova accesso» chiede il token e
          legge l'elenco dei messaggi, senza registrare niente; «Leggi ora» esegue subito una lettura vera.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => prova.mutate()} disabled={prova.isPending}>
            {prova.isPending && <Loader2 className="mr-2 animate-spin" size={14} />}
            Prova accesso
          </Button>
          <Button variant="outline" onClick={() => leggiOra.mutate()} disabled={leggiOra.isPending}>
            {leggiOra.isPending && <Loader2 className="mr-2 animate-spin" size={14} />}
            Leggi ora
          </Button>
        </div>
        {esitoProva && <Esito colore={esitoProva.riuscita ? "verde" : "rosso"}>{esitoProva.messaggio}</Esito>}
        <UltimaLettura esito={data.ultimoEsito} />
      </div>

      <ElencoBounce />
    </div>
  );
}
