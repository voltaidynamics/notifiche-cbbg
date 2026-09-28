import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStatoAnagrafiche } from "@/hooks/use-sync-anagrafiche";

/**
 * Le due scritte sullo stato delle anagrafiche del consorzio (issue #13).
 *
 * Stanno nell'header, quindi in cima a ogni sezione: chi sta per spedire una
 * comunicazione deve sapere a quando risalgono contatti e legami senza doverli
 * andare a cercare in una pagina diversa. Prima erano una card dentro Invia
 * notifica e una dentro Anagrafiche — visibili solo lì, e assenti proprio dove
 * si guardano i numeri.
 *
 * La seconda riga compare solo mentre un caricamento è davvero in corso: è un
 * avviso, e un avviso sempre acceso non avvisa più di nulla.
 */
export default function StatoAnagrafiche({ className }: { className?: string }) {
  const { inCorso, freschezza } = useStatoAnagrafiche();

  return (
    <div className={cn("text-xs leading-tight", className)}>
      <div className={cn("font-semibold", freschezza.stato === "fresco" ? "text-green-700" : "text-amber-700")}>
        Ultimo aggiornamento anagrafiche: {freschezza.quando}
      </div>
      {inCorso && (
        <div className="text-amber-700 font-semibold flex items-center gap-1 mt-0.5 sm:justify-end">
          <AlertTriangle size={12} />
          Attenzione, dati in corso di aggiornamento
        </div>
      )}
    </div>
  );
}
