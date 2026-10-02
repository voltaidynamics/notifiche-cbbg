import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSyncAnagrafiche } from "@/hooks/use-sync-anagrafiche";
import { cn } from "@/lib/utils";
import { messaggioErrore } from "@/lib/messaggio-errore";
import { Waves, Boxes, Droplet, FileText, ArrowUpDown, GitFork } from "lucide-react";
import { templatesApi, consorzioApi, notificationsApi, utentiTestApi } from "@/lib/api";
import type {
  MadreSelezionabile, TrattaSelezionabile, RoggiaMadreSelezionabile, TrattaRoggiaSelezionabile,
  DestinatarioInvio,
} from "@shared/schema";
import type { CategoriaMadre } from "@shared/categorie-madri";
import {
  toggleTratta as applicaToggleTratta,
  toggleMadre as applicaToggleMadre,
  selezionaTutte,
  madriComplete,
  comprimiPerAnteprima,
  madriDellaSezione,
} from "@/lib/selezione-tratte";
import { filtraConduttori, chiaviDi } from "@/lib/filtro-conduttori";
import { aggregaDestinatari, codiciTratte, haNumero } from "@shared/destinatari";
import {
  TIPI_NOTIFICA, CLASSIFICAZIONI_NOTIFICA,
  ETICHETTE_TIPO, ETICHETTE_CLASSIFICAZIONE,
  COLORI_TIPO, COLORI_CLASSIFICAZIONE,
  type TipoNotifica, type ClassificazioneNotifica,
} from "@shared/classificazione";
import {
  TIPI_LEGAME, ETICHETTE_LEGAME, COLORI_LEGAME, type TipoLegame,
} from "@shared/legame";
import { risolviStato, ETICHETTE_STATO, COLORI_STATO } from "@shared/stato-rogge";
import { canaleDi, contaPerCanale, haIndirizzo } from "@shared/canale-email";
import { BadgeCanaliContatto } from "@/components/badge-canale";
import { mancanoDestinatari } from "@shared/invio-notifica";
import { utenteTestRaggiungibile } from "@shared/utenti-test";

type Row = { conduttore: DestinatarioInvio; tratte: string; invia: boolean };
type SortKey = "invia" | "descrizione" | "tratte" | "cellulare" | "email" | "canale";

/** La quarta sezione non è una categoria di `madri`: è l'altra gerarchia. */
export type SezioneInvio = CategoriaMadre | "roggeMadri";

// Quattro sezioni (issue #49). «Rogge madri» è la prima perché è quella che il
// consorzio guarda per prima: è la roggia che l'operatore ha in testa quando
// decide di chiudere — è una posizione, non l'atterraggio: vedi `sezione`
// iniziale più sotto. Tutte e quattro hanno madri e figlie — nei dati veri
// anche i pozzi (issue #14) — ma per i pozzi le tratte non si mostrano: si
// sceglie la madre, e sotto valgono tutte le sue tratte.
//
// «Rogge madri» ha un'icona diversa da «Rogge» (Rilievo 10 della revisione
// finale): sono due gerarchie distinte con la stessa `Waves` le rendeva
// indistinguibili a un bottone di distanza. `GitFork` richiama la
// ramificazione madre→figlie della seconda gerarchia; l'icona storica di
// «Rogge» non si tocca.
//
// Le etichette sono quelle chieste dal consorzio il 24/09/2026: la categoria
// `rogge` (tipo irrigazione 1/2) si chiama «Scorrimento» — le chiavi restano
// quelle di sempre, cambia solo ciò che si legge.
const SEZIONI: { key: SezioneInvio; label: string; icon: React.ElementType; mostraTratte: boolean }[] = [
  { key: "roggeMadri", label: "Rogge Madri", icon: GitFork, mostraTratte: true },
  { key: "rogge", label: "Scorrimento", icon: Waves, mostraTratte: true },
  { key: "impianti", label: "Impianti", icon: Boxes, mostraTratte: true },
  { key: "pozzi", label: "Pozzi", icon: Droplet, mostraTratte: false },
];

// Riferimenti stabili per le liste vuote: `useQuery({ data = [] })` creerebbe un
// array nuovo a ogni render, e le useMemo che ne dipendono si ricalcolerebbero
// sempre.
const NESSUNA_MADRE: MadreSelezionabile[] = [];
const NESSUNA_TRATTA: TrattaSelezionabile[] = [];
const NESSUNA_ROGGIA_MADRE: RoggiaMadreSelezionabile[] = [];
const NESSUNA_TRATTA_ROGGIA: TrattaRoggiaSelezionabile[] = [];

// Il titolo della comunicazione diventerà l'oggetto della mail; questo è il
// valore da cui si parte, come chiesto nella issue #13.
const TITOLO_PREDEFINITO = "CBBG - Comunicazione Importante";

