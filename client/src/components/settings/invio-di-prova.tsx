import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/**
 * Spedisce un messaggio vero, con le credenziali **salvate** del canale, a un
 * recapito scelto sul momento. I bottoni di prova accanto controllano solo le
 * credenziali (login SMTP, credito SMS): un server può accettarle e poi
 * rifiutare il messaggio, o consegnarlo nello spam.
 *
 * Un solo componente per email, PEC e SMS: tre copie divergerebbero alla prima
 * correzione, come i campi di `CampiPosta`.
 */
export function InvioDiProva({
  id,
  titolo,
  descrizione,
  etichettaCanale,
  tipoCampo,
  placeholder,
  configurata,
  modificheNonSalvate,
  invia,
  titoloSuccesso,
  suggerimento,
}: {
  id: string;
  titolo: string;
  descrizione: ReactNode;
  etichettaCanale: string;
  tipoCampo: "email" | "tel";
  placeholder: string;
  configurata: boolean;
  modificheNonSalvate: boolean;
  invia: (recapito: string) => Promise<{ message: string }>;
  titoloSuccesso: string;
  suggerimento?: string;
}) {
  const { toast } = useToast();
  const [recapito, setRecapito] = useState("");

  const invio = useMutation({
    mutationFn: () => invia(recapito.trim()),
    onSuccess: (r) => {
      toast({ title: titoloSuccesso, description: suggerimento ? `${r.message}. ${suggerimento}` : r.message });
    },
    onError: (e: any) => {
      toast({ title: `${titolo}: invio non riuscito`, description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="mt-6 border-t pt-4 space-y-2">
      <Label htmlFor={id} className="font-medium">{titolo}</Label>
      <p className="text-sm text-gray-600">{descrizione}</p>
      {!configurata && (
        <p className="text-sm text-amber-700">Salva prima le credenziali {etichettaCanale}.</p>
      )}
      {configurata && modificheNonSalvate && (
        <p className="text-sm text-amber-700">
          Hai modifiche non salvate: la prova userà le credenziali salvate, non quelle nel modulo.
        </p>
      )}
      <form
        className="flex flex-col sm:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          invio.mutate();
        }}
      >
        <Input
          id={id}
          type={tipoCampo}
          placeholder={placeholder}
          value={recapito}
          onChange={(e) => setRecapito(e.target.value)}
          className="flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!configurata || recapito.trim() === "" || invio.isPending}
        >
          <Send size={15} className="mr-2" />
          {invio.isPending ? "Invio..." : titolo}
        </Button>
      </form>
    </div>
  );
}
