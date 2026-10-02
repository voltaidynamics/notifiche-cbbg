import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adSettingsApi, type EsitoBindAd, type EsitoProvaAd, type PatchConfigAd } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

const TIMEOUT_MIN = 1000;
const TIMEOUT_MAX = 60000;
const PERCORSO_GETUSERAD = "/RestTabelle/RestTabelle.svc/getuserAD";

const CLASSI_ESITO: Record<"verde" | "ambra" | "rosso", string> = {
  verde: "bg-green-50 text-green-800 border-green-200",
  ambra: "bg-amber-50 text-amber-800 border-amber-200",
  rosso: "bg-red-50 text-red-700 border-red-200",
};

// `EsitoBindAd` è un'unione chiusa (mirror di `EsitoAd` lato server): se un
// domani si aggiunge un caso, il `never` fa fallire la build qui.
function messaggioVerifica(v: EsitoBindAd): { testo: string; colore: "verde" | "rosso" } {
  switch (v.esito) {
    case "ok":
      return { testo: "Le tue credenziali sono state accettate.", colore: "verde" };
    case "credenzialiNonValide":
      return { testo: "Le tue credenziali sono state rifiutate.", colore: "rosso" };
    case "nonRaggiungibile":
      return { testo: `Verifica delle tue credenziali non completata: ${v.dettaglio}`, colore: "rosso" };
    default: {
      const esaustivo: never = v;
      return esaustivo;
    }
  }
}

type Bozza = { enabled: boolean; url: string; timeoutTesto: string };

/**
 * Configurazione di Active Directory (issue #96).
 *
 * Il bind lo fa il web service del consorzio, endpoint `getuserAD`: qui si
 * sceglie solo dove chiamarlo. Riservata al superadmin, perché chi sceglie
 * l'URL decide dove vanno le password di dominio del personale.
 */