export default function InviaNotifica() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Default a "rogge", non "roggeMadri" (Rilievo 4 della revisione finale):
  // in produzione la gerarchia R resta vuota finché il consorzio non consegna
  // i due JSON, e la pagina non deve atterrare su una colonna vuota con un
  // avviso tecnico. Il bottone «Rogge madri» resta comunque il primo in alto
  // a sinistra (vedi il commento su SEZIONI) — la spec chiede quella
  // posizione, non l'atterraggio. Quando la gerarchia sarà caricata e
  // confermata col consorzio, riportare il default a "roggeMadri" è questa
  // riga sola (vedi `noteDeploy.md` §13).
  const [sezione, setSezione] = useState<SezioneInvio>("rogge");
  const [madriSel, setMadriSel] = useState<Set<string>>(new Set());
  const [figlieSel, setFiglieSel] = useState<Set<string>>(new Set());
  const [searchMadre, setSearchMadre] = useState("");
  const [searchFiglia, setSearchFiglia] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  // Il legame scelto per *questa* selezione, e il popup che lo chiede (issue
  // #27). Vive accanto a `rows` e muore con lui: una scelta sopravvissuta a un
  // cambio di tratte sarebbe un invio fatto col legame di un'altra selezione.
  const [legame, setLegame] = useState<TipoLegame | null>(null);
  const [dialogLegameOpen, setDialogLegameOpen] = useState(false);
  const [searchConduttore, setSearchConduttore] = useState("");
  // Un solo punto in cui la fotografia dei conduttori si butta: cambio di
  // categoria, di madri, di tratte, sync concluso, invio partito. Sparsi a mano
  // in sette punti, il legame verrebbe dimenticato in almeno uno.
  const azzeraConduttori = () => {
    setRows(null);
    setLegame(null);
    // La ricerca muore con la tabella che filtrava: sopravvissuta a un cambio
    // di tratte, mostrerebbe "nessun risultato" su una fotografia nuova.
    setSearchConduttore("");
  };
  const [sortKey, setSortKey] = useState<SortKey>("descrizione");
  const [sortAsc, setSortAsc] = useState(true);
  const [titolo, setTitolo] = useState(TITOLO_PREDEFINITO);
  const [messaggio, setMessaggio] = useState("");
  // Il testo SMS vive accanto a quello della mail, con le sue stesse regole:
  // a invio partito si svuota la tabella dei conduttori, non i testi scritti
  // (issue #28).
  const [messaggioSms, setMessaggioSms] = useState("");
  // Spenta di default: ogni SMS costa, e un testo scritto e poi ripensato non
  // deve diventare una spesa involontaria.
  const [inviaSms, setInviaSms] = useState(false);
  const [tipo, setTipo] = useState<TipoNotifica | "">("");
  const [classificazione, setClassificazione] = useState<ClassificazioneNotifica | "">("");
  const [riepilogoOpen, setRiepilogoOpen] = useState(false);

  const catCorrente = SEZIONI.find((c) => c.key === sezione)!;
  const madriKey = Array.from(madriSel).sort().join(",");
  const inGerarchiaRogge = sezione === "roggeMadri";

  // Il pulsante di caricamento on demand (issue #8) è stato spostato in
  // Impostazioni (issue #13), ma lo stato del sync serve ancora qui: la data
  // finisce nel riepilogo di conferma e un caricamento concluso deve buttare la
  // tabella dei conduttori (vedi l'effetto più sotto). Le chiavi passate
  // all'hook sono quelle delle liste di questa pagina, così a sync concluso si
  // ricaricano insieme alle tabelle delle Anagrafiche.
  const sync = useSyncAnagrafiche([
    ["/api/consorzio/madri"], ["/api/consorzio/tratte"],
    ["/api/consorzio/rogge-madri"], ["/api/consorzio/rogge-tratte"],
  ]);

  const { data: madri = NESSUNA_MADRE } = useQuery({
    queryKey: ["/api/consorzio/madri"],
    queryFn: () => consorzioApi.getMadri(),
  });
  const { data: figlie = NESSUNA_TRATTA } = useQuery({
    queryKey: ["/api/consorzio/tratte", madriKey],
    // Con più madri selezionate compaiono le figlie di tutte (issue #13).
    queryFn: () => consorzioApi.getTratte(Array.from(madriSel)),
    // Rilievo 7 della revisione finale: senza `!inGerarchiaRogge` questa query
    // partiva anche nella quarta sezione — con `madriSel` piena di codici
    // roggia madre R, che non sono mai madri di questo elenco — e il suo
    // risultato veniva scartato (`figlieInElenco` sotto legge `figlieRogge`,
    // non `figlie`, quando `inGerarchiaRogge`). Una richiesta di rete sprecata
    // a ogni selezione fatta in quella sezione.
    enabled: !inGerarchiaRogge && madriSel.size > 0,
  });
  // Seconda gerarchia (issue #49): stesse due tappe di madri/figlie, ma sulle
  // rogge madri R. Tabelle e rotte proprie: non è un filtro sulle due sopra.
  const { data: roggeMadri = NESSUNA_ROGGIA_MADRE, isFetching: roggeMadriInCaricamento } = useQuery({
    queryKey: ["/api/consorzio/rogge-madri"],
    queryFn: () => consorzioApi.getRoggeMadri(),
    enabled: inGerarchiaRogge,
  });
  const { data: figlieRogge = NESSUNA_TRATTA_ROGGIA } = useQuery({
    queryKey: ["/api/consorzio/rogge-tratte", madriKey],
    queryFn: () => consorzioApi.getTratteDiRoggeMadri(Array.from(madriSel)),
    enabled: inGerarchiaRogge && madriSel.size > 0,
  });
  const { data: dbTemplates = [] } = useQuery({
    queryKey: ["/api/templates"],
    queryFn: () => templatesApi.getAll(),
  });
  const { data: statoRogge } = useQuery({
    queryKey: ["/api/consorzio/stato-rogge"],
    queryFn: () => consorzioApi.getStatoRogge(),
  });
  const stati = statoRogge?.stati ?? [];

  // Chi riceve comunque, qualunque roggia (issue #36). Serve a due cose: a dire
  // all'operatore che parte una copia, e ad accendere il bottone quando ha
  // tolto la spunta a tutti i conduttori per collaudare.
  const { data: utentiTestAttivi = [] } = useQuery({
    queryKey: ["/api/utenti-test/attivi"],
    queryFn: () => utentiTestApi.attivi(),
  });

  // Solo quelli che *questa* comunicazione raggiunge: chi ha il solo telefono
  // non riceve niente con la spunta SMS spenta, ed e' la stessa regola con cui
  // il server rifiuta l'invio.
  const utentiTestRaggiungibili = useMemo(
    () => utentiTestAttivi.filter((u) => utenteTestRaggiungibile(u, inviaSms)),
    [utentiTestAttivi, inviaSms],
  );

  // Il template porta con sé oggetto, corpo mail e testo SMS: caricarne uno
  // deve riempire tutti e tre i campi (issue #28). Solo i template del
  // database: senza, la tendina resta vuota, niente modelli di ripiego (issue #94).
  const templateOptions = dbTemplates.map((t) => ({ id: String(t.id), label: t.name, oggetto: t.subject, body: t.bodyEmail, sms: t.bodySms }));

  // Le due gerarchie riempiono gli stessi due elenchi: da qui in giù la pagina
  // non sa più quale delle due sta mostrando, e non deve saperlo.
  //
  // Le rogge madri non hanno una vera categoria/origine (sono una gerarchia a
  // sé, non una quarta categoria di `madri`): `categoria: "rogge"` e
  // `origine: "impianti"` qui sotto sono un ripiego per riusare la stessa
  // forma `MadreSelezionabile` in tutta la pagina, non un dato vero — la
  // quarta sezione non legge mai questi due campi.
  const madriInElenco = useMemo<MadreSelezionabile[]>(
    () => inGerarchiaRogge
      ? roggeMadri.map((m) => ({ codicemadre: m.codicemadre, name: m.name, categoria: "rogge" as const, origine: "impianti" as const }))
      : madriDellaSezione(madri, sezione),
    [inGerarchiaRogge, roggeMadri, madri, sezione],
  );
  const figlieInElenco = useMemo<TrattaSelezionabile[]>(
    () => inGerarchiaRogge
      ? figlieRogge.map((f) => ({ keyroggia: f.keyroggia, name: f.name, codicemadre: f.codicemadre }))
      : figlie,
    [inGerarchiaRogge, figlieRogge, figlie],
  );

  const madriFiltrate = useMemo(
    () =>
      madriInElenco.filter((m) => `${m.codicemadre} ${m.name}`.toLowerCase().includes(searchMadre.toLowerCase())),
    [madriInElenco, searchMadre],
  );
  const figlieFiltrate = useMemo(
    () =>
      figlieInElenco.filter((f) =>
        `${f.keyroggia} ${f.name}`.toLowerCase().includes(searchFiglia.toLowerCase()),
      ),
    [figlieInElenco, searchFiglia],
  );
  // Le madri selezionate che hanno almeno una tratta nell'elenco filtrato:
  // sono quelle per cui ha senso offrire "tutte le tratte di X" come scorciatoia.
  // Sostituisce l'omnicomprensiva (mai esistita nei dati veri, issue derivata dal
  // modello a registro): "tutte le tratte" di una madre non è più un codice
  // speciale da spuntare, ma un'azione che accende in blocco le sue tratte vere.
  const madriConTratte = useMemo(
    () =>
      Array.from(madriSel)
        .filter((m) => figlieFiltrate.some((f) => f.codicemadre === m))
        .sort(),
    [madriSel, figlieFiltrate],
  );

  // keyroggia -> madre **dell'impianto**, per l'ereditarietà dello stato.
  // Nella gerarchia R la madre con cui si seleziona è un'altra cosa: chiudere
  // il pozzo IM27A chiude le sue tratte, ed è questo che il badge deve dire.
  const madreDiTratta = useMemo(() => {
    const m: Record<string, string> = {};
    if (inGerarchiaRogge) {
      for (const t of figlieRogge) if (t.codicemadreimpianto) m[t.keyroggia] = t.codicemadreimpianto;
    } else {
      for (const t of figlie) if (t.codicemadre) m[t.keyroggia] = t.codicemadre;
    }
    return m;
  }, [inGerarchiaRogge, figlieRogge, figlie]);

  const selectSezione = (s: SezioneInvio) => {
    setSezione(s);
    setMadriSel(new Set());
    setFiglieSel(new Set());
    setSearchMadre("");
    setSearchFiglia("");
    azzeraConduttori();
  };
  // Selezione multipla delle madri (issue #13).
  const toggleMadre = (codicemadre: string) => {
    setMadriSel((prev) => {
      const next = new Set(prev);
      if (next.has(codicemadre)) next.delete(codicemadre);
      else next.add(codicemadre);
      return next;
    });
    setFiglieSel(new Set());
    setSearchFiglia("");
    azzeraConduttori();
  };
  const toggleFiglia = (keyroggia: string) => {
    setFiglieSel((prev) => applicaToggleTratta(prev, keyroggia));
    azzeraConduttori();
  };
  // Accende o spegne in blocco tutte le tratte di una madre (riceve
  // `figlieInElenco`, non filtrate: l'azione deve funzionare anche su quelle
  // che la ricerca sta nascondendo). Sostituisce l'omnicomprensiva come modo
  // di dire "tutte le tratte di X".
  const toggleTratteMadre = (codicemadre: string) => {
    setFiglieSel((prev) => applicaToggleMadre(prev, figlieInElenco, codicemadre));
    azzeraConduttori();
  };
  // «Seleziona tutti» resta sull'elenco filtrato, come prima.
  const selectAllFiglie = () => {
    setFiglieSel(selezionaTutte(figlieFiltrate));
    azzeraConduttori();
  };
  const deselectAllFiglie = () => {
    setFiglieSel(new Set());
    azzeraConduttori();
  };

  // Che cosa vale davvero per l'invio, nelle due forme che il server accetta.
  //
  // Per rogge e impianti sono le tratte spuntate a mano. Per i pozzi l'elenco
  // delle tratte non si mostra (issue #14): vale l'intera madre, e a risolverne
  // i figli è il server (issue #26).
  //
  // Fino alla #26 anche i pozzi passavano di qui come elenco di tratte, ricavato
  // dalle figlie caricate. Ma nessuno dei 20 pozzi ha una figlia nel mirror —
  // l'anagrafica delle figlie e quella dei legami arrivano da export distinti —
  // quindi quell'elenco era sempre vuoto e «Mostra Conduttori» restava spento
  // per sempre, senza dire perché.
  //
  // È un valore derivato e non uno stato a parte di proposito: due insiemi da
  // tenere allineati a mano sono il modo classico di spedire alla selezione
  // precedente.
  const selezione = useMemo(
    () =>
      catCorrente.mostraTratte
        ? { tratte: Array.from(figlieSel), madri: [] as string[] }
        : { tratte: [] as string[], madri: Array.from(madriSel) },
    [catCorrente.mostraTratte, figlieSel, madriSel],
  );
  const nienteSelezionato = selezione.tratte.length === 0 && selezione.madri.length === 0;

  // La stessa selezione come la chiedono le due anteprime in GET: ogni madre di
  // cui sono spuntate tutte le tratte parte come madre, non come elenco di
  // tratte. Senza, «Seleziona tutti» sugli impianti (542 tratte) superava il
  // tetto di 500 codici per query e «Mostra Conduttori» rispondeva 400.
  // L'invio no: continua a mandare `selezione`, tratta per tratta (vedi
  // `comprimiPerAnteprima`).
  const anteprima = useMemo(
    () =>
      catCorrente.mostraTratte
        ? comprimiPerAnteprima(selezione.tratte, selezione.madri, figlieInElenco)
        : selezione,
    [catCorrente.mostraTratte, selezione, figlieInElenco],
  );

  // La madre compressa va nel parametro della sua gerarchia: il server espande
  // `madri` su `tratte` e `roggeMadri` su `tratte_rogge`.
  const anteprimaMadri = inGerarchiaRogge ? [] : anteprima.madri;
  const anteprimaRoggeMadri = inGerarchiaRogge ? anteprima.madri : [];

  // La chiave dice i parametri che partono davvero, e tiene distinti i tre
  // elenchi: una madre compressa e le sue tratte sono richieste diverse, e le
  // due gerarchie di madri non vanno confuse fra loro.
  const anteprimaKey = useMemo(
    () =>
      `tratte=${anteprima.tratte.slice().sort().join(",")}`
      + `&madri=${anteprimaMadri.slice().sort().join(",")}`
      + `&roggeMadri=${anteprimaRoggeMadri.slice().sort().join(",")}`,
    [anteprima, anteprimaMadri, anteprimaRoggeMadri],
  );

  // I conteggi si chiedono solo a popup aperto: a selezione ferma la risposta
  // resta in cache, e cambiando tratte la chiave cambia con lei.
  const { data: conteggi } = useQuery({
    queryKey: ["/api/consorzio/legami/conteggi", anteprimaKey],
    queryFn: () => consorzioApi.getConteggiLegami(anteprima.tratte, anteprimaMadri, anteprimaRoggeMadri),
    enabled: dialogLegameOpen,
  });

  /**
   * Lo step intermedio della issue #27: prima di vedere i conduttori si sceglie
   * da quale dei due elenchi del consorzio arrivano. Uno solo — per una tratta
   * non è previsto l'invio a entrambi i legami.
   */
  const scegliLegame = async (scelto: TipoLegame) => {
    // La tabella precedente passa dal chokepoint prima ancora di conoscere
    // l'esito della nuova scelta: altrimenti, durante l'attesa, resterebbero in
    // vista i conduttori dell'altro legame sotto un badge che ha già cambiato
    // nome — e se la richiesta va a buon fine con calma, si vedrebbe pure il
    // lampo delle righe vecchie prima che arrivino le nuove.
    azzeraConduttori();
    setLegame(scelto);
    setDialogLegameOpen(false);
    let pairs;
    try {
      pairs = await consorzioApi.getDestinatari(scelto, anteprima.tratte, anteprimaMadri, anteprimaRoggeMadri);
    } catch (e) {
      // Senza questo ramo una chiamata fallita lascia la tabella com'è, e una
      // tabella vuota si legge come "nessun conduttore su queste tratte":
      // esattamente la conclusione sbagliata. Cade anche il legame, o resterebbe
      // un badge che dichiara una scelta senza nessun elenco sotto — e passando
      // dal chokepoint invece che da un `setLegame(null)` isolato, cade anche la
      // tabella già mostrata per il tentativo precedente: è esattamente lo
      // stesso invariante di `azzeraConduttori`, applicato qui a una scelta che
      // è fallita anziché cambiata.
      azzeraConduttori();
      toast({
        title: "Destinatari non caricati",
        description: (e as Error).message,
        variant: "destructive",
      });
      return;
    }
    // Un conduttore legato a più tratte selezionate compare una riga sola e
    // riceve una sola comunicazione (issue #5). La regola è quella condivisa col
    // server, che la riapplica al momento dell'invio.
    const destinatari = aggregaDestinatari(
      pairs.map((p) => ({ conduttore: p.conduttore, keyroggia: p.keyroggia })),
      (c) => c.keykey,
    );
    setRows(
      destinatari.map((d) => ({
        conduttore: d.conduttore,
        tratte: codiciTratte(d.tratte) ?? "",
        invia: true,
      })),
    );
  };

  /** Che cosa scrivere sotto ciascuna opzione del popup. */
  const descrizioneLegame = (t: TipoLegame): string => {
    if (!conteggi) return "Conteggio in corso…";
    const c = conteggi[t];
    if (c.selezione > 0) {
      return `${c.selezione} ${c.selezione === 1 ? "conduttore" : "conduttori"} su questa selezione`;
    }
    // Le due cause di uno zero non si dicono con la stessa frase: l'export non
    // ancora arrivato è la situazione di oggi per la stagione irrigua, e va
    // detta, o l'operatore conclude che la pagina è rotta.
    if (c.mirror === 0) return "Nessun legame di questo tipo caricato nell'anagrafica";
    return "Nessun conduttore su questa selezione";
  };

  // La tabella dei conduttori è una fotografia scattata al momento di "Mostra
  // Conduttori". Se nel frattempo arriva un caricamento nuovo (a mano o
  // notturno) quella fotografia è vecchia: va buttata, altrimenti si finirebbe
  // per spedire ai contatti di prima proprio dopo aver chiesto di aggiornarli.
  const idSyncRef = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (sync.stato === undefined) return; // stato non ancora noto: non è un'osservazione
    const idCorrente = sync.ultimoCompletato?.id ?? null;
    const precedente = idSyncRef.current;
    idSyncRef.current = idCorrente;
    if (precedente === undefined) return; // prima osservazione: niente da invalidare
    if (precedente !== idCorrente) azzeraConduttori();
  }, [sync.stato, sync.ultimoCompletato]);

  const sortedRows = useMemo(() => {
    if (!rows) return [];
    const val = (r: Row): string | number => {
      switch (sortKey) {
        case "invia": return r.invia ? 1 : 0;
        case "descrizione": return r.conduttore.descrizione.toLowerCase();
        case "tratte": return r.tratte;
        case "cellulare": return r.conduttore.cellulare ?? "";
        case "email": return r.conduttore.email ?? "";
        // Le PEC in cima all'ordine crescente: sono loro a decidere se
        // l'invio parte o viene rifiutato per intero. Chi non ha indirizzo
        // finisce in fondo e non fra le PEC anche se l'anagrafica lo dice
        // certificato: non entra nel conteggio «N via PEC», e ordinarlo lassù
        // farebbe contare a mano un numero diverso da quello sopra la tabella.
        // A parità di casella vengono prima quelli raggiungibili anche via
        // SMS, così l'ordine racconta la colonna intera e non metà.
        case "canale": {
          const posta = !haIndirizzo(r.conduttore.email)
            ? 4
            : canaleDi(r.conduttore.tipoEmail) === "pec"
              ? 0
              : 2;
          return posta + (haNumero(r.conduttore.cellulare) ? 0 : 1);
        }
      }
    };
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [rows, sortKey, sortAsc]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(true); }
  };
  const toggleInvia = (keykey: string, checked: boolean) => {
    setRows((prev) => prev && prev.map((r) => (r.conduttore.keykey === keykey ? { ...r, invia: checked } : r)));
  };

  const keyActivate = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
  };

  // La ricerca tocca solo che cosa si vede: `sortedRows` resta la fotografia
  // intera, ed è da lì che si contano e si prendono i destinatari. Filtrare
  // anche l'invio vorrebbe dire spedire di nascosto ai soli nomi a schermo.
  const righeVisibili = useMemo(
    () => filtraConduttori(sortedRows, searchConduttore),
    [sortedRows, searchConduttore],
  );
  const totNotificati = sortedRows.filter((r) => r.invia).length;
  // Quanti fra i selezionati hanno davvero un numero: nell'anagrafica del
  // consorzio sono circa la metà, e chi conferma deve saperlo prima.
  const totConNumero = sortedRows.filter((r) => r.invia && haNumero(r.conduttore.cellulare)).length;
  // Quanti di loro vanno raggiunti via PEC. Il server rifiuta l'invio *per
  // intero* se la PEC non è configurata, e lo dice con un numero: mostrarlo
  // prima è l'unico modo perché l'operatore se ne accorga mentre può ancora
  // fare qualcosa. Chi non ha indirizzo non conta: non parte per nessun canale.
  const totPec = useMemo(
    () =>
      contaPerCanale([
        ...sortedRows.filter((r) => r.invia).map((r) => r.conduttore),
        // Gli utenti di test entrano nel conteggio come nel server: uno di essi
        // in PEC pretende le credenziali PEC, e il numero mostrato qui non deve
        // poter essere smentito dal rifiuto del server.
        // La "x" è un segnaposto: `contaPerCanale` guarda solo *se* c'è un
        // indirizzo, non lo legge mai, e alla pagina il vero indirizzo non
        // arriva.
        ...utentiTestRaggiungibili.map((u) => ({ email: u.haEmail ? "x" : null, tipoEmail: u.canale })),
      ]).pec,
    [sortedRows, utentiTestRaggiungibili],
  );

  // «Seleziona / Deseleziona tutti» agisce sulle sole righe filtrate, come già
  // il tasto gemello sulle tratte: chi sta fuori dalla ricerca non viene
  // toccato, e il contatore sopra la tabella lo dice a voce alta.
  const impostaInviaVisibili = (checked: boolean) => {
    const chiavi = chiaviDi(righeVisibili);
    setRows((prev) => prev && prev.map((r) => (chiavi.has(r.conduttore.keykey) ? { ...r, invia: checked } : r)));
  };

  // Il riepilogo elenca i codici, non il conteggio (issue #13). Chi conferma non deve
  // sapere a memoria cosa significhi il suffisso D00000.
  //
  // "Tutte" non si legge più da un codice omnicomprensivo (sparito col
  // modello a registro): è una copertura reale, verificata confrontando le
  // tratte scelte con tutte le tratte vere della madre. Funziona sia che
  // l'operatore sia arrivato lì con la scorciatoia "Tutte le tratte di X"
  // sia spuntando una per una — a differenza del vecchio comportamento, che
  // se ne accorgeva solo passando dal codice fittizio.
  //
  // La copertura è `madriComplete`, la stessa regola con cui le anteprime
  // decidono quali madri mandare al posto delle tratte.
  const codiciSelezionati = useMemo(() => {
    const perCodice = new Map(figlieInElenco.map((f) => [f.keyroggia, f]));
    const complete = madriComplete(selezione.tratte, figlieInElenco);
    const daTratte = selezione.tratte
      .slice()
      .sort()
      .map((codice) => {
        const madre = perCodice.get(codice)?.codicemadre;
        const tutte = !!madre && complete.indexOf(madre) !== -1;
        return { codice, tutte };
      });
    // Una madre scelta per intero è essa stessa un "tutte", ed è l'unica cosa
    // che il riepilogo può mostrare per un pozzo: i codici dei figli li conosce
    // il server, non questa pagina.
    const daMadri = selezione.madri
      .slice()
      .sort()
      .map((codice) => ({ codice, tutte: true }));
    return [...daMadri, ...daTratte];
  }, [selezione, figlieInElenco]);

  // I due assi sono obbligatori (issue #12): il server rifiuta con 400 un invio
  // senza, e una notifica non classificata sparirebbe da ogni filtro dello Storico.
  const classificazioneCompleta = tipo !== "" && classificazione !== "";
  // Il titolo diventa l'oggetto della mail (issue #23): vuoto, il consorzio
  // spedirebbe una comunicazione senza oggetto. Il server rifiuta comunque —
  // qui il bottone si spegne prima, con il motivo scritto accanto.
  const testoCompleto =
    titolo.trim() !== "" && messaggio.trim() !== "" && (!inviaSms || messaggioSms.trim() !== "");

  const invio = useMutation({
    mutationFn: notificationsApi.inviaDaTratte,
    onSuccess: (esito) => {
      // Lo Storico ha una riga in più, e i contatori della Dashboard sono vecchi.
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/storico"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      // L'invio ha appena cambiato lo stato delle tratte selezionate: senza
      // invalidare anche questa chiave, con staleTime: Infinity la pagina
      // (e Dashboard e Anagrafiche) resterebbero a mostrare "aperta" fino a un F5.
      queryClient.invalidateQueries({ queryKey: ["/api/consorzio/stato-rogge"] });
      setRiepilogoOpen(false);
      // La tabella si svuota a invio partito. Lasciarla lì significa lasciare
      // armato il bottone: chi non ha visto il toast riclicca, e la stessa
      // comunicazione parte una seconda volta a tutti.
      azzeraConduttori();
      toast({
        title: "Invio avviato",
        description: `Comunicazione in partenza verso ${esito.destinatari} destinatari. L'esito di ogni mail si vede nello Storico notifiche.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Invio non riuscito",
        description: messaggioErrore(error),
        variant: "destructive",
      });
    },
  });

  const confermaInvio = () => {
    // Il controllo è ripetuto sui due stati e non su `classificazioneCompleta`:
    // TypeScript non restringe `tipo` e `classificazione` a partire da un
    // booleano intermedio.
    if (tipo === "" || classificazione === "") {
      toast({
        title: "Classificazione mancante",
        description: "Scegli Tipo e Classificazione prima di inviare.",
        variant: "destructive",
      });
      return;
    }
    if (legame === null) {
      toast({
        title: "Legame non scelto",
        description: "Riapri «Mostra Conduttori» e scegli live o stagione irrigua.",
        variant: "destructive",
      });
      return;
    }
    invio.mutate({
      tratte: selezione.tratte,
      madri: selezione.madri,
      legame,
      // Solo chi è rimasto spuntato: la spunta tolta in tabella è una scelta
      // dell'operatore, non un filtro da rifare lato server.
      destinatari: sortedRows.filter((r) => r.invia).map((r) => r.conduttore.keykey), // insieme intero, mai il filtrato
      titolo: titolo.trim(),
      messaggio: messaggio.trim(),
      messaggioSms: messaggioSms.trim(),
      inviaSms,
      tipo,
      classificazione,
    });
  };

  const th = (label: string, key: SortKey) => (
    <th
      className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 border-b cursor-pointer select-none hover:bg-gray-50"
      onClick={() => setSort(key)}
      role="button"
      tabIndex={0}
      onKeyDown={keyActivate(() => setSort(key))}
    >
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown size={11} /></span>
    </th>
  );

  // Lo stato corrente accanto al codice: chi sta per comunicare una chiusura
  // deve vedere prima di premere che quella tratta è già chiusa.
  //
  // Dichiarato prima di `listaFiglie`: quella costante chiama
  // `figlieFiltrate.map(...)` immediatamente (non a render differito), e in
  // JSX quel `.map` diventa `React.createElement(BadgeStato, ...)` — il
  // binding viene letto subito. Con `BadgeStato` dichiarato più sotto, il
  // caso normale (una madre selezionata, almeno una figlia caricata) andava
  // in `ReferenceError: Cannot access 'BadgeStato' before initialization`.
  const BadgeStato = ({ codice, livello }: { codice: string; livello: "tratta" | "madre" }) => {
    const s = risolviStato(codice, livello, stati, livello === "tratta" ? (madreDiTratta[codice] ?? null) : null).stato;
    if (s === "aperta") return null; // Aperta è il caso normale: un badge su tutto sarebbe rumore.
    return (
      <span className={cn("text-[10px] rounded px-1.5 py-0.5 font-medium flex-shrink-0 ml-auto", COLORI_STATO[s])}>
        {ETICHETTE_STATO[s]}
      </span>
    );
  };

  const listaFiglie = (
    <ul className="border rounded-lg max-h-64 overflow-y-auto divide-y scrollbar-visibile">
      {madriSel.size === 0 && (
        <li className="px-3 py-6 text-center text-sm text-gray-400">
          Seleziona prima una o più {sezione === "impianti" ? "impianti" : "rogge madri"} a sinistra
        </li>
      )}
      {madriSel.size > 0 && figlieFiltrate.map((f) => (
        <li
          key={f.keyroggia}
          onClick={() => toggleFiglia(f.keyroggia)}
          role="button"
          tabIndex={0}
          onKeyDown={keyActivate(() => toggleFiglia(f.keyroggia))}
          className={cn(
            "px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center gap-2",
            figlieSel.has(f.keyroggia) && "bg-green-50 text-primary",
          )}
        >
          <Checkbox checked={figlieSel.has(f.keyroggia)} className="pointer-events-none" />
          <span className="flex flex-col">
            <span className="font-semibold">{f.keyroggia}</span>
            <span className="text-[11px] text-gray-500">{f.name}</span>
          </span>
          <BadgeStato codice={f.keyroggia} livello="tratta" />
        </li>
      ))}
      {madriSel.size > 0 && figlieFiltrate.length === 0 && (
        <li className="px-3 py-6 text-center text-sm text-gray-400">Nessun risultato</li>
      )}
    </ul>
  );

  const toolbarFiglie = (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Tratte selezionate
        </h3>
        <span className="text-xs text-gray-400">
          {madriSel.size === 0
            ? "Nessuna madre selezionata"
            : `${figlieSel.size} / ${figlieFiltrate.length} selezionate`}
        </span>
      </div>
      {madriSel.size > 0 && (
        <div className="flex gap-3 text-xs mb-2">
          <button className="text-primary hover:underline" onClick={selectAllFiglie}>Seleziona tutti</button>
          <button className="text-primary hover:underline" onClick={deselectAllFiglie}>Deseleziona tutti</button>
        </div>
      )}
      <Input
        placeholder="Cerca codice..."
        value={searchFiglia}
        onChange={(e) => setSearchFiglia(e.target.value)}
        className="mb-3"
        disabled={madriSel.size === 0}
      />
      {madriConTratte.length > 0 && (
        <div className="border-2 border-primary/40 bg-green-50/60 rounded-lg p-2 mb-2">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-primary mb-1 px-1">
            {sezione === "impianti" ? "Tutto l'impianto" : "Tutta la roggia"}
          </h3>
          <ul className="divide-y divide-primary/15 max-h-40 overflow-y-auto scrollbar-visibile">
            {madriConTratte.map((m) => {
              const sueTratte = figlieInElenco.filter((f) => f.codicemadre === m);
              const tutteAccese = sueTratte.length > 0 && sueTratte.every((f) => figlieSel.has(f.keyroggia));
              return (
                <li
                  key={m}
                  onClick={() => toggleTratteMadre(m)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={keyActivate(() => toggleTratteMadre(m))}
                  className={cn(
                    "px-2 py-2 text-sm cursor-pointer hover:bg-green-100/60 rounded flex items-center gap-2",
                    tutteAccese && "text-primary font-semibold",
                  )}
                >
                  <Checkbox checked={tutteAccese} className="pointer-events-none" />
                  <span>Tutte le tratte di {m}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {listaFiglie}
    </>
  );

  // Quanti dei codici scelti sono già nello stato che la comunicazione
  // annuncia. Non blocca: ripetere una comunicazione è una scelta
  // dell'operatore. Ma «nessun errore» non deve voler dire «nessuno se ne
  // accorge» — una chiusura mandata due volte per distrazione è una mail in
  // più a tutti i conduttori di quella tratta.
  const giaNelloStato = useMemo(() => {
    if (tipo !== "apertura" && tipo !== "chiusura") return 0;
    const atteso = tipo === "apertura" ? "aperta" : "chiusa";
    const scelti = [
      ...selezione.tratte.map((c) => ({ codice: c, livello: "tratta" as const })),
      ...selezione.madri.map((c) => ({ codice: c, livello: "madre" as const })),
    ];
    return scelti.filter((s) =>
      risolviStato(s.codice, s.livello, stati, s.livello === "tratta" ? (madreDiTratta[s.codice] ?? null) : null).stato === atteso
    ).length;
  }, [tipo, selezione, stati, madreDiTratta]);

  return (
    <div className={cn("flex h-screen bg-gray-50", isMobile && "flex-col")}>
      <Sidebar />
      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-16 pb-20")}>
        <PageHeader title="Invia notifica" subtitle="Seleziona la sezione, le tratte e i conduttori da avvisare" />

        <div className={isMobile ? "p-4" : "p-6"}>
          {/* Quattro selettori distinti: Rogge Madri, Scorrimento, Impianti, Pozzi */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {SEZIONI.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => selectSezione(key)}
                aria-pressed={sezione === key}
                className={cn(
                  "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                  sezione === key
                    ? "border-primary text-primary bg-green-50"
                    : "border-gray-300 text-gray-500 hover:border-gray-400",
                )}
              >
                <Icon className="mx-auto mb-2" size={28} />
                <div className="font-bold text-gray-800">{label}</div>
              </button>
            ))}
          </div>

          {/* Classificazione della comunicazione (issue #13, vocabolario di #12).
              Sta qui in alto, prima ancora di scegliere le tratte, perché
              descrive l'evento: chi comunica una chiusura per inquinamento lo
              sa prima di sapere quali tratte toccherà. */}
          <Card className="mb-6">
            <CardContent className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Classificazione della comunicazione
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Tipo <span className="text-red-600">*</span>
                  </span>
                  <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNotifica)}>
                    <SelectTrigger className={cn(tipo === "" && "border-amber-500")}>
                      <SelectValue placeholder="Seleziona…" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPI_NOTIFICA.map((t) => (
                        <SelectItem key={t} value={t}>{ETICHETTE_TIPO[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Classificazione <span className="text-red-600">*</span>
                  </span>
                  <Select value={classificazione} onValueChange={(v) => setClassificazione(v as ClassificazioneNotifica)}>
                    <SelectTrigger className={cn(classificazione === "" && "border-amber-500")}>
                      <SelectValue placeholder="Seleziona…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICAZIONI_NOTIFICA.map((c) => (
                        <SelectItem key={c} value={c}>{ETICHETTE_CLASSIFICAZIONE[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
            </CardContent>
          </Card>

          {giaNelloStato > 0 && (
            <div className="mb-6 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {giaNelloStato === 1
                ? `1 delle voci selezionate risulta già ${tipo === "apertura" ? "aperta" : "chiusa"}.`
                : `${giaNelloStato} delle voci selezionate risultano già ${tipo === "apertura" ? "aperte" : "chiuse"}.`}
              {" "}La comunicazione parte lo stesso.
            </div>
          )}

          <div className={cn("grid grid-cols-1 gap-6 mb-6", catCorrente.mostraTratte && "lg:grid-cols-2")}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {/* In «Scorrimento» restano i soli codici IM (24/09/2026):
                        sono impianti, e la colonna si chiama così. */}
                    {sezione === "roggeMadri" ? "Roggia madre (codice R)"
                      : sezione === "pozzi" ? "Pozzo" : "Impianto"}
                  </h3>
                  <span className="text-xs text-gray-400">{madriSel.size} selezionate</span>
                </div>
                {/* Per i pozzi la scelta si ferma qui (issue #14): non si
                    mostrano le singole tratte, quindi va detto che cosa
                    comprende la selezione — altrimenti sembra incompleta.
                    Niente conteggio di tratte: per un pozzo questa pagina non le
                    conosce (issue #26), e un "0 tratte coinvolte" davanti a una
                    selezione valida si legge come un errore. Quanti conduttori
                    siano davvero lo dice la tabella qui sotto. */}
                {!catCorrente.mostraTratte && (
                  <p className="text-xs text-gray-500 mb-3">
                    La comunicazione vale per l'intero pozzo: le sue tratte non si scelgono una a una.
                    {madriSel.size > 0 &&
                      ` ${madriSel.size} ${madriSel.size === 1 ? "pozzo selezionato" : "pozzi selezionati"}.`}
                  </p>
                )}
                {/* Una colonna vuota senza spiegazione si legge come "il
                    consorzio non ha rogge madri" (issue #49): la gerarchia R
                    dipende da due web service distinti da quelli di rogge e
                    impianti, e può non essere ancora configurata.
                    Condizionato a `!roggeMadriInCaricamento`: ogni volta che si
                    entra in questa sezione (e a ogni refetch in background,
                    es. al ritorno di fuoco della finestra) l'elenco passa da
                    vuoto a pieno — senza questo controllo l'avviso "non
                    configurato" lampeggiava anche quando i web service lo
                    erano eccome, e i dati stavano solo ancora arrivando.
                    Mentre carica la colonna resta vuota e muta, come le altre
                    tre sezioni. */}
                {inGerarchiaRogge && !roggeMadriInCaricamento && roggeMadri.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                    Nessuna roggia madre caricata. I due web service delle rogge madri non sono
                    ancora configurati in Impostazioni → WebService.
                  </p>
                )}
                <Input placeholder="Cerca..." value={searchMadre} onChange={(e) => setSearchMadre(e.target.value)} className="mb-3" />
                <ul className="border rounded-lg max-h-64 overflow-y-auto divide-y scrollbar-visibile">
                  {madriFiltrate.map((m) => (
                    <li
                      key={m.codicemadre}
                      onClick={() => toggleMadre(m.codicemadre)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={keyActivate(() => toggleMadre(m.codicemadre))}
                      className={cn(
                        "px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 flex items-center gap-2",
                        madriSel.has(m.codicemadre) && "bg-green-50 text-primary font-semibold",
                      )}
                    >
                      <Checkbox checked={madriSel.has(m.codicemadre)} className="pointer-events-none" />
                      {/* Le madri di servizio («R29 — non classificata») non
                          arrivano più qui: le toglie `madriDellaSezione`. */}
                      <span>{`${m.codicemadre} — ${m.name}`}</span>
                      <BadgeStato codice={m.codicemadre} livello="madre" />
                    </li>
                  ))}
                  {madriFiltrate.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-gray-400">Nessun risultato</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {catCorrente.mostraTratte && (
              <Card>
                <CardContent className="p-5">{toolbarFiglie}</CardContent>
              </Card>
            )}
          </div>

          <div className="flex justify-end mb-6">
            <Button onClick={() => setDialogLegameOpen(true)} disabled={nienteSelezionato}>Mostra Conduttori</Button>
          </div>

          {/* Tabella conduttori + messaggio */}
          {rows && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conduttori</h3>
                  {legame && (
                    <>
                      <span className={cn("text-[11px] rounded px-1.5 py-0.5 font-medium", COLORI_LEGAME[legame])}>
                        Legame: {ETICHETTE_LEGAME[legame]}
                      </span>
                      <button className="text-xs text-primary hover:underline" onClick={() => setDialogLegameOpen(true)}>
                        Cambia
                      </button>
                    </>
                  )}
                </div>
                {/* Il conteggio è sempre sull'insieme intero, anche a ricerca
                    attiva: è l'unico posto in cui si vedono gli spuntati che il
                    filtro tiene nascosti. */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-700">{totNotificati}</span> di {sortedRows.length}{" "}
                    {sortedRows.length === 1 ? "conduttore riceverà" : "conduttori riceveranno"} la comunicazione
                    {totPec > 0 && (
                      <>
                        {" — "}
                        <span className="font-semibold text-purple-700">{totPec}</span> via PEC
                      </>
                    )}
                    {searchConduttore.trim() !== "" && ` — ${righeVisibili.length} in elenco per «${searchConduttore.trim()}»`}
                  </span>
                  <div className="flex gap-3 text-xs">
                    <button className="text-primary hover:underline" onClick={() => impostaInviaVisibili(true)}>
                      Seleziona tutti
                    </button>
                    <button className="text-primary hover:underline" onClick={() => impostaInviaVisibili(false)}>
                      Deseleziona tutti
                    </button>
                  </div>
                </div>
                <Input
                  placeholder="Cerca nome o email..."
                  value={searchConduttore}
                  onChange={(e) => setSearchConduttore(e.target.value)}
                  className="mb-3"
                />
                <div className="max-h-[420px] overflow-y-auto border rounded-lg scrollbar-visibile">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr>
                        {th("Inviare", "invia")}
                        {th("Destinatario", "descrizione")}
                        {th("Tratta", "tratte")}
                        {th("Numero", "cellulare")}
                        {th("Mail", "email")}
                        {th("Canali", "canale")}
                      </tr>
                    </thead>
                    <tbody>
                      {righeVisibili.map((r) => (
                        <tr key={r.conduttore.keykey} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <Checkbox checked={r.invia} onCheckedChange={(v) => toggleInvia(r.conduttore.keykey, Boolean(v))} />
                          </td>
                          <td className="px-3 py-2">{r.conduttore.descrizione}</td>
                          <td className="px-3 py-2 font-mono text-xs">{r.tratte}</td>
                          <td className="px-3 py-2">{r.conduttore.cellulare ?? <span className="text-gray-400">—</span>}</td>
                          <td className="px-3 py-2">{r.conduttore.email ?? <span className="text-gray-400">—</span>}</td>
                          {/* Tutti i canali che raggiungono questo contatto,
                              non solo la posta: da quale casella partirà la
                              mail e, se un numero c'è, l'SMS. Senza indirizzo
                              la mail non parte da nessuna delle due caselle —
                              il canale non è «Email», è «nessuno» — ma un
                              conduttore col solo numero resta raggiungibile,
                              ed è proprio quello che questa colonna deve dire
                              prima che si prema invio. */}
                          <td className="px-3 py-2">
                            <BadgeCanaliContatto
                              email={r.conduttore.email}
                              tipoEmail={r.conduttore.tipoEmail}
                              cellulare={r.conduttore.cellulare}
                              smsAttivo={inviaSms}
                            />
                          </td>
                        </tr>
                      ))}
                      {righeVisibili.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                          {sortedRows.length > 0
                            ? `Nessun conduttore corrisponde a «${searchConduttore.trim()}»`
                            : `Nessun conduttore con legame ${legame ? ETICHETTE_LEGAME[legame].toLowerCase() : ""} sulla selezione corrente`}
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Il titolo diventa l'oggetto della mail (issue #13): sta
                    subito prima del messaggio perché è la prima cosa che il
                    destinatario legge, e parte già compilato. */}
                <label className="flex flex-col gap-1 mt-5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Titolo della comunicazione
                  </span>
                  <Input
                    value={titolo}
                    onChange={(e) => setTitolo(e.target.value)}
                    placeholder={TITOLO_PREDEFINITO}
                  />
                </label>

                {/* Due riquadri distinti, mail e SMS (issue #28): la sezione
                    Template li tiene separati da sempre, e finché qui ce n'era
                    uno solo il `bodySms` del template caricato veniva buttato
                    via. Il testo SMS parte davvero, ma solo con la spunta
                    «Invia anche via SMS» qui sotto: senza, resta registrato. */}
                <div className="flex flex-col md:flex-row gap-3 mt-3">
                  <label className="flex flex-col gap-1 flex-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      Testo email
                    </span>
                    <Textarea
                      placeholder="Scrivi qui il testo della comunicazione..."
                      value={messaggio}
                      onChange={(e) => setMessaggio(e.target.value)}
                      className="min-h-28"
                    />
                  </label>
                  <div className="w-full md:w-64 md:mt-[22px]">
                    <Select disabled={templateOptions.length === 0} onValueChange={(id) => {
                      const t = templateOptions.find((o) => o.id === id);
                      if (!t) return;
                      setMessaggio(t.body);
                      if (t.oggetto) setTitolo(t.oggetto);
                      // Solo se il template ne ha uno, come già si fa con
                      // l'oggetto: un template senza testo SMS non deve
                      // cancellare quello appena scritto a mano.
                      if (t.sms) setMessaggioSms(t.sms);
                    }}>
                      <SelectTrigger>
                        <span className="inline-flex items-center gap-2"><FileText size={14} /><SelectValue placeholder={templateOptions.length ? "Carica template" : "Nessun template"} /></span>
                      </SelectTrigger>
                      <SelectContent>
                        {templateOptions.map((o) => (
                          <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <label className="flex flex-col gap-1 mt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Testo SMS
                  </span>
                  <Textarea
                    placeholder="Versione corta per l'SMS (facoltativa)..."
                    value={messaggioSms}
                    onChange={(e) => setMessaggioSms(e.target.value)}
                    className="min-h-20"
                  />
                  {/* Contatore indicativo, nessun blocco: 160 caratteri sono la
                      soglia GSM-7, ma `.length` conta unità UTF-16 e un
                      trattino lungo, virgolette curve o un'emoji la fanno
                      scendere a 70. Non si promette più "un SMS in più": si
                      dice solo che oltre soglia lo spezzettamento è possibile. */}
                  <span className={cn(
                    "text-[11px] self-end",
                    messaggioSms.length > 160 ? "text-amber-700" : "text-gray-400",
                  )}>
                    {messaggioSms.length}/160 caratteri
                    {messaggioSms.length > 160 && " — oltre 160 caratteri il messaggio può essere spezzato"}
                  </span>
                </label>

                {/* Spenta di default: un testo SMS scritto e poi ripensato non
                    deve diventare una spesa involontaria. Accesa, il testo
                    diventa obbligatorio. */}
                <label className="flex items-center gap-2 mt-1 cursor-pointer">
                  <Checkbox checked={inviaSms} onCheckedChange={(v) => setInviaSms(Boolean(v))} />
                  <span className="text-xs text-gray-700">
                    Invia anche via SMS
                    {inviaSms && (
                      <span className="text-gray-500">
                        {" "}— {totConNumero} destinatari su {totNotificati} hanno un numero
                      </span>
                    )}
                  </span>
                </label>

                {/* Il blocco sta qui e non solo nel riepilogo (issue #13): con
                    l'obbligo scoperto a popup aperto, si compila tutto e si
                    scopre il vincolo alla fine. La ragione è scritta accanto —
                    un bottone spento e muto è il modo più rapido per farsi
                    riaprire la issue. Il controllo dentro il dialogo resta:
                    è la rete se un domani il riepilogo si apre da altrove. */}
                <div className="flex items-center justify-end gap-3 mt-5">
                  {!classificazioneCompleta && (
                    <span className="text-xs text-amber-700">
                      Scegli Tipo e Classificazione
                    </span>
                  )}
                  {classificazioneCompleta && !testoCompleto && (
                    <span className="text-xs text-amber-700">
                      {inviaSms && titolo.trim() !== "" && messaggio.trim() !== ""
                        ? "Scrivi il testo SMS"
                        : "Scrivi titolo e messaggio"}
                    </span>
                  )}
                  {/* Il secondo caso conta quanto il primo: chi manda una
                      comunicazione vera deve sapere che ne parte una copia
                      altrove. */}
                  {utentiTestRaggiungibili.length > 0 && (
                    <span className="text-xs text-amber-700">
                      {totNotificati === 0
                        ? `Nessun conduttore selezionato: la comunicazione partirà ai soli ${utentiTestRaggiungibili.length} utenti di test (${utentiTestRaggiungibili.map((u) => u.nome).join(", ")})`
                        : `Più ${utentiTestRaggiungibili.length} utenti di test in copia (${utentiTestRaggiungibili.map((u) => u.nome).join(", ")})`}
                    </span>
                  )}
                  <Button
                    onClick={() => setRiepilogoOpen(true)}
                    disabled={
                      mancanoDestinatari({ conduttori: totNotificati, utentiTestAttivi: utentiTestRaggiungibili.length }) ||
                      !classificazioneCompleta ||
                      !testoCompleto
                    }
                  >
                    Invia notifica
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Scelta del legame (issue #27): step obbligatorio fra la selezione
          delle tratte e l'elenco dei conduttori. Nessuna opzione
          preselezionata — con un default si conferma senza leggere, e qui la
          scelta decide chi riceve la comunicazione. */}
      <Dialog open={dialogLegameOpen} onOpenChange={setDialogLegameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Con quale legame?</DialogTitle>
            <DialogDescription>
              Il consorzio lega i conduttori alle tratte in due modi distinti. Scegline uno:
              la comunicazione andrà ai conduttori di quell'elenco soltanto.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {TIPI_LEGAME.map((t) => (
              <button
                key={t}
                onClick={() => scegliLegame(t)}
                className={cn(
                  "rounded-lg border-2 p-4 text-left transition-colors",
                  "border-gray-300 hover:border-primary hover:bg-green-50",
                  legame === t && "border-primary bg-green-50",
                )}
              >
                <div className="font-semibold text-gray-800">
                  Legame {ETICHETTE_LEGAME[t].toLowerCase()}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{descrizioneLegame(t)}</div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogLegameOpen(false)}>Annulla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modale riepilogo */}
      {/* A invio partito la modale non si chiude: chi la chiudesse a metà
          crederebbe di aver annullato qualcosa che sta già uscendo. */}
      <Dialog open={riepilogoOpen} onOpenChange={(aperto) => { if (!invio.isPending) setRiepilogoOpen(aperto); }}>
        {/* Il riepilogo non deve mai superare lo schermo: con molte tratte
            selezionate cresceva a piacere e il footer finiva fuori dalla
            finestra, rendendo l'invio impossibile (issue #34). Altezza
            massima sulla modale, e a scorrere e' il solo corpo centrale,
            cosi' titolo e bottoni restano sempre visibili. */}
        <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader>
            <DialogTitle>Riepilogo invio notifica</DialogTitle>
            <DialogDescription>Controlla i dati prima di confermare l'invio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm overflow-y-auto pr-1 scrollbar-visibile">
            <div className="border-b pb-2">
              <div className="text-gray-500 mb-1">Titolo</div>
              <div className="font-medium text-gray-800">
                {titolo.trim() || <span className="text-gray-400">(nessun titolo)</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tipo && (
                  <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium", COLORI_TIPO[tipo])}>
                    {ETICHETTE_TIPO[tipo]}
                  </span>
                )}
                {classificazione && (
                  <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium", COLORI_CLASSIFICAZIONE[classificazione])}>
                    {ETICHETTE_CLASSIFICAZIONE[classificazione]}
                  </span>
                )}
                {!tipo && !classificazione && (
                  <span className="text-xs text-gray-400">Comunicazione non classificata</span>
                )}
              </div>
            </div>
            <div className="border-b pb-2">
              <div className="text-gray-500 mb-1">Codici interessati</div>
              {/* Spazio fisso per una ventina di codici: oltre si scorre,
                  cosi' la modale ha sempre la stessa altezza. */}
              <div className="flex flex-wrap gap-1.5 max-h-[7.5rem] overflow-y-auto scrollbar-visibile">
                {codiciSelezionati.map(({ codice, tutte }) => (
                  <span key={codice} className="font-mono text-xs bg-gray-100 border rounded px-1.5 py-0.5">
                    {codice}
                    {tutte && <span className="ml-1 font-sans text-[10px] text-primary">(tutte)</span>}
                  </span>
                ))}
                {codiciSelezionati.length === 0 && <span className="text-gray-400">—</span>}
              </div>
            </div>
            {/* Requisito esplicito della issue #27: chi conferma deve avere
                chiaro con quale legame sta spedendo. */}
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-500">Tipo di legame</span>
              {legame ? (
                <span className={cn("text-xs rounded px-1.5 py-0.5 font-medium", COLORI_LEGAME[legame])}>
                  {ETICHETTE_LEGAME[legame]}
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
            {/* Chi conferma deve sapere a quando risalgono i contatti che sta
                per usare: è l'ultimo momento utile per annullare e aggiornare. */}
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Dati del consorzio aggiornati al</span>
              <span className={cn("font-medium", sync.freschezza.stato !== "fresco" && "text-amber-700")}>
                {sync.freschezza.quando}
              </span>
            </div>
            <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Utenti associati</span><span className="font-medium">{rows?.length ?? 0}</span></div>
            <div className="flex justify-between border-b pb-2"><span className="text-gray-500">Utenti da notificare</span><span className="font-medium">{totNotificati}</span></div>
            {utentiTestRaggiungibili.length > 0 && (
              <div className="text-xs text-amber-700">
                {totNotificati === 0
                  ? `Solo utenti di test: ${utentiTestRaggiungibili.map((u) => u.nome).join(", ")}`
                  : `Più ${utentiTestRaggiungibili.length} utenti di test in copia: ${utentiTestRaggiungibili.map((u) => u.nome).join(", ")}`}
              </div>
            )}
            <div className="pt-1 text-gray-500">Messaggio</div>
            <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-gray-800">{messaggio.trim() || "(nessun messaggio inserito)"}</div>
            {/* Solo se c'è: un riquadro perennemente «(nessun testo)»
                insegnerebbe a saltare il riepilogo, che è l'ultima occasione
                per annullare. */}
            {messaggioSms.trim() !== "" && (
              <>
                <div className="pt-1 text-gray-500 flex items-baseline justify-between gap-2">
                  <span>Testo SMS</span>
                  {inviaSms ? (
                    <span className="text-[11px] text-gray-800 font-medium">
                      parte a {totConNumero} destinatari su {totNotificati}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400 font-normal">non verrà spedito, solo registrato</span>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-gray-800">{messaggioSms.trim()}</div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRiepilogoOpen(false)} disabled={invio.isPending}>
              Annulla
            </Button>
            {!classificazioneCompleta && (
              <span className="text-xs text-amber-700 mr-2 self-center">
                Scegli Tipo e Classificazione per procedere
              </span>
            )}
            <Button
              onClick={confermaInvio}
              disabled={!classificazioneCompleta || !testoCompleto || invio.isPending}
            >
              {invio.isPending ? "Invio in corso…" : "Conferma invio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
