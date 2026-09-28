import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart } from "@/components/bar-chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ArrowRight, Clock } from "lucide-react";
import { notificationsApi, consorzioApi } from "@/lib/api";
import type { StatoCodice } from "@shared/stato-rogge";

// --- Dati di esempio --------------------------------------------------------
// Usati solo quando il DB è vuoto, per mostrare come si presentano le sezioni.
// Dati di esempio, usati solo quando nessuna comunicazione ha ancora chiuso
// niente. Hanno la forma vera della risposta e non righe già pronte: quando
// erano righe pronte sparivano al primo filtro, e ogni ricerca sembrava rotta.
const ESEMPIO_TRATTE_CHIUSE: StatoCodice[] = [
  { codice: "R02D01000", livello: "tratta", descrizione: "Molinara - derivazione 01", stato: "chiusa", chiusaDal: "2026-07-22T08:10:00Z", notificaId: null, chiusaDaCodice: "R02D01000" },
  { codice: "R01D02000", livello: "tratta", descrizione: "Roggia Comuna - tratto valle", stato: "chiusa", chiusaDal: "2026-07-20T15:40:00Z", notificaId: null, chiusaDaCodice: "R01D02000" },
  { codice: "S02DA0004", livello: "tratta", descrizione: "Consegna Adda 0004", stato: "chiusa", chiusaDal: "2026-07-18T09:05:00Z", notificaId: null, chiusaDaCodice: "S02DA0004" },
  { codice: "R10DA0001", livello: "tratta", descrizione: "Pozzo bresciana - consegna 01", stato: "chiusa", chiusaDal: "2026-07-15T11:30:00Z", notificaId: null, chiusaDaCodice: "IM27A" },
];

const ESEMPIO_NOTIFICHE = [
  { id: -1, subject: "Chiusura tratta R02D01000", sentAt: "2026-07-23T07:45:00Z", recipientCount: 14 },
  { id: -2, subject: "Manutenzione programmata impianto Adda", sentAt: "2026-07-22T16:20:00Z", recipientCount: 31 },
  { id: -3, subject: "Riapertura Roggia Comuna", sentAt: "2026-07-21T09:00:00Z", recipientCount: 8 },
  { id: -4, subject: "Riduzione portata Serio 45", sentAt: "2026-07-19T14:10:00Z", recipientCount: 22 },
  { id: -5, subject: "Comunicazione urgente Molinara", sentAt: "2026-07-17T06:55:00Z", recipientCount: 47 },
  { id: -6, subject: "Chiusura straordinaria S02DA0003", sentAt: "2026-07-15T18:30:00Z", recipientCount: 12 },
];

const ESEMPIO_CHART_TRATTE = [3, 4, 3, 5, 6, 5, 4, 6, 7, 6, 5, 4, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 4, 5, 6, 7, 8, 9, 7];
const ESEMPIO_CHART_NOTIFICHE = [10, 12, 9, 14, 15, 13, 11, 16, 18, 17, 14, 12, 10, 11, 13, 15, 17, 19, 18, 16, 14, 12, 10, 11, 13, 15, 17, 19, 21, 18];

// Etichette asse X nel formato richiesto dalla issue #13: "15-jul".
const MESI_ABBR = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const GIORNI = 30;

function ultimiGiorni(n: number): Date[] {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(oggi);
    d.setDate(d.getDate() - (n - 1 - i));
    return d;
  });
}

