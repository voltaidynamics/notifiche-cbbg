import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { settingsApi } from "@/lib/api";
import { ETICHETTE_CANALE, type CanaleEmail } from "@shared/canale-email";

/**
 * Spedisce una mail vera, con le credenziali **salvate** del canale, a un
 * indirizzo scelto sul momento. «Test Connessione» prova solo il login: un
 * server può accettarlo e poi rifiutare il messaggio, o consegnarlo nello spam.
 */
export function InviaEmailProva({
  canale,
  configurata,
  modificheNonSalvate,
}: {
  canale: CanaleEmail;
  configurata: boolean;
  modificheNonSalvate: boolean;
}) {
  const { toast } = useToast();
  const [destinatario, setDestinatario] = useState("");
  const etichetta = ETICHETTE_CANALE[canale];

  const invio = useMutation({
    mutationFn: () => settingsApi.inviaEmailProva({ canale, destinatario: destinatario.trim() }),
    onSuccess: (r) => {
      toast({ title: "Mail di prova inviata", description: `${r.message}. Controlla la casella (anche lo spam).` });
    },
    onError: (e: any) => {
      toast({ title: "Mail di prova non inviata", description: e.message, variant: "destructive" });
    },
  });

  const id = `email-prova-${canale}`;
  return (
    <div className="mt-6 border-t pt-4 space-y-2">
      <Label htmlFor={id} className="font-medium">Invia email di test</Label>
      <p className="text-sm text-gray-600">
        Spedisce una mail vera con le credenziali {etichetta} <strong>salvate</strong>, all'indirizzo che scegli.
      </p>
      {!configurata && (
        <p className="text-sm text-amber-700">Salva prima le credenziali {etichetta}.</p>
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
          type="email"
          placeholder="indirizzo@esempio.it"
          value={destinatario}
          onChange={(e) => setDestinatario(e.target.value)}
          className="flex-1"
        />
        <Button
          type="submit"
          variant="outline"
          disabled={!configurata || destinatario.trim() === "" || invio.isPending}
        >
          <Send size={15} className="mr-2" />
          {invio.isPending ? "Invio..." : "Invia email di test"}
        </Button>
      </form>
    </div>
  );
}
