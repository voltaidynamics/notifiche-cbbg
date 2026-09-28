/** Slug delle pagine rimosse, confluiti tutti nella sezione Anagrafiche. */
const SLUG_RIMOSSI = ["consorziati", "tratte", "mappatura-catastale", "importa"];

/**
 * Rimappa gli slug di un gruppo: uno qualsiasi dei quattro rimossi diventa
 * "anagrafiche", una volta sola. L'ordine degli altri slug è preservato.
 */
export function rimappaSlugAnagrafiche(slug: string[]): string[] {
  const out: string[] = [];
  for (const s of slug) {
    const nuovo = SLUG_RIMOSSI.includes(s) ? "anagrafiche" : s;
    if (!out.includes(nuovo)) out.push(nuovo);
  }
  return out;
}
