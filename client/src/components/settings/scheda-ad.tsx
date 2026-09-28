import { useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adSettingsApi, type ConfigAd, type EsitoBindAd, type EsitoProvaAd } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

const PORTA_MIN = 1;
const PORTA_MAX = 65535;
const TIMEOUT_MIN = 1000;
const TIMEOUT_MAX = 60000;

// Colori dell'esito del bind, tenuti distinti da quelli della raggiungibilità:
// un server raggiungibile con credenziali sbagliate deve leggersi come "il
// server risponde, le credenziali no", non come una contraddizione fra un
// riquadro verde e la parola "fallita" dentro.
const CLASSI_ESITO: Record<"verde" | "ambra" | "rosso", string> = {
  verde: "bg-green-50 text-green-800 border-green-200",
  ambra: "bg-amber-50 text-amber-800 border-amber-200",
  rosso: "bg-red-50 text-red-700 border-red-200",
};

// `EsitoBindAd` è un'unione chiusa (mirror di `EsitoAd` in server/ad/verificatore.ts):
// lo switch con `never` nel default fa sì che, se un domani si aggiunge un
// settimo caso lato server, qui manchi un ramo e il compilatore lo segnali,
// invece di far ricadere tutto in un confronto di stringhe silenzioso.
function messaggioBind(bind: EsitoBindAd): { testo: string; colore: "verde" | "ambra" | "rosso" } {
  switch (bind.esito) {
    case "ok":
      return { testo: "Autenticazione riuscita.", colore: "verde" };
    case "credenzialiNonValide":
      return { testo: "Autenticazione fallita: credenziali non valide.", colore: "rosso" };
    case "passwordScaduta":
      return { testo: "Autenticazione fallita: la password è scaduta e va cambiata.", colore: "ambra" };
    case "accountDisabilitato":
      return { testo: "Autenticazione fallita: l'account è disabilitato.", colore: "ambra" };
    case "accountBloccato":
      return { testo: "Autenticazione fallita: l'account è bloccato.", colore: "ambra" };
    case "nonRaggiungibile":
      return {
        testo: `Non è stato possibile completare l'autenticazione: ${bind.dettaglio}`,
        colore: "rosso",
      };
    default: {
      const esaustivo: never = bind;
      return esaustivo;
    }
  }
}

/**
 * Configurazione di Active Directory.
 *
 * Host, porta, suffisso di dominio e certificato della CA interna sono i quattro
 * dati che i sistemisti del consorzio ci daranno in sede: si inseriscono da qui,
 * senza un deploy e senza toccare `.env`. Con la macchina di sviluppo che non
 * vedrà mai il loro domain controller, il bottone «Prova connessione» è lo
 * strumento diagnostico principale del collaudo.
 */