export function SchedaAd() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [provaUsername, setProvaUsername] = useState("");
  const [provaPassword, setProvaPassword] = useState("");
  const [esito, setEsito] = useState<EsitoProvaAd | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["settings", "ad"],
    queryFn: adSettingsApi.get,
  });

  // Popola i campi solo la prima volta: il refetch dopo un Salva non deve
  // cancellare una modifica fatta mentre era in volo (stesso schema di SchedaWs).
  const inizializzato = useRef(false);
  useEffect(() => {
    if (data === undefined || inizializzato.current) return;
    inizializzato.current = true;
    setBozza({ enabled: data.enabled, url: data.url, timeoutTesto: String(data.timeoutMs) });
  }, [data]);

  const salva = useMutation({
    mutationFn: (p: PatchConfigAd) => adSettingsApi.save(p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings", "ad"] });
      toast({ title: "Configurazione salvata" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Errore", variant: "destructive" }),
  });

  const prova = useMutation({
    mutationFn: () =>
      adSettingsApi.test(
        provaUsername.trim() === "" ? undefined : { username: provaUsername, password: provaPassword },
      ),
    onSuccess: (e) => setEsito(e),
    onError: (err: any) => setEsito({ riuscita: false, messaggio: err.message ?? "Errore" }),
  });

  if (isLoading) return <p className="text-sm text-gray-500 py-6">Carico…</p>;

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm rounded px-3 py-2 bg-red-50 text-red-700 border border-red-200">
        <span>
          Non riesco a leggere la configurazione:{" "}
          {(error as Error)?.message ?? "errore sconosciuto"}.
        </span>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw size={14} className="mr-1" />
          Riprova
        </Button>
      </div>
    );
  }

  if (!bozza || !data) return <p className="text-sm text-gray-500 py-6">Carico…</p>;

  const b = bozza;
  // Cambiare un campo cancella l'esito della prova: la prova usa la
  // configurazione salvata, e un verdetto vecchio accanto a valori nuovi si
  // leggerebbe come riferito a loro.
  const set = (patch: Partial<Bozza>) => {
    setBozza({ ...b, ...patch });
    setEsito(null);
  };

  const urlScritto = b.url.trim();
  const urlValido = urlScritto === "" || /^https?:\/\//i.test(urlScritto);
  const timeout = parseInt(b.timeoutTesto, 10);
  const timeoutValido =
    b.timeoutTesto.trim() !== "" && !Number.isNaN(timeout) && timeout >= TIMEOUT_MIN && timeout <= TIMEOUT_MAX;
  // L'URL che verrebbe chiamato con quanto scritto ora: quello del campo, o il
  // predefinito da ws.base che il server ha già calcolato.
  const urlInUso = urlScritto !== "" ? urlScritto : data.urlDerivato ? data.urlEffettivo : "";

  const handleSalva = () => {
    if (!urlValido) {
      toast({ title: "URL non valido", description: "Deve iniziare con http:// o https://.", variant: "destructive" });
      return;
    }
    if (!timeoutValido) {
      toast({
        title: "Timeout non valido",
        description: `Deve essere un numero tra ${TIMEOUT_MIN} e ${TIMEOUT_MAX} millisecondi.`,
        variant: "destructive",
      });
      return;
    }
    salva.mutate({ enabled: b.enabled, url: urlScritto, timeoutMs: timeout });
  };

  const infoVerifica = esito?.verifica ? messaggioVerifica(esito.verifica) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Switch checked={b.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        <Label>Autenticazione Active Directory attiva</Label>
      </div>

      <div className="space-y-1">
        <Label>URL dell'endpoint di verifica</Label>
        <Input
          value={b.url}
          placeholder={data.urlDerivato ? data.urlEffettivo : `http://…${PERCORSO_GETUSERAD}`}
          onChange={(e) => set({ url: e.target.value })}
        />
        {!urlValido && <p className="text-xs text-red-600">Deve iniziare con http:// o https://.</p>}
        {urlScritto === "" && data.urlDerivato && (
          <p className="text-xs text-gray-500">
            Vuoto: si usa l'indirizzo base del WebService più <code>{PERCORSO_GETUSERAD}</code>.
          </p>
        )}
        {urlScritto === "" && !data.urlDerivato && (
          <p className="text-xs text-amber-800">
            Nessun URL: scrivilo qui, oppure imposta l'indirizzo base nella scheda WebService.
          </p>
        )}
        <p className="text-xs text-gray-500">
          L'app chiama <code>URL/username/password</code> e si aspetta{" "}
          <code>[{"{"}"status":true{"}"}]</code> o <code>[{"{"}"status":false{"}"}]</code>, con la
          stessa autorizzazione del WebService. Stando nel percorso, la password finisce nei log di
          accesso del web service del consorzio.
        </p>
      </div>

      {urlInUso.toLowerCase().startsWith("http://") && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex gap-2">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          L'endpoint è in http://: username e password di dominio del personale viaggiano in chiaro
          sulla rete fino al web service del consorzio.
        </p>
      )}

      <div className="space-y-1 max-w-xs">
        <Label>Timeout (millisecondi)</Label>
        <Input
          type="number"
          min={TIMEOUT_MIN}
          max={TIMEOUT_MAX}
          value={b.timeoutTesto}
          onChange={(e) => set({ timeoutTesto: e.target.value })}
        />
        {!timeoutValido && (
          <p className="text-xs text-red-600">
            Numero tra {TIMEOUT_MIN} e {TIMEOUT_MAX}.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSalva} disabled={salva.isPending}>
          {salva.isPending ? "Salvo…" : "Salva"}
        </Button>
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="text-sm font-medium">Prova endpoint</p>
        <p className="text-xs text-gray-500">
          Chiama l'endpoint con credenziali inventate e controlla che risponda «false». Se aggiungi
          le tue credenziali di dominio, prova anche quelle: non vengono salvate.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder="Username di dominio (facoltativo)"
            value={provaUsername}
            onChange={(e) => setProvaUsername(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Password"
            value={provaPassword}
            onChange={(e) => setProvaPassword(e.target.value)}
          />
        </div>
        <Button variant="outline" onClick={() => prova.mutate()} disabled={prova.isPending}>
          {prova.isPending ? <Loader2 className="mr-2 animate-spin" size={14} /> : null}
          Prova endpoint
        </Button>
        <p className="text-xs text-gray-500">
          La prova usa la configurazione già salvata, anche con l'interruttore spento: se hai
          modificato l'URL o il timeout, salva prima di premere il pulsante.
        </p>
        {esito && (
          <div className="space-y-2">
            <div className={`text-sm rounded px-3 py-2 border ${CLASSI_ESITO[esito.riuscita ? "verde" : "rosso"]}`}>
              {esito.messaggio}
            </div>
            {infoVerifica && (
              <div className={`text-sm rounded px-3 py-2 border ${CLASSI_ESITO[infoVerifica.colore]}`}>
                {infoVerifica.testo}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
