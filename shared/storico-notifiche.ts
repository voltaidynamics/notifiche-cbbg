import type {
  Notification,
  NotificationRecipient,
  NotificationHistoryRow,
  NotificationHistoryFilters,
  NotificationRecipientDetail,
} from "@shared/schema";
import { separaTratte } from "@shared/destinatari";

/**
 * Logica pura dello Storico Notifiche.
 *
 * Sta in `shared/` perché la usano le due implementazioni di IStorage. Una
 * regola sola, o "il filtro non funziona" diventa una frase vera solo per metà
 * dei casi.
 */

/** Codice leggibile mostrato in tabella: 42 -> "N00042". */
export function codiceNotifica(id: number): string {
  return `N${String(id).padStart(5, "0")}`;
}

/** Data di riferimento della notifica: quando è partita, altrimenti quando è stata creata. */
export function dataNotifica(n: Pick<Notification, "sentAt" | "createdAt">): Date {
  return n.sentAt ?? n.createdAt;
}

export function toRecipientDetail(r: NotificationRecipient): NotificationRecipientDetail {
  return {
    id: r.id,
    codiceConduttore: r.keykey,
    descrizioneConduttore: r.conduttoreDescrizione,
    codiceRoggia: r.keyroggia,
    descrizioneRoggia: r.roggiaDescrizione,
    sms: r.phone,
    mail: r.email,
    canale: r.canale,
    utenteTest: r.utenteTest,
  };
}

export function buildHistoryRow(
  n: Notification,
  recipients: NotificationRecipient[],
): NotificationHistoryRow {
  // Un destinatario raggiunto da più tratte le porta tutte in un unico campo
  // (issue #5): vanno riseparate, o due tratte conterebbero come una.
  const rogge = new Set<string>();
  for (const r of recipients) {
    for (const codice of separaTratte(r.keyroggia)) rogge.add(codice);
  }
  return {
    id: n.id,
    codice: codiceNotifica(n.id),
    utente: n.createdBy,
    data: dataNotifica(n).toISOString(),
    numRogge: rogge.size,
    // Se i destinatari di dettaglio non sono stati registrati (notifiche
    // precedenti a questa funzionalità) si ripiega sul contatore aggregato.
    numDestinatari: recipients.length || n.recipientCount,
    tipo: n.tipo,
    classificazione: n.classificazione,
    legame: n.legame ?? null,
    subject: n.subject,
    // Con destinatari, e nessuno di essi un conduttore vero. `length > 0`
    // esclude le notifiche senza destinatari: non sono prove, sono
    // comunicazioni che non hanno raggiunto nessuno.
    prova: recipients.length > 0 && recipients.every((r) => r.utenteTest),
  };
}

const contiene = (valore: string | null | undefined, ago: string) =>
  (valore ?? "").toLowerCase().includes(ago);

/**
 * Applica i filtri che dipendono dai destinatari (roggia, destinatario) e quelli
 * semplici su notifica. Restituisce true se la notifica va mostrata.
 */
export function matchHistoryFilters(
  n: Notification,
  recipients: NotificationRecipient[],
  filters: NotificationHistoryFilters,
): boolean {
  const { utente, dataInizio, dataFine, roggia, tipo, classificazione, destinatario } = filters;

  if (utente && !contiene(n.createdBy, utente.toLowerCase())) return false;
  if (tipo && n.tipo !== tipo) return false;
  if (classificazione && n.classificazione !== classificazione) return false;

  const data = dataNotifica(n);
  if (dataInizio) {
    const inizio = new Date(`${dataInizio}T00:00:00`);
    if (!Number.isNaN(inizio.getTime()) && data < inizio) return false;
  }
  if (dataFine) {
    const fine = new Date(`${dataFine}T23:59:59.999`);
    if (!Number.isNaN(fine.getTime()) && data > fine) return false;
  }

  if (roggia) {
    const ago = roggia.toLowerCase();
    const ok = recipients.some(
      (r) => contiene(r.keyroggia, ago) || contiene(r.roggiaDescrizione, ago),
    );
    if (!ok) return false;
  }

  if (destinatario) {
    const ago = destinatario.toLowerCase();
    const ok = recipients.some(
      (r) =>
        contiene(r.keykey, ago) ||
        contiene(r.conduttoreDescrizione, ago) ||
        contiene(r.email, ago) ||
        contiene(r.phone, ago),
    );
    if (!ok) return false;
  }

  return true;
}

/** Raggruppa i destinatari per notifica. */
export function raggruppaPerNotifica(
  recipients: NotificationRecipient[],
): Map<number, NotificationRecipient[]> {
  const out = new Map<number, NotificationRecipient[]>();
  for (const r of recipients) {
    const list = out.get(r.notificationId);
    if (list) list.push(r);
    else out.set(r.notificationId, [r]);
  }
  return out;
}

/** Costruisce lo storico filtrato e ordinato per data decrescente. */
export function costruisciStorico(
  notifs: Notification[],
  recipients: NotificationRecipient[],
  filters: NotificationHistoryFilters,
): NotificationHistoryRow[] {
  const perNotifica = raggruppaPerNotifica(recipients);
  return notifs
    .filter((n) => matchHistoryFilters(n, perNotifica.get(n.id) ?? [], filters))
    .map((n) => buildHistoryRow(n, perNotifica.get(n.id) ?? []))
    .sort((a, b) => b.data.localeCompare(a.data));
}
