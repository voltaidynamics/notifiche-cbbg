/**
 * Mail non recapitate (issue #126): come si classifica un bounce.
 *
 * Sta in `shared/` perché la stessa etichetta la scrivono il server (riepilogo
 * via email) e la pagina (Storico, Impostazioni).
 *
 * Il codice è lo «status» del DSN (RFC 3463, `classe.soggetto.dettaglio`):
 * la classe 5 è permanente, la 4 temporanea. Un temporaneo NON segna il
 * destinatario: Exchange manda l'avviso di ritardo e continua a provare, e se
 * alla fine rinuncia arriva un secondo messaggio, con la classe 5.
 */

export const TIPI_BOUNCE = [
  "indirizzoInesistente",
  "casellaPiena",
  "policy",
  "rifiutato",
  "temporaneo",
  "sconosciuto",
] as const;

export type TipoBounce = (typeof TIPI_BOUNCE)[number];

export const ETICHETTE_TIPO_BOUNCE: Record<TipoBounce, string> = {
  indirizzoInesistente: "Indirizzo inesistente",
  casellaPiena: "Casella piena",
  policy: "Bloccata come spam o per policy",
  rifiutato: "Rifiutata dal server del destinatario",
  temporaneo: "Ritardo temporaneo",
  sconosciuto: "Motivo non indicato",
};

/**
 * `azione` è il campo `Action` del DSN: `delayed` è un ritardo qualunque sia il
 * codice, perché alcuni server mettono un 5.x.x anche negli avvisi di ritardo.
 */
export function classificaBounce(codice: string | null, azione: string | null = null): TipoBounce {
  if ((azione ?? "").toLowerCase() === "delayed") return "temporaneo";
  if (codice === null) return "sconosciuto";
  if (codice.startsWith("4.")) return "temporaneo";
  if (!codice.startsWith("5.")) return "sconosciuto";
  if (codice.startsWith("5.1.")) return "indirizzoInesistente";
  if (codice === "5.2.2") return "casellaPiena";
  if (codice.startsWith("5.7.")) return "policy";
  return "rifiutato";
}

/** Se il bounce rende la mail «non recapitata» nello Storico. */
export function segnaMancatoRecapito(tipo: TipoBounce): boolean {
  return tipo !== "temporaneo";
}

/** «5.1.1 — Indirizzo inesistente»: il testo che lo Storico mostra accanto all'esito. */
export function descriviBounce(codice: string | null, tipo: TipoBounce): string {
  const etichetta = ETICHETTE_TIPO_BOUNCE[tipo];
  return codice ? `${codice} — ${etichetta}` : etichetta;
}

export type AbbinamentoBounce = "messageId" | "indirizzo";

/** Una riga dell'elenco dei bounce in Impostazioni e del riepilogo via email. */
export type RigaBounce = {
  id: number;
  ricevutoAt: string; // ISO
  destinatario: string | null;
  codice: string | null;
  tipo: TipoBounce;
  diagnostica: string | null;
  /** Null = nessuna comunicazione trovata per questo bounce. */
  abbinamento: AbbinamentoBounce | null;
  notificationId: number | null;
  oggettoComunicazione: string | null;
  codiceConduttore: string | null;
  descrizioneConduttore: string | null;
};

/** Un valore letto dal database: quello che non si riconosce vale «sconosciuto». */
export function tipoBounce(v: string | null): TipoBounce {
  return (TIPI_BOUNCE as readonly string[]).includes(v ?? "") ? (v as TipoBounce) : "sconosciuto";
}

/**
 * La riga a partire dal messaggio esaminato e, se abbinato, dal destinatario e
 * dalla sua notifica — uguale per le due implementazioni di IStorage. Un
 * destinatario sparito (comunicazione di prova eliminata) vale come non abbinato.
 */
export function componiRigaBounce(
  b: {
    id: number;
    ricevutoAt: Date;
    destinatario: string | null;
    codice: string | null;
    tipo: string | null;
    diagnostica: string | null;
    abbinamento: string | null;
  },
  destinatario?: { notificationId: number; keykey: string | null; conduttoreDescrizione: string | null } | null,
  notifica?: { subject: string } | null,
): RigaBounce {
  const abbinato = !!destinatario;
  return {
    id: b.id,
    ricevutoAt: new Date(b.ricevutoAt).toISOString(),
    destinatario: b.destinatario,
    codice: b.codice,
    tipo: tipoBounce(b.tipo),
    diagnostica: b.diagnostica,
    abbinamento: abbinato && (b.abbinamento === "messageId" || b.abbinamento === "indirizzo") ? b.abbinamento : null,
    notificationId: destinatario?.notificationId ?? null,
    oggettoComunicazione: notifica?.subject ?? null,
    codiceConduttore: destinatario?.keykey ?? null,
    descrizioneConduttore: destinatario?.conduttoreDescrizione ?? null,
  };
}
