import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { richiesteAccessoApi, type RichiestaAccesso as RichiestaAccessoRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, Inbox } from "lucide-react";

/**
 * Chi ha superato il bind su Active Directory ma non è fra gli abilitati.
 *
 * Senza un account di servizio non possiamo cercare gli utenti su AD, quindi il
 * superadmin non ha modo di conoscere lo username esatto di dominio — ed è
 * esattamente il disallineamento che manda un operatore legittimo davanti a
 * «non sei abilitato» senza che nessuno capisca perché. Qui lo username lo
 * scrive AD stesso.
 */
export function RichiesteAccesso({ onAbilita }: { onAbilita: (username: string) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // La richiesta è l'unica traccia dello username esatto di dominio: scartarla
  // per errore la fa perdere per sempre, e si recupera solo se la persona
  // riprova ad accedere. Per questo passa da una conferma, come l'eliminazione
  // di un utente qui accanto.
  const [daScartare, setDaScartare] = useState<RichiestaAccessoRow | null>(null);

  const { data: richieste = [], isLoading } = useQuery({
    queryKey: ["admin", "richieste-accesso"],
    queryFn: richiesteAccessoApi.list,
  });

  const scarta = useMutation({
    mutationFn: richiesteAccessoApi.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "richieste-accesso"] });
      toast({ title: "Richiesta scartata" });
    },
    onError: (err: any) => toast({ title: err.message ?? "Errore", variant: "destructive" }),
  });

  return (
    <>
      {isLoading ? (
        <p className="text-sm text-gray-500 py-6">Carico…</p>
      ) : richieste.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <Inbox className="mx-auto mb-2" size={28} />
          <p className="text-sm">Nessuna richiesta in attesa.</p>
          <p className="text-xs mt-1">
            Qui compare chi si autentica correttamente su Active Directory ma non è
            ancora fra gli utenti abilitati.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {richieste.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-3 gap-3">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.username}</p>
                <p className="text-xs text-gray-500">
                  {r.tentativi} {r.tentativi === 1 ? "tentativo" : "tentativi"} · ultimo{" "}
                  {new Date(r.ultimoTentativo).toLocaleString("it-IT")}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" onClick={() => onAbilita(r.username)}>
                  <UserPlus size={14} className="mr-1" /> Abilita
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDaScartare(r)}
                  disabled={scarta.isPending}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!daScartare} onOpenChange={() => setDaScartare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scarta richiesta di accesso</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler scartare la richiesta di "{daScartare?.username}"? Non è
              un'eliminazione recuperabile: se questa persona ha davvero bisogno di accedere,
              la richiesta si ricrea solo facendole ritentare l'accesso da Active Directory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (daScartare) scarta.mutate(daScartare.id); setDaScartare(null); }}
            >
              Scarta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
