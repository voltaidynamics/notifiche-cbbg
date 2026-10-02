import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { BadgeCanale } from "@/components/badge-canale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Download, ArrowUpDown } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import {
  TIPI_NOTIFICA, CLASSIFICAZIONI_NOTIFICA,
  ETICHETTE_TIPO, ETICHETTE_CLASSIFICAZIONE,
  COLORI_TIPO, COLORI_CLASSIFICAZIONE,
} from "@shared/classificazione";
import { ETICHETTE_LEGAME, COLORI_LEGAME } from "@shared/legame";
import type { NotificationHistoryFilters, NotificationHistoryRow } from "@shared/schema";

type SortKey = "codice" | "utente" | "data" | "numRogge" | "numDestinatari" | "tipo" | "classificazione" | "legame";

const FILTRI_VUOTI: NotificationHistoryFilters = {
  utente: "",
  dataInizio: "",
  dataFine: "",
  roggia: "",
  tipo: "",
  classificazione: "",
  destinatario: "",
};

// Il Select di shadcn non accetta value="" per l'opzione "tutti".
const TUTTI = "__tutti__";

const etichetta = (mappa: Record<string, string>, v: string) => mappa[v] ?? v;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Campo CSV con escaping di virgolette, virgole e a capo. */
function csvField(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function scaricaCsv(nomeFile: string, righe: (string | number | null)[][]) {
  const csv = righe.map((r) => r.map(csvField).join(",")).join("\n");
  // BOM: senza, Excel in italiano apre il CSV con gli accenti sbagliati.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeFile;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Notifications() {
  const isMobile = useIsMobile();

  // Bozza dei filtri (quello che l'utente sta scrivendo) vs filtri applicati
  // (quelli che alimentano la query): la ricerca parte con "Applica filtri".
  const [bozza, setBozza] = useState<NotificationHistoryFilters>(FILTRI_VUOTI);
  const [applicati, setApplicati] = useState<NotificationHistoryFilters>(FILTRI_VUOTI);
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortAsc, setSortAsc] = useState(false);
  const [dettaglioId, setDettaglioId] = useState<number | null>(null);

  const { data: righe = [], isLoading } = useQuery({
    queryKey: ["/api/notifications/storico", applicati],
    queryFn: () => notificationsApi.getStorico(applicati),
  });

  // L'elenco utenti del filtro si popola dai dati effettivamente presenti.
  const { data: storicoCompleto = [] } = useQuery({
    queryKey: ["/api/notifications/storico", FILTRI_VUOTI],
    queryFn: () => notificationsApi.getStorico({}),
  });

  const { data: dettaglio } = useQuery({
    queryKey: ["/api/notifications/storico/dettaglio", dettaglioId],
    queryFn: () => notificationsApi.getStoricoDetail(dettaglioId as number),
    enabled: dettaglioId !== null,
  });

  const utenti = useMemo(() => {
    return Array.from(new Set(storicoCompleto.map((r) => r.utente).filter((u): u is string => !!u))).sort();
  }, [storicoCompleto]);

  const righeOrdinate = useMemo(() => {
    const val = (r: NotificationHistoryRow): string | number => {
      switch (sortKey) {
        case "codice": return r.codice;
        case "utente": return (r.utente ?? "").toLowerCase();
        case "data": return r.data;
        case "numRogge": return r.numRogge;
        case "numDestinatari": return r.numDestinatari;
        case "tipo": return r.tipo;
        case "classificazione": return r.classificazione;
        case "legame": return r.legame ?? "";
      }
    };
    return [...righe].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [righe, sortKey, sortAsc]);

  const setSort = (k: SortKey) => {
    if (sortKey === k) setSortAsc((s) => !s);
    else { setSortKey(k); setSortAsc(true); }
  };

  const setCampo = (campo: keyof NotificationHistoryFilters) =>
    (valore: string) => setBozza((b) => ({ ...b, [campo]: valore }));

  const resetta = () => {
    setBozza(FILTRI_VUOTI);
    setApplicati(FILTRI_VUOTI);
  };

  const esportaCsv = () => {
    scaricaCsv("storico_notifiche.csv", [
      ["ID Notifica", "Utente", "Data e ora", "N° Tratte", "N° Destinatari", "Tipo", "Classificazione", "Legame", "Prova"],
      ...righeOrdinate.map((r) => [
        r.codice, r.utente, formatDateTime(r.data), r.numRogge, r.numDestinatari,
        etichetta(ETICHETTE_TIPO, r.tipo), etichetta(ETICHETTE_CLASSIFICAZIONE, r.classificazione),
        r.legame === null ? "" : etichetta(ETICHETTE_LEGAME, r.legame),
        r.prova ? "Si" : "No",
      ]),
    ]);
  };

  const esportaDettaglioCsv = () => {
    if (!dettaglio) return;
    scaricaCsv(`dettaglio_${dettaglio.codice}.csv`, [
      ["ID Notifica", "Utente", "Data", "Tipo", "Classificazione", "Legame", "Codice Conduttore", "Descrizione Conduttore",
        "Codice Roggia", "Descrizione Roggia", "SMS", "Mail", "Canale", "Utente di test"],
      ...dettaglio.destinatari.map((d) => [
        dettaglio.codice, dettaglio.utente, formatDateTime(dettaglio.data),
        etichetta(ETICHETTE_TIPO, dettaglio.tipo), etichetta(ETICHETTE_CLASSIFICAZIONE, dettaglio.classificazione),
        dettaglio.legame === null ? "" : etichetta(ETICHETTE_LEGAME, dettaglio.legame),
        d.codiceConduttore, d.descrizioneConduttore, d.codiceRoggia, d.descrizioneRoggia, d.sms, d.mail, d.canale,
        d.utenteTest ? "Si" : "No",
      ]),
    ]);
  };

  const attiva = (fn: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
  };

  const th = (label: string, key: SortKey) => (
    <th
      className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-3 border-b-2 bg-white cursor-pointer select-none hover:bg-gray-50"
      onClick={() => setSort(key)}
      role="button"
      tabIndex={0}
      onKeyDown={attiva(() => setSort(key))}
      aria-sort={sortKey === key ? (sortAsc ? "ascending" : "descending") : "none"}
    >
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown size={11} /></span>
    </th>
  );

  const badge = (valore: string, colori: Record<string, string>, etichette: Record<string, string>) => (
    <span className={cn(
      "inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
      colori[valore] ?? "bg-gray-100 text-gray-600",
    )}>
      {etichetta(etichette, valore)}
    </span>
  );

  const badgeTipo = (v: string) => badge(v, COLORI_TIPO, ETICHETTE_TIPO);
  const badgeClassificazione = (v: string) => badge(v, COLORI_CLASSIFICAZIONE, ETICHETTE_CLASSIFICAZIONE);
  // Null sulle notifiche partite prima della scelta del legame (issue #27).
  const badgeLegame = (v: string | null) =>
    v === null ? <span className="text-gray-400">—</span> : badge(v, COLORI_LEGAME, ETICHETTE_LEGAME);

  return (
    <div className={cn("flex h-screen bg-gray-50", isMobile && "flex-col")}>
      <Sidebar />
      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-16 pb-20")}>
        <PageHeader
          title="Storico Notifiche"
          subtitle="Tutte le comunicazioni inviate, con il dettaglio dei destinatari"
        />

        <div className={isMobile ? "p-4" : "p-6"}>
          {/* FILTRI */}
          <Card className="mb-5">
            <CardContent className="p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Filtri di ricerca</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Utente</span>
                  <Select
                    value={bozza.utente || TUTTI}
                    onValueChange={(v) => setCampo("utente")(v === TUTTI ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TUTTI}>Tutti</SelectItem>
                      {utenti.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data inizio</span>
                  <Input type="date" value={bozza.dataInizio} onChange={(e) => setCampo("dataInizio")(e.target.value)} />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Data fine</span>
                  <Input type="date" value={bozza.dataFine} onChange={(e) => setCampo("dataFine")(e.target.value)} />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tratta</span>
                  <Input placeholder="Codice o descrizione..." value={bozza.roggia} onChange={(e) => setCampo("roggia")(e.target.value)} />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Tipo</span>
                  <Select
                    value={bozza.tipo || TUTTI}
                    onValueChange={(v) => setCampo("tipo")(v === TUTTI ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TUTTI}>Tutti</SelectItem>
                      {TIPI_NOTIFICA.map((t) => (
                        <SelectItem key={t} value={t}>{ETICHETTE_TIPO[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Classificazione</span>
                  <Select
                    value={bozza.classificazione || TUTTI}
                    onValueChange={(v) => setCampo("classificazione")(v === TUTTI ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Tutte" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={TUTTI}>Tutte</SelectItem>
                      {CLASSIFICAZIONI_NOTIFICA.map((c) => (
                        <SelectItem key={c} value={c}>{ETICHETTE_CLASSIFICAZIONE[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Destinatario</span>
                  <Input placeholder="Cerca destinatario..." value={bozza.destinatario} onChange={(e) => setCampo("destinatario")(e.target.value)} />
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={resetta}>Resetta</Button>
                <Button onClick={() => setApplicati(bozza)}>Applica filtri</Button>
              </div>
            </CardContent>
          </Card>

          {/* TABELLA */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Notifiche inviate
                </h3>
                <Button variant="outline" size="sm" onClick={esportaCsv} disabled={righeOrdinate.length === 0}>
                  <Download size={14} className="mr-1.5" />Esporta CSV
                </Button>
              </div>

              <div className="max-h-[500px] overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {th("ID Notifica", "codice")}
                      {th("Utente", "utente")}
                      {th("Data e ora", "data")}
                      {th("N° Tratte", "numRogge")}
                      {th("N° Destinatari", "numDestinatari")}
                      {th("Tipo", "tipo")}
                      {th("Classificazione", "classificazione")}
                      {th("Legame", "legame")}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Caricamento…</td></tr>
                    )}
                    {!isLoading && righeOrdinate.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setDettaglioId(r.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={attiva(() => setDettaglioId(r.id))}
                        className="border-b last:border-0 cursor-pointer hover:bg-blue-50/50"
                      >
                        <td className="px-3 py-2 font-semibold">
                          {r.codice}
                          {/* Il badge sta sul codice e non in una colonna sua:
                              una comunicazione di prova e' una proprieta' della
                              riga, non un dato da ordinare o filtrare. */}
                          {r.prova && (
                            <span className="ml-2 text-[11px] rounded px-1.5 py-0.5 font-medium bg-amber-100 text-amber-800">
                              Prova
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{r.utente ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-2">{formatDateTime(r.data)}</td>
                        <td className="px-3 py-2">{r.numRogge}</td>
                        <td className="px-3 py-2">{r.numDestinatari}</td>
                        <td className="px-3 py-2">{badgeTipo(r.tipo)}</td>
                        <td className="px-3 py-2">{badgeClassificazione(r.classificazione)}</td>
                        <td className="px-3 py-2">{badgeLegame(r.legame)}</td>
                      </tr>
                    ))}
                    {!isLoading && righeOrdinate.length === 0 && (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Nessuna notifica trovata</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-xs text-gray-500">{righeOrdinate.length} record</div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* MODALE DETTAGLIO (ESC chiude: gestito da Dialog) */}
      <Dialog open={dettaglioId !== null} onOpenChange={(open) => !open && setDettaglioId(null)}>
        {/* Da telefono il dettaglio è più alto e più largo dello schermo: il
            riquadro scorre per conto suo e resta staccato dai bordi (issue #90). */}
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Dettaglio notifica</DialogTitle>
            <DialogDescription>Messaggio inviato e destinatari raggiunti da questa comunicazione.</DialogDescription>
          </DialogHeader>

          {!dettaglio && <div className="py-8 text-center text-gray-400">Caricamento…</div>}

          {dettaglio && (
            <div className="space-y-3 min-w-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-gray-50 rounded-lg p-3">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">ID Notifica</span>
                  <span className="text-sm font-medium">{dettaglio.codice}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Utente</span>
                  <span className="text-sm font-medium">{dettaglio.utente ?? "—"}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Data e ora</span>
                  <span className="text-sm font-medium">{formatDateTime(dettaglio.data)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Tipo</span>
                  <span className="mt-0.5">{badgeTipo(dettaglio.tipo)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Classificazione</span>
                  <span className="mt-0.5">{badgeClassificazione(dettaglio.classificazione)}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Legame</span>
                  <span className="mt-0.5">{badgeLegame(dettaglio.legame)}</span>
                </div>
              </div>

              {/* Il messaggio realmente spedito per questa notifica: richiesto
                  dal tester in issue #12. Scorre per conto suo, così un testo
                  lungo non spinge fuori schermo l'elenco dei destinatari. */}
              <div className="border rounded-lg p-3">
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Oggetto</span>
                <p className="text-sm font-medium mb-3 break-words">{dettaglio.subject}</p>
                <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Messaggio inviato</span>
                <div className="mt-1 max-h-[160px] overflow-y-auto text-sm whitespace-pre-wrap text-gray-700">
                  {dettaglio.messaggio || <span className="text-gray-400">—</span>}
                </div>

                {/* Solo se c'è: resta null sulle notifiche precedenti al testo
                    SMS e su tutte quelle dei percorsi legacy (issue #28). */}
                {dettaglio.messaggioSms && (
                  <>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mt-3 block">Testo SMS</span>
                    <div className="mt-1 max-h-[160px] overflow-y-auto text-sm whitespace-pre-wrap text-gray-700">
                      {dettaglio.messaggioSms}
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={esportaDettaglioCsv} disabled={dettaglio.destinatari.length === 0}>
                  <Download size={14} className="mr-1.5" />Esporta dettaglio CSV
                </Button>
              </div>

              <div className="max-h-[250px] sm:max-h-[350px] overflow-auto border rounded-lg">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>
                      {["Codice Conduttore", "Descrizione Conduttore", "Codice Roggia", "Descrizione Roggia", "SMS", "Mail", "Canale"].map((h) => (
                        <th key={h} className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-2 border-b">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dettaglio.destinatari.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="px-3 py-2 font-semibold font-mono text-xs">{d.codiceConduttore ?? "—"}</td>
                        <td className="px-3 py-2">
                          {d.descrizioneConduttore ?? "—"}
                          {/* Senza, a distanza di mesi una comunicazione di
                              collaudo sembra una comunicazione vera andata a
                              tre persone sole. */}
                          {d.utenteTest && (
                            <span className="ml-2 text-[11px] rounded px-1.5 py-0.5 font-medium bg-amber-100 text-amber-800">
                              Test
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{d.codiceRoggia ?? "—"}</td>
                        <td className="px-3 py-2">{d.descrizioneRoggia ?? "—"}</td>
                        <td className="px-3 py-2">{d.sms ?? <span className="text-gray-400">—</span>}</td>
                        <td className="px-3 py-2">{d.mail ?? <span className="text-gray-400">—</span>}</td>
                        {/* Per una PEC «da quale casella è partita» è la domanda
                            che conta: resta "—" sulle notifiche precedenti ai
                            due canali, che nessuno ha registrato. */}
                        <td className="px-3 py-2">
                          <BadgeCanale canale={d.canale === "pec" || d.canale === "normale" ? d.canale : null} />
                        </td>
                      </tr>
                    ))}
                    {dettaglio.destinatari.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                        Nessun destinatario registrato per questa notifica
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
