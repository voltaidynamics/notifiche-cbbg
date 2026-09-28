// Filtro e ordinamento della lista dei template (issue #18). La logica vive qui,
// e non dentro la pagina, perché vitest raggiunge `shared/` ma non `client/`:
// è il motivo per cui selezione-tratte.ts, pur essendo puro, non ha test.

/** Sentinella per l'opzione "tutti": i Select di shadcn non accettano value="". */
export const FILTRO_TUTTI = "__tutti__";

/** Sentinella per i template privi di autore, che in tabella mostrano "—". */
export const UTENTE_NON_INDICATO = "__non_indicato__";

/** I soli campi su cui filtro e ordinamento lavorano. NotificationTemplate li soddisfa. */
export interface TemplateFiltrabile {
  id: number;
  name: string;
  subject: string;
  bodyEmail: string;
  tipoTemplate: string;
  createdBy: string | null;
}

export type ChiaveOrdinamentoTemplate =
  | "id" | "name" | "subject" | "bodyEmail" | "createdBy" | "tipoTemplate";

export interface CriteriTemplate {
  ricerca?: string;
  tipo?: string;
  utente?: string;
}

export function filtraTemplate<T extends TemplateFiltrabile>(
  templates: T[],
  criteri: CriteriTemplate,
): T[] {
  const ricerca = (criteri.ricerca ?? "").trim().toLowerCase();
  const tipo = criteri.tipo;
  const utente = criteri.utente;

  return templates.filter((t) => {
    if (ricerca) {
      const campi = [t.name, t.subject, t.bodyEmail, t.createdBy ?? ""];
      if (!campi.some((c) => c.toLowerCase().includes(ricerca))) return false;
    }
    if (tipo && tipo !== FILTRO_TUTTI && t.tipoTemplate !== tipo) return false;
    if (utente && utente !== FILTRO_TUTTI) {
      if (utente === UTENTE_NON_INDICATO) {
        if (t.createdBy !== null) return false;
      } else if (t.createdBy !== utente) return false;
    }
    return true;
  });
}

export function ordinaTemplate<T extends TemplateFiltrabile>(
  templates: T[],
  chiave: ChiaveOrdinamentoTemplate,
  crescente: boolean,
): T[] {
  const verso = crescente ? 1 : -1;
  return [...templates].sort((a, b) => {
    if (chiave === "id") return (a.id - b.id) * verso;

    const va = a[chiave];
    const vb = b[chiave];
    // Chi non ha autore va in fondo in entrambe le direzioni: un blocco di "—"
    // in testa alla tabella nasconde i dati veri senza dire nulla di utile.
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return String(va).localeCompare(String(vb), "it", { sensitivity: "base" }) * verso;
  });
}

export function utentiDeiTemplate<T extends TemplateFiltrabile>(templates: T[]): string[] {
  const insieme = new Set<string>();
  for (const t of templates) if (t.createdBy) insieme.add(t.createdBy);
  return Array.from(insieme).sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
}
