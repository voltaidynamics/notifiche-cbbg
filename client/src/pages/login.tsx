import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Waves, Loader2 } from "lucide-react";

export default function Login() {
  const { login, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<{ testo: string; codice: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated → go home
  if (!isLoading && user) {
    setLocation("/");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore(null);
    setSubmitting(true);
    try {
      await login(username, password);
      setLocation("/");
    } catch (err: any) {
      setErrore({
        testo: err.message ?? "Credenziali non valide",
        codice: err.codice ?? "credenzialiNonValide",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Rosso = riprova la password, ambra = non serve, fai altro. `credenzialiNonValide`
  // è l'unico codice per cui riprovare ha senso: negli altri tre (account
  // disabilitato nell'app, non abilitato, servizio di verifica non raggiungibile)
  // ridire la password non cambia niente. Un `codice` mancante o sconosciuto
  // ripiega su questo stesso valore (vedi handleSubmit) e resta quindi rosso: è
  // l'unico caso in cui riprovare è un primo passo ragionevole.
  const CODICE_RIFIUTO_CREDENZIALI = "credenzialiNonValide";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-3">
            <Waves className="text-primary" size={40} />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-800">Notifiche Impianti</CardTitle>
          <p className="text-sm text-gray-500 mt-1">Accedi al pannello di gestione</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                required
              />
            </div>
            {errore && (
              <p
                className={
                  errore.codice === CODICE_RIFIUTO_CREDENZIALI
                    ? "text-sm text-red-600 bg-red-50 px-3 py-2 rounded"
                    : "text-sm text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded"
                }
              >
                {errore.testo}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
              Accedi
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