export function SchedaAd() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<ConfigAd | null>(null);
  // Porta e timeout si tengono come testo libero mentre si scrive: un `|| 636`
  // sul valore numerico riempirebbe da solo il campo appena svuotato, prima
  // che arrivi la prima cifra della porta nuova. Si convalidano solo al Salva.
  const [portaTesto, setPortaTesto] = useState("");
  const [timeoutTesto, setTimeoutTesto] = useState("");
  const [provaUsername, setProvaUsername] = useState("");
  const [provaPassword, setProvaPassword] = useState("");
  const [esito, setEsito] = useState<EsitoProvaAd | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["settings", "ad"],
    queryFn: adSettingsApi.get,
  });

  // Popola i campi la prima volta che arrivano i dati dal server, senza
  // sovrascrivere quanto l'utente ha eventualmente già digitato nel frattempo:
  // il Salva invalida la query e il refetch che ne segue non deve cancellare
  // in silenzio una modifica fatta mentre era in volo. Stesso schema di
  // `SchedaWs` più sopra in questo file.
  const inizializzato = useRef(false);
  useEffect(() => {
    if (data === undefined || inizializzato.current) return;
    inizializzato.current = true;
    setForm(data);
    setPortaTesto(String(data.port));
    setTimeoutTesto(String(data.timeoutMs));
  }, [data]);

  const salva = useMutation({
    mutationFn: (c: ConfigAd) => adSettingsApi.save(c),
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
    onError: (err: any) => setEsito({ raggiungibile: false, messaggio: err.message ?? "Errore" }),
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

  // I dati sono arrivati ma l'effect che popola `form` non ha ancora girato:
  // stato transitorio, non un errore.
  if (!form) return <p className="text-sm text-gray-500 py-6">Carico…</p>;

  const c = form;
  // Cambiare un campo invalida anche l'esito mostrato sotto «Prova
  // connessione»: quel bottone testa la configurazione salvata, non questa
  // bozza, e un verdetto vecchio lasciato accanto a valori appena modificati
  // si legge come se si riferisse a loro.
  const set = (patch: Partial<ConfigAd>) => {
    setForm({ ...c, ...patch });
    setEsito(null);
  };

  const porta = parseInt(portaTesto, 10);
  const portaValida = portaTesto.trim() !== "" && !Number.isNaN(porta) && porta >= PORTA_MIN && porta <= PORTA_MAX;
  const timeout = parseInt(timeoutTesto, 10);
  const timeoutValido =
    timeoutTesto.trim() !== "" && !Number.isNaN(timeout) && timeout >= TIMEOUT_MIN && timeout <= TIMEOUT_MAX;

  const handleSalva = () => {
    if (!portaValida) {
      toast({
        title: "Porta non valida",
        description: `Deve essere un numero tra ${PORTA_MIN} e ${PORTA_MAX}.`,
        variant: "destructive",
      });
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
    salva.mutate({ ...c, port: porta, timeoutMs: timeout });
  };

  const bindInfo = esito?.bind ? messaggioBind(esito.bind) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Switch checked={c.enabled} onCheckedChange={(v) => set({ enabled: v })} />
        <Label>Autenticazione Active Directory attiva</Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Domain controller</Label>
          <Input
            value={c.host}
            placeholder="dc01.consorzio.local"
            onChange={(e) => set({ host: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label>Porta</Label>
          <Input
            type="number"
            min={PORTA_MIN}
            max={PORTA_MAX}
            value={portaTesto}
            onChange={(e) => {
              setPortaTesto(e.target.value);
              setEsito(null);
            }}
          />
          {!portaValida && (
            <p className="text-xs text-red-600">
              Numero tra {PORTA_MIN} e {PORTA_MAX}.
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Suffisso di dominio</Label>
          <Input
            value={c.dominio}
            placeholder="consorzio.local"
            onChange={(e) => set({ dominio: e.target.value })}
          />
          <p className="text-xs text-gray-500">
            Viene aggiunto allo username: <code>m.rossi@{c.dominio || "consorzio.local"}</code>
          </p>
        </div>
        <div className="space-y-1">
          <Label>Sicurezza del canale</Label>
          <Select value={c.tls} onValueChange={(v) => set({ tls: v as ConfigAd["tls"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ldaps">LDAPS (consigliato, porta 636)</SelectItem>
              <SelectItem value="starttls">StartTLS (porta 389)</SelectItem>
              <SelectItem value="nessuno">Nessuna cifratura</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {c.tls === "nessuno" && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex gap-2">
          <ShieldAlert size={16} className="shrink-0 mt-0.5" />
          Senza cifratura le password di dominio viaggiano in chiaro sulla
          rete verso il domain controller. È una scelta deliberata, possibile
          quando LDAPS e StartTLS non sono disponibili — ma va presa
          sapendolo.
        </p>
      )}

      <div className="space-y-1">
        <Label>Certificato della CA interna (PEM)</Label>
        <Textarea
          rows={5}
          className="font-mono text-xs"
          value={c.caPem}
          placeholder="-----BEGIN CERTIFICATE-----"
          onChange={(e) => set({ caPem: e.target.value })}
        />
        <p className="text-xs text-gray-500">
          Il certificato del domain controller è quasi sempre emesso dalla CA del
          dominio, che il server non conosce: incollalo qui.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={!c.rejectUnauthorized}
            onCheckedChange={(v) => set({ rejectUnauthorized: !v })}
          />
          <Label>Non verificare il certificato del server</Label>
        </div>
        {!c.rejectUnauthorized && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex gap-2">
            <ShieldAlert size={16} className="shrink-0 mt-0.5" />
            Con la verifica disattivata, chiunque risponda su quell'indirizzo
            riceve le password di dominio del personale. Usalo solo come ultima
            risorsa, dopo aver provato a incollare il certificato della CA.
          </p>
        )}
      </div>

      <div className="space-y-1 max-w-xs">
        <Label>Timeout (millisecondi)</Label>
        <Input
          type="number"
          min={TIMEOUT_MIN}
          max={TIMEOUT_MAX}
          value={timeoutTesto}
          onChange={(e) => {
            setTimeoutTesto(e.target.value);
            setEsito(null);
          }}
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
        <p className="text-sm font-medium">Prova connessione</p>
        <p className="text-xs text-gray-500">
          Verifica che il domain controller risponda e che il TLS regga. Puoi
          aggiungere le tue credenziali di dominio per provare anche
          l'autenticazione: non vengono salvate.
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
          Prova connessione
        </Button>
        <p className="text-xs text-gray-500">
          La prova usa la configurazione già salvata, non quanto scritto sopra
          e non ancora salvato: se hai modificato host, porta o altri campi,
          salva prima di premere il pulsante.
        </p>
        {esito && (
          <div className="space-y-2">
            {/* Raggiungibilità e autenticazione sono due esiti indipendenti:
                un domain controller raggiungibile con credenziali sbagliate
                è "server ok, credenziali no", non una contraddizione da
                schiacciare in un solo riquadro. */}
            <div
              className={`text-sm rounded px-3 py-2 border ${
                CLASSI_ESITO[esito.raggiungibile ? "verde" : "rosso"]
              }`}
            >
              {esito.messaggio}
            </div>
            {bindInfo && (
              <div className={`text-sm rounded px-3 py-2 border ${CLASSI_ESITO[bindInfo.colore]}`}>
                {bindInfo.testo}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