function etichettaGiorno(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}-${MESI_ABBR[d.getMonth()]}`;
}

/** Conta quanti elementi cadono in ciascuno degli ultimi `giorni.length` giorni. */
function conteggioPerGiorno(giorni: Date[], date: (Date | string | null | undefined)[]): number[] {
  const indice = new Map(giorni.map((g, i) => [g.toDateString(), i]));
  const out = new Array(giorni.length).fill(0);
  for (const raw of date) {
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const i = indice.get(d.toDateString());
    if (i !== undefined) out[i] += 1;
  }
  return out;
}

export default function Dashboard() {
  const isMobile = useIsMobile();

  const { data: stato } = useQuery({
    queryKey: ["/api/consorzio/stato-rogge"],
    queryFn: () => consorzioApi.getStatoRogge(),
  });
  const { data: notifications = [] } = useQuery({ queryKey: ["/api/notifications"], queryFn: () => notificationsApi.getAll() });
  const { data: roggeMadri = [] } = useQuery({
    queryKey: ["/api/consorzio/rogge-madri"],
    queryFn: () => consorzioApi.getRoggeMadri(),
  });

  // Una riga per tratta, comprese le figlie di una madre chiusa (issue #58):
  // l'espansione la fa il server, che ha il registro.
  const chiuseReali = stato?.tratteChiuse ?? [];
  const usaEsempioChiuse = chiuseReali.length === 0;
  const chiuse = usaEsempioChiuse ? ESEMPIO_TRATTE_CHIUSE : chiuseReali;

  // Nome per codicemadre: la colonnina sotto ogni tratta chiusa.
  const nomiRoggeMadri = useMemo(() => {
    const per: Record<string, string> = {};
    roggeMadri.forEach((m) => { per[m.codicemadre] = m.name; });
    return per;
  }, [roggeMadri]);

  // La roggia madre di un codice chiuso: il prefisso a 3, **cercato fra le
  // rogge madri che esistono**. Non è la regola vietata altrove — quella
  // riguarda l'impianto IM di una tratta R, che il prefisso non predice. Qui
  // si risponde a un'altra domanda, e se il prefisso non è in elenco non si
  // attribuisce niente.
  const nomeRoggiaMadre = (codice: string): string | null => nomiRoggeMadri[codice.slice(0, 3)] ?? null;

  const usaEsempioNotifiche = notifications.length === 0;
  const ultimeNotifiche = usaEsempioNotifiche ? ESEMPIO_NOTIFICHE : notifications.slice(0, 6);

  const giorni = ultimiGiorni(GIORNI);
  const etichette = giorni.map(etichettaGiorno);

  const serieChiusureReale = conteggioPerGiorno(giorni, stato?.chiusure ?? []);
  const serieNotificheReale = conteggioPerGiorno(giorni, notifications.map((n) => n.sentAt ?? n.createdAt));
  const serieChiusure = serieChiusureReale.some((v) => v > 0) ? serieChiusureReale : ESEMPIO_CHART_TRATTE;
  const serieNotifiche = serieNotificheReale.some((v) => v > 0) ? serieNotificheReale : ESEMPIO_CHART_NOTIFICHE;

  const formatDate = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("it-IT") : "—";
  const formatDateTime = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const BadgeEsempio = () => (
    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
      esempio
    </span>
  );

  return (
    <div className={cn("flex h-screen bg-gray-50", isMobile && "flex-col")}>
      <Sidebar />
      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-16 pb-20")}>
        <PageHeader title="Dashboard" subtitle="Panoramica generale della rete irrigua" />

        <div className={isMobile ? "p-4" : "p-6"}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Tratte chiuse */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  Tratte chiuse{usaEsempioChiuse && <BadgeEsempio />}
                </h3>
                <div className="text-4xl font-bold text-red-500 mb-3">{chiuse.length}</div>
                <ul className="divide-y max-h-56 overflow-y-auto">
                  {chiuse.map((c) => (
                    <li key={c.codice} className="flex items-center justify-between py-2 gap-3">
                      <span className="min-w-0">
                        <span className="text-sm">
                          <span className="font-semibold mr-1">{c.codice}</span>
                          <span className="text-gray-600">{c.descrizione ?? ""}</span>
                        </span>
                        {/* Chiusa perché è chiusa la sua madre (un pozzo scelto per
                            intero): senza, sembrerebbe nominata una per una. */}
                        {c.chiusaDaCodice !== null && c.chiusaDaCodice !== c.codice && (
                          <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                            Con la madre {c.chiusaDaCodice}
                          </span>
                        )}
                        {nomeRoggiaMadre(c.codice) !== null && (
                          <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                            {nomeRoggiaMadre(c.codice)}
                          </span>
                        )}
                      </span>
                      <span className="text-right flex-shrink-0">
                        <span className="block text-[10px] uppercase tracking-wide text-gray-400">Chiusa dal</span>
                        {c.notificaId === null ? (
                          <span className="text-xs font-semibold text-red-500">{formatDate(c.chiusaDal)}</span>
                        ) : (
                          <Link href={`/notifiche/${c.notificaId}`} className="text-xs font-semibold text-red-500 hover:underline">
                            {formatDate(c.chiusaDal)}
                          </Link>
                        )}
                      </span>
                    </li>
                  ))}
                  {chiuse.length === 0 && (
                    <li className="py-6 text-center text-sm text-gray-400">Nessuna tratta chiusa</li>
                  )}
                </ul>
              </CardContent>
            </Card>

            {/* Ultime notifiche */}
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  Ultime notifiche{usaEsempioNotifiche && <BadgeEsempio />}
                </h3>
                <ul className="divide-y max-h-56 overflow-y-auto">
                  {ultimeNotifiche.map((notif) => (
                    <li key={notif.id} className="flex items-center justify-between py-2 gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{notif.subject}</div>
                        <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Clock size={10} />
                          {formatDateTime(notif.sentAt ?? ("createdAt" in notif ? notif.createdAt : null))} · {notif.recipientCount} dest.
                        </div>
                      </div>
                      <Link
                        href={usaEsempioNotifiche ? "/notifiche" : `/notifiche/${notif.id}`}
                        className="flex-shrink-0 w-7 h-7 border rounded-md flex items-center justify-center text-primary hover:bg-gray-50"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

          </div>

          {/* Grafici */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  Chiusure — ultimi 30 giorni
                  {serieChiusure === ESEMPIO_CHART_TRATTE && <BadgeEsempio />}
                </h3>
                <BarChart data={serieChiusure} labels={etichette} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                  Notifiche — ultimi 30 giorni
                  {serieNotifiche === ESEMPIO_CHART_NOTIFICHE && <BadgeEsempio />}
                </h3>
                <BarChart data={serieNotifiche} labels={etichette} />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
