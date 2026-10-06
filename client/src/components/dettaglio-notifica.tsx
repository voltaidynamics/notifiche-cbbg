/**
 * Il popup «Dettaglio notifica» dello Storico (issue #12), condiviso con la
 * Dashboard: dalla issue #111 il box «Ultime notifiche» apre questo stesso
 * popup e non più una pagina `/notifiche/:id` a sé, che è stata tolta. Uno
 * solo, perché due dettagli della stessa notifica divergerebbero alla prima
 * colonna aggiunta.
 */
import { useQuery } from "@tanstack/react-query";
import { BadgeCanale } from "@/components/badge-canale";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { notificationsApi } from "@/lib/api";
import {
  ETICHETTE_TIPO, ETICHETTE_CLASSIFICAZIONE,
  COLORI_TIPO, COLORI_CLASSIFICAZIONE,
} from "@shared/classificazione";
import { ETICHETTE_LEGAME, COLORI_LEGAME } from "@shared/legame";
import type { EsitoInvio } from "@shared/schema";

export const etichetta = (mappa: Record<string, string>, v: string) => mappa[v] ?? v;

export function formatDateTime(iso: string): string {
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

export function scaricaCsv(nomeFile: string, righe: (string | number | null)[][]) {
  const csv = righe.map((r) => r.map(csvField).join(",")).join("\n");
  // BOM: senza, Excel in italiano apre il CSV con gli accenti sbagliati.
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeFile;
  link.click();
  URL.revokeObjectURL(url);
}

const badge = (valore: string, colori: Record<string, string>, etichette: Record<string, string>) => (
  <span className={cn(
    "inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold",
    colori[valore] ?? "bg-gray-100 text-gray-600",
  )}>
    {etichetta(etichette, valore)}
  </span>
);

export const badgeTipo = (v: string) => badge(v, COLORI_TIPO, ETICHETTE_TIPO);
export const badgeClassificazione = (v: string) => badge(v, COLORI_CLASSIFICAZIONE, ETICHETTE_CLASSIFICAZIONE);
// Null sulle notifiche partite prima della scelta del legame (issue #27).
export const badgeLegame = (v: string | null) =>
  v === null ? <span className="text-gray-400">—</span> : badge(v, COLORI_LEGAME, ETICHETTE_LEGAME);

// «Inviata» = accettata dal server SMTP o dalla piattaforma SMS, non consegnata
// né letta: è tutto quello che l'app sa (issue #111).
const ESITO: Record<EsitoInvio, { email: string; sms: string; colore: string }> = {
  inviato: { email: "Inviata", sms: "Inviato", colore: "text-green-700" },
  nonInviato: { email: "Non inviata", sms: "Non inviato", colore: "text-red-600 font-semibold" },
  inAttesa: { email: "In attesa", sms: "In attesa", colore: "text-gray-500" },
};

function Esito({ esito, canale }: { esito: EsitoInvio | null; canale: "email" | "sms" }) {
  if (esito === null) return <span className="text-gray-400">—</span>;
  return <span className={ESITO[esito].colore}>{ESITO[esito][canale]}</span>;
}

/** `notificaId` null = popup chiuso. ESC e il clic fuori chiudono: li gestisce Dialog. */
export function DettaglioNotifica({ notificaId, onClose }: { notificaId: number | null; onClose: () => void }) {
  const { data: dettaglio } = useQuery({
    queryKey: ["/api/notifications/storico/dettaglio", notificaId],
    queryFn: () => notificationsApi.getStoricoDetail(notificaId as number),
    enabled: notificaId !== null,
    // Il default dell'app è non rileggere mai (`staleTime: Infinity`), e qui
    // vorrebbe dire contatori fermi al primo sguardo: riaprendo si rilegge, e
    // finché la spedizione è in corso (mail e poi SMS, uno alla volta) si
    // rilegge da solo. Una spedizione interrotta da un riavvio resta
    // «sending» per sempre: costa una richiesta ogni 3 secondi, solo a popup
    // aperto.
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: (query) => (query.state.data?.inCorso ? 3000 : false),
  });

  const esportaDettaglioCsv = () => {
    if (!dettaglio) return;
    scaricaCsv(`dettaglio_${dettaglio.codice}.csv`, [
      ["ID Notifica", "Utente", "Data", "Tipo", "Classificazione", "Legame", "Codice Conduttore", "Descrizione Conduttore",
        "Codice Roggia", "Descrizione Roggia", "SMS", "Mail", "Canale", "Utente di test",
        "Esito email", "Esito SMS"],
      ...dettaglio.destinatari.map((d) => [
        dettaglio.codice, dettaglio.utente, formatDateTime(dettaglio.data),
        etichetta(ETICHETTE_TIPO, dettaglio.tipo), etichetta(ETICHETTE_CLASSIFICAZIONE, dettaglio.classificazione),
        dettaglio.legame === null ? "" : etichetta(ETICHETTE_LEGAME, dettaglio.legame),
        d.codiceConduttore, d.descrizioneConduttore, d.codiceRoggia, d.descrizioneRoggia, d.sms, d.mail, d.canale,
        d.utenteTest ? "Si" : "No",
        ESITO[d.esitoEmail].email, d.esitoSms === null ? "" : ESITO[d.esitoSms].sms,
      ]),
    ]);
  };

  return (
    <Dialog open={notificaId !== null} onOpenChange={(open) => !open && onClose()}>
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Quanti messaggi l'app ha passato al server, non quanti sono
                  arrivati: consegna e apertura non si tracciano (issue #111). */}
              <div className="text-sm text-gray-700">
                <span className="font-semibold">{dettaglio.emailInviate}</span> email inviate
                {" "}su {dettaglio.destinatari.length}
                {" · "}
                <span className="font-semibold">{dettaglio.smsInviati}</span> SMS inviati
              </div>
              <Button variant="outline" size="sm" onClick={esportaDettaglioCsv} disabled={dettaglio.destinatari.length === 0}>
                <Download size={14} className="mr-1.5" />Esporta dettaglio CSV
              </Button>
            </div>

            <div className="max-h-[250px] sm:max-h-[350px] overflow-auto border rounded-lg">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    {["Codice Conduttore", "Descrizione Conduttore", "Codice Roggia", "Descrizione Roggia", "SMS", "Esito SMS", "Mail", "Esito email", "Canale"].map((h) => (
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
                      <td className="px-3 py-2 whitespace-nowrap"><Esito esito={d.esitoSms} canale="sms" /></td>
                      <td className="px-3 py-2">{d.mail ?? <span className="text-gray-400">—</span>}</td>
                      <td className="px-3 py-2 whitespace-nowrap"><Esito esito={d.esitoEmail} canale="email" /></td>
                      {/* Per una PEC «da quale casella è partita» è la domanda
                          che conta: resta "—" sulle notifiche precedenti ai
                          due canali, che nessuno ha registrato. */}
                      <td className="px-3 py-2">
                        <BadgeCanale canale={d.canale === "pec" || d.canale === "normale" ? d.canale : null} />
                      </td>
                    </tr>
                  ))}
                  {dettaglio.destinatari.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">
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
  );
}
