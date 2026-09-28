import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ToggleRight } from "lucide-react";
import Sidebar from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { gestioneCodiciApi } from "@/lib/api";
import {
  GERARCHIE_CODICI, ETICHETTE_GERARCHIA,
  type GerarchiaCodice, type RigaGestioneCodice, type RispostaGestioneCodici,
} from "@shared/codici-attivi";

// Gestione Codici (issue #52). Un codice spento sparisce da Invia notifica e
// da Anagrafiche; lo Storico continua a mostrare tutto quello che è partito.
// L'elenco invece è sempre intero: un codice spento che sparisse anche da qui
// non si potrebbe più riaccendere.

const CHIAVE = ["/api/gestione-codici"];

export default function GestioneCodici() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gerarchia, setGerarchia] = useState<GerarchiaCodice>("impianti");
  const [cerca, setCerca] = useState("");

  const { data, isLoading } = useQuery({ queryKey: CHIAVE, queryFn: gestioneCodiciApi.elenco });

  const imposta = useMutation({
    mutationFn: (v: { gerarchia: GerarchiaCodice; codice: string; attivo: boolean }) =>
      gestioneCodiciApi.imposta(v.gerarchia, v.codice, v.attivo),
    // Lo switch si muove subito: con sessanta righe, aspettare il server a
    // ogni clic farebbe sembrare lo switch rotto.
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: CHIAVE });
      const prima = queryClient.getQueryData<RispostaGestioneCodici>(CHIAVE);
      if (prima) {
        queryClient.setQueryData<RispostaGestioneCodici>(CHIAVE, {
          ...prima,
          [v.gerarchia]: prima[v.gerarchia].map((r) => (r.codice === v.codice ? { ...r, attivo: v.attivo } : r)),
        });
      }
      return { prima };
    },
    onError: (error: Error, _v, ctx) => {
      if (ctx?.prima) queryClient.setQueryData(CHIAVE, ctx.prima);
      toast({ title: "Errore", description: error.message || "Salvataggio non riuscito.", variant: "destructive" });
    },
    onSuccess: (r) => {
      toast({ title: r.attivo ? `${r.codice} acceso` : `${r.codice} spento` });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CHIAVE });
      // Tutto quello che le due pagine filtrate leggono: madri, tratte,
      // anteprime dei destinatari, righe delle Anagrafiche.
      queryClient.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey[0];
          return typeof k === "string" && (k.startsWith("/api/consorzio/") || k.startsWith("/api/anagrafiche/"));
        },
      });
    },
  });

  const righe = useMemo(() => {
    const tutte: RigaGestioneCodice[] = data?.[gerarchia] ?? [];
    const ago = cerca.trim().toLowerCase();
    if (!ago) return tutte;
    return tutte.filter((r) => r.codice.toLowerCase().includes(ago) || r.descrizione.toLowerCase().includes(ago));
  }, [data, gerarchia, cerca]);

  const spenti = (g: GerarchiaCodice) => (data?.[g] ?? []).filter((r) => !r.attivo).length;

  return (
    <div className={cn("flex h-screen bg-gray-50", isMobile && "flex-col")}>
      <Sidebar />
      <main className={cn("flex-1 overflow-y-auto", isMobile && "pt-16 pb-20")}>
        <PageHeader
          title="Gestione Codici"
          subtitle="Accendi e spegni impianti e rogge madri: un codice spento non compare in Invia notifica né in Anagrafiche"
          icon={ToggleRight}
        />

        <div className={isMobile ? "p-4" : "p-6"}>
          <Tabs value={gerarchia} onValueChange={(v) => setGerarchia(v as GerarchiaCodice)} className="w-full">
            <TabsList className={cn("grid w-full grid-cols-2", isMobile ? "mb-4" : "mb-6")}>
              {GERARCHIE_CODICI.map((g) => (
                <TabsTrigger key={g} value={g}>
                  {ETICHETTE_GERARCHIA[g]}
                  {spenti(g) > 0 && <span className="ml-2 text-xs text-gray-500">({spenti(g)} spenti)</span>}
                </TabsTrigger>
              ))}
            </TabsList>

            {GERARCHIE_CODICI.map((g) => (
              <TabsContent key={g} value={g}>
                <Card>
                  <CardContent className="p-6">
                    <Input
                      placeholder="Cerca per codice o descrizione"
                      value={cerca}
                      onChange={(e) => setCerca(e.target.value)}
                      className="mb-4 max-w-sm"
                    />
                    <div className="max-h-[600px] overflow-y-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-white">
                          <tr>
                            <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-3 border-b-2">Codice</th>
                            <th className="text-left text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-3 border-b-2">Descrizione</th>
                            <th className="text-right text-[11px] uppercase tracking-wide text-gray-500 font-semibold px-3 py-3 border-b-2">Attivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {isLoading && (
                            <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400">Caricamento…</td></tr>
                          )}
                          {!isLoading && righe.map((r) => (
                            <tr key={r.codice} className={cn("border-b last:border-0", !r.attivo && "bg-gray-50 text-gray-400")}>
                              <td className="px-3 py-2 font-semibold">{r.codice}</td>
                              <td className="px-3 py-2">{r.descrizione || <span className="text-gray-400">—</span>}</td>
                              <td className="px-3 py-2 text-right">
                                <Switch
                                  checked={r.attivo}
                                  aria-label={`${r.attivo ? "Spegni" : "Accendi"} ${r.codice}`}
                                  onCheckedChange={(attivo) => imposta.mutate({ gerarchia: g, codice: r.codice, attivo })}
                                />
                              </td>
                            </tr>
                          ))}
                          {!isLoading && righe.length === 0 && (
                            <tr><td colSpan={3} className="px-3 py-8 text-center text-gray-400">Nessun codice trovato</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 text-xs text-gray-500">{righe.length} codici</div>
                  </CardContent>
                </Card>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>
    </div>
  );
}
