import { z } from "zod";

/**
 * Requisiti della password di un utente con credenziali **locali** (issue #99),
 * gli stessi del progetto *Vasche di laminazione*. Questo elenco è l'unica
 * definizione: lo schema zod, il messaggio del 400 lato server, lo script
 * `seed:admin` e la checklist sotto il campo password in Gestione Utenti ne
 * derivano tutti. Aggiungere un requisito qui lo aggiunge ovunque.
 *
 * Vale quando una password si imposta o si cambia: quelle già salvate non si
 * toccano. Gli utenti Active Directory non hanno una password nell'app, quindi
 * la regola non li riguarda.
 *
 * «Speciale» è qualunque carattere non alfanumerico ASCII: anche lo spazio e le
 * lettere accentate contano, come in Vasche.
 */
export const LUNGHEZZA_MINIMA_PASSWORD = 12;

export type RequisitoPassword = {
  id: "lunghezza" | "maiuscola" | "minuscola" | "numero" | "speciale";
  /** Per la checklist: «Almeno 12 caratteri». */
  etichetta: string;
  /** Per il messaggio d'errore: «La password deve contenere …». */
  mancanza: string;
  rispettato: (password: string) => boolean;
};

export const REQUISITI_PASSWORD: readonly RequisitoPassword[] = [
  {
    id: "lunghezza",
    etichetta: `Almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri`,
    mancanza: `almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri`,
    rispettato: (p) => p.length >= LUNGHEZZA_MINIMA_PASSWORD,
  },
  {
    id: "maiuscola",
    etichetta: "Una lettera maiuscola",
    mancanza: "una lettera maiuscola",
    rispettato: (p) => /[A-Z]/.test(p),
  },
  {
    id: "minuscola",
    etichetta: "Una lettera minuscola",
    mancanza: "una lettera minuscola",
    rispettato: (p) => /[a-z]/.test(p),
  },
  {
    id: "numero",
    etichetta: "Un numero",
    mancanza: "un numero",
    rispettato: (p) => /[0-9]/.test(p),
  },
  {
    id: "speciale",
    etichetta: "Un carattere speciale",
    mancanza: "un carattere speciale",
    rispettato: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

export function requisitiMancanti(password: string): RequisitoPassword[] {
  return REQUISITI_PASSWORD.filter((r) => !r.rispettato(password));
}

/** `null` se la password va bene, altrimenti un messaggio che elenca tutto quello che manca. */
export function errorePasswordLocale(password: string): string | null {
  const mancanti = requisitiMancanti(password).map((r) => r.mancanza);
  if (mancanti.length === 0) return null;
  const elenco =
    mancanti.length === 1
      ? mancanti[0]
      : `${mancanti.slice(0, -1).join(", ")} e ${mancanti[mancanti.length - 1]}`;
  return `La password deve contenere ${elenco}.`;
}

export const passwordLocaleSchema = z.string().superRefine((password, ctx) => {
  const errore = errorePasswordLocale(password);
  if (errore) ctx.addIssue({ code: z.ZodIssueCode.custom, message: errore });
});
